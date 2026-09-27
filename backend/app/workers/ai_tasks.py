import asyncio
import base64
import logging
import os
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.infrastructure.events import event_bus
from app.infrastructure.storage import storage
from app.modules.files.models import StoredFile
from app.modules.tasks.models import AITask, Answer, TaskImage
from app.modules.tasks.field_stream import FieldProjector
from app.modules.byok.crypto import decrypt_secret
from app.modules.byok.models import ProviderConnection, UserModel, UserPromptVersion
from app.modules.tasks.parser import parse_answer
from app.providers.openai_compatible import OpenAICompatibleProvider
from app.workers.celery_app import celery_app

logger = logging.getLogger(__name__)

class ClaimUnavailable(RuntimeError):
    def __init__(self):
        super().__init__("claim unavailable")


def _current_task_where(task_id: UUID):
    return (
        AITask.id == task_id,
        AITask.status.in_(("processing", "streaming")),
    )


async def acquire_execution(db, task_id: UUID) -> bool:
    now = datetime.now(timezone.utc)
    acquired = await db.scalar(
        update(AITask).where(
            AITask.id == task_id,
            AITask.status == "queued",
        ).values(
            status="processing", stage="loading_images", progress=10,
            started_at=now,
        ).returning(AITask.id)
    )
    return acquired is not None


async def finish_if_current(db, task_id: UUID, answer: Answer) -> bool:
    finished = await db.scalar(
        update(AITask).where(*_current_task_where(task_id)).values(
            status="completed", stage="completed", progress=100,
            completed_at=datetime.now(timezone.utc),
        ).returning(AITask.id)
    )
    if finished is None:
        return False
    db.add(answer)
    await db.flush()
    return True


async def _fail_if_current(task_id: UUID, code: str, message: str) -> bool:
    async with session_factory() as db:
        failed = await db.scalar(
            update(AITask).where(*_current_task_where(task_id)).values(
                status="failed", stage="error", error_code=code, error_message=message,
                completed_at=datetime.now(timezone.utc),
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


async def recover_redelivery(task_id: UUID) -> bool:
    return await _fail_if_current(
        task_id, "WORKER_LOST_UNCERTAIN", "任务执行中断，无法确认模型是否已计费",
    )


async def _set_streaming(task_id: UUID) -> bool:
    async with session_factory() as db:
        streaming = await db.scalar(
            update(AITask).where(*_current_task_where(task_id)).values(
                status="streaming", stage="ai_streaming", progress=20,
            ).returning(AITask.id)
        )
        await db.commit()
    return streaming is not None


async def _confirm_current(task_id: UUID) -> bool:
    async with session_factory() as db:
        current = await db.scalar(
            select(AITask.id).where(*_current_task_where(task_id))
        )
        return current is not None


async def _confirm_provider_call(task_id: UUID) -> bool:
    """Serialize the final cancellation check without holding a lock over streaming."""
    async with session_factory() as db:
        current = await db.scalar(
            select(AITask.id)
            .where(*_current_task_where(task_id))
            .with_for_update()
        )
        await db.commit()
    return current is not None


async def _mark_provider_started(task_id: UUID) -> bool:
    async with session_factory() as db:
        started = await db.scalar(
            update(AITask).where(
                *_current_task_where(task_id),
                AITask.stage == "ai_streaming",
            ).values(stage="provider_started").returning(AITask.id)
        )
        await db.commit()
    return started is not None


async def _append_progress_if_current(
    task_id: UUID, payload: dict, stage: str, progress: int,
) -> bool:
    async with session_factory() as db:
        current = await db.scalar(
            select(AITask.id).where(*_current_task_where(task_id))
            .with_for_update()
        )
        if current is None:
            return False
        await event_bus.append(
            task_id, "progress", payload, stage=stage, progress=progress,
        )
        await db.commit()
    return True


async def _append_content_if_current(
    task_id: UUID, content: str, progress: int,
) -> bool:
    async with session_factory() as db:
        current = await db.scalar(
            select(AITask.id).where(*_current_task_where(task_id))
            .with_for_update()
        )
        if current is None:
            return False
        await event_bus.append(
            task_id, "content", {"content": content, "append": True},
            stage="ai_streaming", progress=progress,
        )
        await db.commit()
    return True


async def _load_task_input(task_id: UUID):
    async with session_factory() as db:
        task = await db.get(AITask, task_id)
        if task is None:
            raise LookupError("task not found")
        rows = (await db.execute(
            select(TaskImage, StoredFile.object_key)
            .join(StoredFile, StoredFile.id == TaskImage.stored_file_id)
            .where(TaskImage.task_id == task_id)
            .order_by(TaskImage.ordinal)
        )).all()
        if not rows:
            raise LookupError("task images missing")
        return task.mode, task.language, [row[1] for row in rows]


async def _load_runtime_config(task_id: UUID):
    async with session_factory() as db:
        task = await db.get(AITask, task_id)
        if not task or not task.provider_connection_id or not task.user_model_id:
            return None
        connection = await db.scalar(select(ProviderConnection).where(
            ProviderConnection.id == task.provider_connection_id,
            ProviderConnection.user_id == task.user_id,
            ProviderConnection.enabled.is_(True),
        ))
        model = await db.scalar(select(UserModel).where(
            UserModel.id == task.user_model_id,
            UserModel.user_id == task.user_id,
            UserModel.enabled.is_(True),
        ))
        if not connection or not model or model.connection_id != connection.id:
            raise LookupError("用户模型配置不可用")
        prompt = None
        if task.prompt_version_id:
            prompt_version = await db.scalar(select(UserPromptVersion).where(
                UserPromptVersion.id == task.prompt_version_id,
                UserPromptVersion.user_id == task.user_id,
                UserPromptVersion.enabled.is_(True),
            ))
            if prompt_version:
                prompt = prompt_version.content
        return {
            "base_url": connection.base_url,
            "api_key": decrypt_secret(connection.api_key_encrypted),
            "model": model.name,
            "language": task.language,
            "prompt": prompt,
        }


async def _run_task(task_id: UUID) -> None:
    claimed = False
    try:
        try:
            async with session_factory() as db:
                claimed = await acquire_execution(db, task_id)
                await db.commit()
        except Exception as error:
            raise ClaimUnavailable() from error
        if not claimed:
            return

        await event_bus.append(task_id, "progress", {}, stage="loading_images", progress=10)
        settings = get_settings()
        async with session_factory() as db:
            task = await db.get(AITask, task_id)
        if task is None:
            return
        runtime_config = await _load_runtime_config(task_id)
        mode, language, image_keys = await _load_task_input(task_id)
        images = []
        for key in image_keys or []:
            data = await asyncio.wait_for(
                asyncio.to_thread(storage.get_bytes, key),
                timeout=settings.task_image_timeout_seconds,
            )
            images.append(f"data:image/png;base64,{base64.b64encode(data).decode()}")

        if not await _set_streaming(task_id):
            return
        if not await _append_progress_if_current(
            task_id, {"streamingStarted": True},
            stage="ai_streaming", progress=20,
        ):
            return
        if not await _confirm_current(task_id):
            return
        if not await _confirm_provider_call(task_id):
            return
        if not await _mark_provider_started(task_id):
            return
        provider = (
            OpenAICompatibleProvider(
                base_url=runtime_config["base_url"],
                api_key=runtime_config["api_key"],
            )
            if runtime_config
            else OpenAICompatibleProvider()
        )
        chunks: list[str] = []
        projector = FieldProjector(mode)
        try:
            async for chunk in provider.stream_answer(
                images,
                mode,
                runtime_config["model"] if runtime_config else settings.ai_model,
                runtime_config["language"] if runtime_config else language,
                runtime_config["prompt"] if runtime_config else None,
            ):
                if not await _confirm_current(task_id):
                    return
                if chunk.text:
                    chunks.append(chunk.text)
                    if not await _append_content_if_current(
                        task_id, chunk.text,
                        min(95, 20 + len("".join(chunks)) // 20),
                    ):
                        return
                    for field_event in projector.feed(chunk.text):
                        await event_bus.append(
                            task_id,
                            field_event.type,
                            {
                                "field": field_event.field,
                                "delta": field_event.delta,
                                "value": field_event.value,
                                "schema_version": 1,
                            },
                            stage="ai_streaming",
                        )
        except Exception:
            await _fail_if_current(task_id, "AI_PROVIDER_ERROR", "模型处理失败")
            return

        content = "".join(chunks)
        parsed_answer = parse_answer(content, mode)
        parse_warning = parsed_answer.warning or projector.finish()
        answer = Answer(
            task_id=task_id, question_type=mode, content=content,
            raw_content=content, parsed=parsed_answer.parsed,
            parse_warning=parse_warning,
            parse_status="fallback" if parse_warning else "structured",
        )
        async with session_factory() as db:
            finished = await finish_if_current(db, task_id, answer)
            await db.commit()
        if not finished:
            return
        result_payload = {
            "questionType": mode, "content": content, "rawContent": content,
            "parsed": parsed_answer.parsed, "parseWarning": parse_warning,
        }
        await event_bus.append(
            task_id, "completed", {"result": result_payload, **result_payload},
            stage="completed", progress=100,
        )
    except asyncio.TimeoutError:
        if claimed:
            await _fail_if_current(task_id, "TASK_IMAGE_TIMEOUT", "读取任务图片超时")
    except LookupError:
        if claimed:
            await _fail_if_current(task_id, "TASK_INPUT_EXPIRED", "任务输入已过期")
    except Exception:
        if claimed:
            try:
                logger.exception("Task worker failed for %s", task_id)
                await _fail_if_current(task_id, "WORKER_UNCERTAIN", "任务处理失败")
            except Exception:
                logger.warning("Failed to persist task terminal state for %s", task_id)
        else:
            raise ClaimUnavailable() from None


_runner: asyncio.Runner | None = None
_runner_pid: int | None = None


def reset_worker_process() -> None:
    global _runner, _runner_pid
    if _runner is not None:
        _runner.close()
    _runner = None
    _runner_pid = None
    from app.infrastructure import database

    database.reset_for_worker_process()
    event_bus.reset_for_worker_process()


@celery_app.task(name="aivora.run_ai_task", bind=True, max_retries=None)
def run_ai_task(self, task_id: str) -> None:
    global _runner, _runner_pid
    if _runner is None or _runner_pid != os.getpid():
        _runner = asyncio.Runner()
        _runner_pid = os.getpid()
    try:
        if (self.request.delivery_info or {}).get("redelivered"):
            if _runner.run(recover_redelivery(UUID(task_id))):
                return
        _runner.run(_run_task(UUID(task_id)))
    except ClaimUnavailable:
        self.retry(countdown=min(2 ** min(self.request.retries, 6), 60), max_retries=None)
    except Exception:
        logger.warning("Worker stopped without retry for %s", task_id)
