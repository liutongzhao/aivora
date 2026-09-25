import asyncio
import base64
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.events import event_bus
from app.infrastructure.storage import storage
from app.modules.files.service import FileService
from app.modules.tasks.models import AITask, Answer, TaskImage
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.workers.celery_app import celery_app


def hash_stream_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def decode_image(value: str) -> tuple[bytes, str]:
    if value.startswith("data:") and "," in value:
        header, encoded = value.split(",", 1)
        content_type = header[5:].split(";", 1)[0] or "image/png"
    else:
        encoded = value
        content_type = "image/png"
    try:
        return base64.b64decode(encoded), content_type
    except Exception as error:
        raise ValueError("图片不是有效的 Base64 数据") from error


def _remove_task_objects(task: AITask, uploaded_keys: list[str] | None = None) -> None:
    for key in uploaded_keys or []:
        storage.delete(key)
    prefix = f"task-images/{task.user_id}/{task.id}/"
    for item in storage.client.list_objects(storage.bucket, prefix=prefix, recursive=True):
        storage.delete(item.object_name)


async def reconcile_created_tasks(
    db: AsyncSession, older_than: timedelta = timedelta(minutes=15)
) -> int:
    cutoff = datetime.now(timezone.utc) - older_than
    rows = (await db.scalars(
        select(AITask).where(AITask.status == "created", AITask.created_at < cutoff)
        .order_by(AITask.created_at).limit(100).with_for_update(skip_locked=True)
    )).all()
    for task in rows:
        task.status = "failed"
        task.stage = "error"
        task.error_code = "TASK_INPUT_INTERRUPTED"
        task.error_message = "任务输入上传中断"
    await db.commit()
    # Include previously failed placeholders whose cleanup was interrupted.
    failed = (await db.scalars(
        select(AITask).where(
            AITask.status == "failed", AITask.error_code == "TASK_INPUT_INTERRUPTED",
        ).order_by(AITask.created_at)
    )).all()
    for task in failed:
        _remove_task_objects(task)
    return len(rows)


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = Redis.from_url(get_settings().redis_url, decode_responses=True)

    async def create(self, user_id: UUID, request: ProcessScreenshotRequest) -> tuple[AITask, str]:
        images = [request.image] if request.image else request.images or []
        task = AITask(
            id=uuid4(),
            user_id=user_id,
            client_request_id=request.client_request_id,
            mode=request.mode,
            language=request.language,
            status="created",
            stage="created",
            input_image_count=len(images),
        )
        if request.client_request_id:
            statement = insert(AITask).values(
                id=task.id, user_id=user_id, client_request_id=request.client_request_id,
                mode=request.mode, language=request.language, status="created", stage="created",
                input_image_count=len(images),
            ).on_conflict_do_nothing(
                index_elements=[AITask.user_id, AITask.client_request_id],
                index_where=AITask.client_request_id.is_not(None),
            ).returning(AITask.id)
            claimed_id = (await self.db.execute(statement)).scalar_one_or_none()
            await self.db.commit()
            if claimed_id is None:
                return await self._wait_for_existing(user_id, request.client_request_id)
            task = await self.db.get(AITask, claimed_id)
        else:
            self.db.add(task)
            await self.db.commit()
            await self.db.refresh(task)

        task_id = task.id
        uploaded_keys: list[str] = []
        image_keys: list[str] = []
        try:
            file_service = FileService(self.db)
            for ordinal, image in enumerate(images):
                raw, content_type = decode_image(image)
                file = await file_service.save_bytes(
                    user_id, raw, content_type, task_id=task.id, prefix="task-images",
                    commit=False, uploaded_keys=uploaded_keys,
                )
                self.db.add(TaskImage(task_id=task.id, ordinal=ordinal, stored_file_id=file.id))
                image_keys.append(file.object_key)

            stream_token = secrets.token_urlsafe(32)
            await self.db.refresh(task, with_for_update=True)
            if task.status != "created":
                raise RuntimeError("任务输入占位已失效")
            task.stream_token_hash = hash_stream_token(stream_token)
            task.stream_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
            task.status = "queued"
            task.stage = "queued"
            await self.db.commit()
        except BaseException:
            await self.db.rollback()
            task = await self.db.get(AITask, task_id)
            if task and task.status == "created":
                task.status = "failed"
                task.stage = "error"
                task.error_code = "TASK_INPUT_INTERRUPTED"
                task.error_message = "任务输入上传失败"
                await self.db.commit()
            _remove_task_objects(task, uploaded_keys)
            raise
        await self.redis.set(
            f"aivora:task-input:{task.id}",
            json.dumps({"images": image_keys, "mode": task.mode, "language": task.language}),
            ex=3600,
        )
        await event_bus.append(task.id, "progress", {}, stage="queued", progress=0)
        celery_app.send_task("aivora.run_ai_task", args=[str(task.id)], queue="aivora")
        return task, stream_token

    async def _wait_for_existing(self, user_id: UUID, request_id: str) -> tuple[AITask, str]:
        while True:
            self.db.expire_all()
            existing = (await self.db.scalars(select(AITask).where(
                AITask.user_id == user_id, AITask.client_request_id == request_id,
            ))).one()
            if existing.status != "created":
                stream_token = secrets.token_urlsafe(32)
                existing.stream_token_hash = hash_stream_token(stream_token)
                existing.stream_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
                await self.db.commit()
                return existing, stream_token
            created_at = existing.created_at
            await self.db.rollback()
            if created_at < datetime.now(timezone.utc) - timedelta(minutes=15):
                await reconcile_created_tasks(self.db)
            await asyncio.sleep(0.05)

    async def get_task(self, user_id: UUID, task_id: UUID) -> tuple[AITask, Answer | None]:
        result = await self.db.execute(
            select(AITask).where(AITask.id == task_id, AITask.user_id == user_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError("任务不存在")
        answer_result = await self.db.execute(select(Answer).where(Answer.task_id == task_id))
        return task, answer_result.scalar_one_or_none()
