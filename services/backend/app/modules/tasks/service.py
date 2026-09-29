import asyncio
import base64
import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID, uuid4

from sqlalchemy import delete, select, update
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.events import event_bus
from app.infrastructure.storage import storage
from app.modules.files.service import FileService
from app.modules.byok.service import BYOKService
from app.modules.tasks.models import AITask, Answer, TaskImage, TaskStreamToken
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)


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


def _remove_task_objects(
    user_id: UUID, task_id: UUID, uploaded_keys: list[str] | None = None,
) -> bool:
    attempted = set()
    complete = True
    for key in uploaded_keys or []:
        attempted.add(key)
        try:
            storage.delete(key)
        except Exception:
            complete = False
            logger.exception("Failed to remove task input object %s", key)
    prefix = f"task-images/{user_id}/{task_id}/"
    try:
        for item in storage.client.list_objects(storage.bucket, prefix=prefix, recursive=True):
            if item.object_name in attempted:
                continue
            try:
                storage.delete(item.object_name)
            except Exception:
                complete = False
                logger.exception("Failed to remove task input object %s", item.object_name)
    except Exception:
        complete = False
        logger.exception("Failed to list task input objects for %s", task_id)
    return complete


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def _purge_expired_tokens(self) -> None:
        await self.db.execute(
            delete(TaskStreamToken).where(
                TaskStreamToken.expires_at <= datetime.now(timezone.utc)
            )
        )

    async def create(self, user_id: UUID, request: ProcessScreenshotRequest) -> tuple[AITask, str]:
        images = [request.image] if request.image else request.images or []
        runtime_config = None
        settings = get_settings()
        if getattr(settings, "byok_required", False):
            try:
                runtime_config = await BYOKService(self.db).resolve_runtime(user_id, request.mode)
            except ValueError:
                raise
        await self._purge_expired_tokens()
        task = AITask(
            id=uuid4(),
            user_id=user_id,
            client_request_id=request.client_request_id,
            mode=request.mode,
            language=runtime_config["language"] if runtime_config else request.language,
            status="queued",
            stage="queued",
            input_image_count=len(images),
            provider_connection_id=runtime_config["connection_id"] if runtime_config else None,
            user_model_id=runtime_config["model_id"] if runtime_config else None,
            prompt_version_id=runtime_config["prompt_version_id"] if runtime_config else None,
        )
        if request.client_request_id:
            statement = insert(AITask).values(
                id=task.id, user_id=user_id, client_request_id=request.client_request_id,
                mode=request.mode,
                language=runtime_config["language"] if runtime_config else request.language,
                input_image_count=len(images),
                status="queued", stage="queued",
                provider_connection_id=runtime_config["connection_id"] if runtime_config else None,
                user_model_id=runtime_config["model_id"] if runtime_config else None,
                prompt_version_id=runtime_config["prompt_version_id"] if runtime_config else None,
            ).on_conflict_do_nothing(
                index_elements=[AITask.user_id, AITask.client_request_id],
                index_where=AITask.client_request_id.is_not(None),
            ).returning(AITask.id)
            claimed_id = (await self.db.execute(statement)).scalar_one_or_none()
            if claimed_id is None:
                await self.db.rollback()
                return await self._wait_for_existing(user_id, request.client_request_id)
            task = await self.db.get(AITask, claimed_id)
        else:
            self.db.add(task)
            await self.db.flush()

        task_id = task.id
        uploaded_keys: list[str] = []
        try:
            async with self.db.begin_nested():
                file_service = FileService(self.db)
                for ordinal, image in enumerate(images):
                    raw, content_type = decode_image(image)
                    file = await file_service.save_bytes(
                        user_id, raw, content_type, task_id=task_id, prefix="task-images",
                        commit=False, uploaded_keys=uploaded_keys,
                    )
                    self.db.add(TaskImage(task_id=task_id, ordinal=ordinal, stored_file_id=file.id))

                stream_token = secrets.token_urlsafe(32)
                self.db.add(TaskStreamToken(
                    task_id=task_id, token_hash=hash_stream_token(stream_token),
                    expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
                ))
        except BaseException:
            _remove_task_objects(user_id, task_id, uploaded_keys)
            task = await self.db.get(AITask, task_id)
            task.status = "failed"
            task.stage = "error"
            task.error_code = "TASK_INPUT_UPLOAD_FAILED"
            task.error_message = "任务输入上传失败"
            await self.db.commit()
            raise
        # A lost commit acknowledgement is ambiguous: objects may already back a
        # committed task, so do not delete them in this failure path.
        await self.db.commit()
        try:
            await asyncio.to_thread(
                celery_app.send_task, "aivora.run_ai_task",
                args=[str(task.id)], queue="aivora",
            )
        except Exception:
            # An uncertain broker acknowledgement must not initiate a second paid call.
            await self._fail_queued(task.id, "TASK_DISPATCH_UNCERTAIN", "任务派发结果无法确认")
            raise
        try:
            await event_bus.append(task.id, "progress", {}, stage="queued", progress=0)
        except Exception:
            logger.warning("Failed to publish queued event for %s", task.id)
        return task, stream_token

    async def _fail_queued(self, task_id: UUID, code: str, message: str) -> None:
        failed = await self.db.scalar(
            update(AITask).where(AITask.id == task_id, AITask.status == "queued").values(
                status="failed", stage="error", error_code=code, error_message=message,
            ).returning(AITask.id)
        )
        await self.db.commit()
        if failed:
            try:
                await event_bus.append(
                    task_id, "error", {"code": code, "message": message}, stage="error",
                )
            except Exception:
                logger.warning("Failed to publish terminal task event for %s", task_id)

    async def _wait_for_existing(self, user_id: UUID, request_id: str) -> tuple[AITask, str]:
        await self._purge_expired_tokens()
        existing = (await self.db.scalars(select(AITask).where(
            AITask.user_id == user_id, AITask.client_request_id == request_id,
        ))).one()
        stream_token = secrets.token_urlsafe(32)
        self.db.add(TaskStreamToken(
            task_id=existing.id, token_hash=hash_stream_token(stream_token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        ))
        await self.db.commit()
        return existing, stream_token

    async def get_task(self, user_id: UUID, task_id: UUID) -> tuple[AITask, Answer | None]:
        result = await self.db.execute(
            select(AITask).where(AITask.id == task_id, AITask.user_id == user_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError("任务不存在")
        answer_result = await self.db.execute(select(Answer).where(Answer.task_id == task_id))
        return task, answer_result.scalar_one_or_none()

    async def issue_stream_token(self, user_id: UUID, task_id: UUID) -> str:
        await self._purge_expired_tokens()
        task = await self.db.scalar(
            select(AITask).where(AITask.id == task_id, AITask.user_id == user_id)
        )
        if not task:
            raise ValueError("任务不存在")
        token = secrets.token_urlsafe(32)
        self.db.add(TaskStreamToken(
            task_id=task.id,
            token_hash=hash_stream_token(token),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=15),
        ))
        await self.db.commit()
        return token
