import base64
import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.infrastructure.events import event_bus
from app.modules.files.service import FileService
from app.modules.tasks.models import AITask, Answer
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


class TaskService:
    def __init__(self, db: AsyncSession):
        self.db = db
        self.redis = Redis.from_url(get_settings().redis_url, decode_responses=True)

    async def create(self, user_id: UUID, request: ProcessScreenshotRequest) -> tuple[AITask, str]:
        if request.client_request_id:
            existing_result = await self.db.execute(
                select(AITask).where(
                    AITask.user_id == user_id,
                    AITask.client_request_id == request.client_request_id,
                )
            )
            existing = existing_result.scalar_one_or_none()
            if existing and existing.stream_token_hash:
                return existing, ""

        images = [request.image] if request.image else request.images or []
        task = AITask(
            user_id=user_id,
            client_request_id=request.client_request_id,
            mode=request.mode,
            language=request.language,
            status="queued",
            stage="queued",
            input_image_count=len(images),
        )
        self.db.add(task)
        await self.db.commit()
        await self.db.refresh(task)

        image_keys: list[str] = []
        file_service = FileService(self.db)
        for image in images:
            raw, content_type = decode_image(image)
            file = await file_service.save_bytes(
                user_id,
                raw,
                content_type,
                task_id=task.id,
                prefix="task-images",
            )
            image_keys.append(file.object_key)

        stream_token = secrets.token_urlsafe(32)
        task.stream_token_hash = hash_stream_token(stream_token)
        task.stream_token_expires_at = datetime.now(timezone.utc) + timedelta(minutes=15)
        await self.db.commit()
        await self.redis.set(
            f"aivora:task-input:{task.id}",
            json.dumps({"images": image_keys, "mode": task.mode, "language": task.language}),
            ex=3600,
        )
        await event_bus.append(task.id, "progress", {}, stage="queued", progress=0)
        celery_app.send_task("aivora.run_ai_task", args=[str(task.id)])
        return task, stream_token

    async def get_task(self, user_id: UUID, task_id: UUID) -> tuple[AITask, Answer | None]:
        result = await self.db.execute(
            select(AITask).where(AITask.id == task_id, AITask.user_id == user_id)
        )
        task = result.scalar_one_or_none()
        if not task:
            raise ValueError("任务不存在")
        answer_result = await self.db.execute(select(Answer).where(Answer.task_id == task_id))
        return task, answer_result.scalar_one_or_none()
