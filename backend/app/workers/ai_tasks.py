import asyncio
import base64
from datetime import datetime, timezone
from uuid import UUID

from redis.asyncio import Redis
from sqlalchemy import select

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.infrastructure.events import event_bus
from app.infrastructure.storage import storage
from app.modules.tasks.models import AITask, Answer
from app.modules.tasks.parser import parse_answer
from app.providers.openai_compatible import OpenAICompatibleProvider
from app.workers.celery_app import celery_app


async def _run_task(task_id: UUID) -> None:
    redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    async with session_factory() as db:
        task = await db.get(AITask, task_id)
        if not task or task.status in {"completed", "cancelled"}:
            return
        task.status = "processing"
        task.stage = "loading_images"
        task.started_at = datetime.now(timezone.utc)
        await db.commit()
        await event_bus.append(task_id, "progress", {}, stage="loading_images", progress=10)

        raw_input = await redis.get(f"aivora:task-input:{task_id}")
        if not raw_input:
            task.status = "failed"
            task.error_code = "TASK_INPUT_EXPIRED"
            task.error_message = "任务输入已过期"
            await db.commit()
            await event_bus.append(task_id, "error", {"message": task.error_message}, stage="error")
            return

        import json

        task_input = json.loads(raw_input)
        images = []
        for key in task_input["images"]:
            data = storage.get_bytes(key)
            images.append(f"data:image/png;base64,{base64.b64encode(data).decode()}")

        provider = OpenAICompatibleProvider()
        task.status = "streaming"
        task.stage = "ai_streaming"
        await db.commit()
        await event_bus.append(
            task_id,
            "progress",
            {"streamingStarted": True},
            stage="ai_streaming",
            progress=20,
        )

        chunks: list[str] = []
        try:
            async for chunk in provider.stream_answer(
                images,
                task_input["mode"],
                get_settings().ai_model,
                task_input.get("language"),
            ):
                if chunk.text:
                    chunks.append(chunk.text)
                    await event_bus.append(
                        task_id,
                        "content",
                        {"content": chunk.text, "append": True},
                        stage="ai_streaming",
                        progress=min(95, 20 + len("".join(chunks)) // 20),
                    )
            content = "".join(chunks)
            parsed_answer = parse_answer(content, task.mode)
            task.status = "completed"
            task.stage = "completed"
            task.progress = 100
            task.completed_at = datetime.now(timezone.utc)
            db.add(
                Answer(
                    task_id=task_id,
                    question_type=task.mode,
                    content=content,
                    raw_content=content,
                    parsed=parsed_answer.parsed,
                    parse_warning=parsed_answer.warning,
                    parse_status="fallback" if parsed_answer.warning else "structured",
                )
            )
            await db.commit()
            await event_bus.append(
                task_id,
                "completed",
                {
                    "questionType": task.mode,
                    "content": content,
                    "rawContent": content,
                    "parsed": parsed_answer.parsed,
                    "parseWarning": parsed_answer.warning,
                },
                stage="completed",
                progress=100,
            )
        except Exception as error:
            task.status = "failed"
            task.stage = "error"
            task.error_code = "AI_PROVIDER_ERROR"
            task.error_message = str(error)[:1000]
            await db.commit()
            await event_bus.append(
                task_id,
                "error",
                {"message": task.error_message, "code": task.error_code},
                stage="error",
                progress=task.progress,
            )
        finally:
            await redis.delete(f"aivora:task-input:{task_id}")
            await redis.aclose()


@celery_app.task(name="aivora.run_ai_task", bind=True, max_retries=2)
def run_ai_task(self, task_id: str) -> None:
    try:
        asyncio.run(_run_task(UUID(task_id)))
    except Exception as error:
        raise self.retry(exc=error, countdown=5)
