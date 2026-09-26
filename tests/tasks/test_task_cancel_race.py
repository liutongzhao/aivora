import asyncio
import base64
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select, update

from app.modules.tasks import router
from app.modules.tasks.models import AITask, Answer
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService
from app.workers import ai_tasks


USER = UUID("00000000-0000-0000-0000-000000000001")


class NoRedisInput:
    async def get(self, key):
        raise AssertionError("durable worker must not read Redis input")

    async def delete(self, key):
        raise AssertionError("durable worker must not delete Redis input")

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_cancel_after_first_chunk_fences_late_completion(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"cancel-race").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(dispatch_users[3], request)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()

    first_chunk = asyncio.Event()
    release_provider = asyncio.Event()
    events = []

    class Provider:
        async def stream_answer(self, *args):
            yield SimpleNamespace(text='{"answer":"A"}')
            first_chunk.set()
            await release_provider.wait()
            yield SimpleNamespace(text='}')

    async def append(*args, **kwargs):
        events.append((args, kwargs))

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "Redis", SimpleNamespace(from_url=lambda *args, **kwargs: NoRedisInput()))
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"cancel-race")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)

    worker = asyncio.create_task(ai_tasks._run_task(task.id, 1))
    await asyncio.wait_for(first_chunk.wait(), 2)
    async with task_db() as db:
        await router.cancel_task(task.id, SimpleNamespace(id=dispatch_users[3]), db)
    release_provider.set()
    await worker

    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        answers = (await db.scalars(select(Answer).where(Answer.task_id == task.id))).all()
    assert persisted.status == "cancelled"
    assert persisted.dispatch_generation > 1
    assert answers == []
    assert [event[0][1] for event in events].count("completed") == 0
    assert [event[0][1] for event in events].count("cancelled") == 1
