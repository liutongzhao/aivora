import asyncio
import base64
import json
import logging
from datetime import datetime, timedelta, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select, update

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.infrastructure.events import event_bus
from app.infrastructure.storage import storage
from app.modules.files.models import StoredFile
from app.modules.tasks.models import AITask, Answer, TaskImage
from app.modules.tasks.parser import parse_answer
from app.providers.openai_compatible import OpenAICompatibleProvider
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)
LEASE_DURATION = timedelta(minutes=4)


class ClaimUnavailable(RuntimeError):
    def __init__(self):
        super().__init__("claim unavailable")


def _current_task_where(task_id: UUID, generation: int):
    lease = AITask.lease_state == "running" if generation else AITask.lease_state.is_(None)
    return (
        AITask.id == task_id,
        AITask.dispatch_generation == generation,
        AITask.status.in_(("processing", "streaming")),
        lease,
    )


async def acquire_execution(db, task_id: UUID, generation: int) -> bool:
    now = datetime.now(timezone.utc)
    acquired = await db.scalar(
        update(AITask).where(
            AITask.id == task_id,
            AITask.dispatch_generation == generation,
            AITask.status == "queued",
            AITask.lease_state == "reserved",
            AITask.lease_expires_at > now,
        ).values(
            status="processing", stage="loading_images", progress=10,
            started_at=now, lease_state="running", lease_expires_at=now + LEASE_DURATION,
        ).returning(AITask.id)
    )
    return acquired is not None


async def _acquire_legacy_execution(db, task_id: UUID) -> AITask | None:
    now = datetime.now(timezone.utc)
    task = await db.get(AITask, task_id)
    if not task or task.dispatch_generation != 0 or task.lease_state is not None:
        return None
    acquired = await db.scalar(
        update(AITask).where(
            AITask.id == task_id,
            AITask.dispatch_generation == 0,
            AITask.lease_state.is_(None),
            AITask.status == "queued",
        ).values(
            status="processing", stage="loading_images", progress=10, started_at=now,
        ).returning(AITask.id)
    )
    if acquired is not None:
        task.status = "processing"
        task.stage = "loading_images"
        task.progress = 10
    return task if acquired is not None else None


async def heartbeat_if_current(db, task_id: UUID, generation: int) -> bool:
    now = datetime.now(timezone.utc)
    refreshed = await db.scalar(
        update(AITask).where(*_current_task_where(task_id, generation)).values(
            lease_expires_at=now + LEASE_DURATION,
        ).returning(AITask.id)
    )
    return refreshed is not None


async def finish_if_current(db, task_id: UUID, generation: int, answer: Answer) -> bool:
    finished = await db.scalar(
        update(AITask).where(*_current_task_where(task_id, generation)).values(
            status="completed", stage="completed", progress=100,
            completed_at=datetime.now(timezone.utc), lease_state=None,
            lease_expires_at=None, published_at=None,
        ).returning(AITask.id)
    )
    if finished is None:
        return False
    db.add(answer)
    await db.flush()
    return True


async def _fail_if_current(
    task_id: UUID, generation: int, code: str, message: str,
) -> bool:
    async with session_factory() as db:
        failed = await db.scalar(
            update(AITask).where(*_current_task_where(task_id, generation)).values(
                status="failed", stage="error", error_code=code, error_message=message,
                completed_at=datetime.now(timezone.utc), lease_state=None,
                lease_expires_at=None, published_at=None,
            ).returning(AITask.id)
        )
        await db.commit()
    if failed:
        try:
            await event_bus.append(
                task_id, "error", {"code": code, "message": message}, stage="error",
            )
        except Exception:
            logger.warning("Failed to publish task terminal event for %s", task_id)
    return failed is not None


async def _set_streaming(task_id: UUID, generation: int) -> bool:
    async with session_factory() as db:
        streaming = await db.scalar(
            update(AITask).where(*_current_task_where(task_id, generation)).values(
                status="streaming", stage="ai_streaming", progress=20,
            ).returning(AITask.id)
        )
        await db.commit()
    return streaming is not None


async def _load_task_input(task_id: UUID, redis: Redis | None):
    async with session_factory() as db:
        task = await db.get(AITask, task_id)
        if task is None:
            return None, None, None, None
        rows = (await db.execute(
            select(TaskImage, StoredFile.object_key)
            .join(StoredFile, StoredFile.id == TaskImage.stored_file_id)
            .where(TaskImage.task_id == task_id)
            .order_by(TaskImage.ordinal)
        )).all()
        if rows:
            return task.mode, task.language, [row[1] for row in rows], None
        if redis is None:
            return task.mode, task.language, None, task
    raw_input = await redis.get(f"aivora:task-input:{task_id}")
    if not raw_input:
        raise LookupError("task input expired")
    task_input = json.loads(raw_input)
    return task_input["mode"], task_input.get("language"), task_input["images"], task_input


async def _run_task(task_id: UUID, generation: int | None = None) -> None:
    redis: Redis | None = None
    claimed = False
    legacy_input = False
    active_generation = generation or 0
    try:
        try:
            async with session_factory() as db:
                if generation is None:
                    legacy_task = await _acquire_legacy_execution(db, task_id)
                    claimed = legacy_task is not None
                else:
                    claimed = await acquire_execution(db, task_id, generation)
                await db.commit()
        except Exception as error:
            raise ClaimUnavailable() from error
        if not claimed:
            return

        await event_bus.append(task_id, "progress", {}, stage="loading_images", progress=10)
        settings = get_settings()
        async with session_factory() as db:
            task = await db.get(AITask, task_id)
            durable_images = (await db.scalars(
                select(TaskImage).where(TaskImage.task_id == task_id).order_by(TaskImage.ordinal)
            )).all()
        if task is None:
            return
        redis = None if durable_images else Redis.from_url(settings.redis_url, decode_responses=True)
        legacy_input = not durable_images
        mode, language, image_keys, _ = await _load_task_input(task_id, redis)
        images = []
        for key in image_keys or []:
            data = await asyncio.wait_for(
                asyncio.to_thread(storage.get_bytes, key),
                timeout=settings.task_image_timeout_seconds,
            )
            images.append(f"data:image/png;base64,{base64.b64encode(data).decode()}")

        if not await _set_streaming(task_id, active_generation):
            return
        await event_bus.append(
            task_id, "progress", {"streamingStarted": True},
            stage="ai_streaming", progress=20,
        )
        provider = OpenAICompatibleProvider()
        chunks: list[str] = []
        try:
            async for chunk in provider.stream_answer(images, mode, settings.ai_model, language):
                async with session_factory() as db:
                    current = await heartbeat_if_current(db, task_id, active_generation)
                    await db.commit()
                if not current:
                    return
                if chunk.text:
                    chunks.append(chunk.text)
                    await event_bus.append(
                        task_id, "content", {"content": chunk.text, "append": True},
                        stage="ai_streaming",
                        progress=min(95, 20 + len("".join(chunks)) // 20),
                    )
        except Exception:
            await _fail_if_current(task_id, active_generation, "AI_PROVIDER_ERROR", "模型处理失败")
            return

        content = "".join(chunks)
        parsed_answer = parse_answer(content, mode)
        answer = Answer(
            task_id=task_id, question_type=mode, content=content,
            raw_content=content, parsed=parsed_answer.parsed,
            parse_warning=parsed_answer.warning,
            parse_status="fallback" if parsed_answer.warning else "structured",
        )
        async with session_factory() as db:
            finished = await finish_if_current(db, task_id, active_generation, answer)
            await db.commit()
        if not finished:
            return
        result_payload = {
            "questionType": mode, "content": content, "rawContent": content,
            "parsed": parsed_answer.parsed, "parseWarning": parsed_answer.warning,
        }
        await event_bus.append(
            task_id, "completed", {"result": result_payload, **result_payload},
            stage="completed", progress=100,
        )
    except asyncio.TimeoutError:
        if claimed:
            await _fail_if_current(task_id, active_generation, "TASK_IMAGE_TIMEOUT", "读取任务图片超时")
    except LookupError:
        if claimed:
            await _fail_if_current(task_id, active_generation, "TASK_INPUT_EXPIRED", "任务输入已过期")
    except Exception:
        if claimed:
            try:
                await _fail_if_current(task_id, active_generation, "WORKER_UNCERTAIN", "任务处理失败")
            except Exception:
                logger.warning("Failed to persist task terminal state for %s", task_id)
        else:
            raise ClaimUnavailable() from None
    finally:
        if redis is not None and legacy_input:
            try:
                await redis.delete(f"aivora:task-input:{task_id}")
            except Exception:
                logger.warning("Failed to delete legacy task input for %s", task_id)
        if redis is not None:
            try:
                await redis.aclose()
            except Exception:
                logger.warning("Failed to close task input connection for %s", task_id)


@celery_app.task(name="aivora.run_ai_task", bind=True, max_retries=None)
def run_ai_task(self, task_id: str, generation: int | None = None) -> None:
    try:
        if generation is None:
            asyncio.run(_run_task(UUID(task_id)))
        else:
            asyncio.run(_run_task(UUID(task_id), generation))
    except ClaimUnavailable:
        self.retry(countdown=min(2 ** min(self.request.retries, 6), 60), max_retries=None)
    except Exception:
        logger.warning("Worker stopped without retry for %s", task_id)
