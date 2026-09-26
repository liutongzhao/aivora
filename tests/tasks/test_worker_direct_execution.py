import asyncio
import base64
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select

from app.modules.tasks.models import AITask, Answer
from app.modules.tasks import router
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService
from app.workers import ai_tasks


USER = UUID("00000000-0000-0000-0000-000000000001")


@pytest.mark.asyncio
async def test_only_one_worker_claims_same_task(task_db):
    async with task_db() as db:
        task = AITask(user_id=USER, mode="programming", status="queued", stage="queued")
        db.add(task)
        await db.commit()
        task_id = task.id

    async def claim():
        async with task_db() as db:
            won = await ai_tasks.acquire_execution(db, task_id)
            await db.commit()
            return won

    assert sorted(await asyncio.gather(claim(), claim())) == [False, True]
    async with task_db() as db:
        assert (await db.get(AITask, task_id)).status == "processing"


@pytest.mark.asyncio
async def test_terminal_task_cannot_be_claimed(task_db):
    for status in ("completed", "failed", "cancelled", "processing"):
        async with task_db() as db:
            task = AITask(user_id=USER, mode="programming", status=status, stage=status)
            db.add(task)
            await db.commit()
            assert await ai_tasks.acquire_execution(db, task.id) is False
            assert (await db.scalars(select(Answer).where(Answer.task_id == task.id))).all() == []


@pytest.mark.asyncio
async def test_duplicate_delivery_calls_provider_once(
    task_db, dispatch_boundary, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"image").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER, request)
    calls = []

    class Provider:
        async def stream_answer(self, images, *args):
            calls.append(images)
            yield SimpleNamespace(text='{"answer":"A"}')

    async def append(*args, **kwargs):
        return "1-0"

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"image")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)

    await asyncio.gather(ai_tasks._run_task(task.id), ai_tasks._run_task(task.id))
    async with task_db() as db:
        assert (await db.get(AITask, task.id)).status == "completed"
        assert len((await db.scalars(select(Answer).where(Answer.task_id == task.id))).all()) == 1
    assert len(calls) == 1


@pytest.mark.asyncio
async def test_two_users_tasks_run_concurrently(task_db, dispatch_boundary, monkeypatch):
    users = [USER, UUID("00000000-0000-0000-0000-000000000002")]
    request = ProcessScreenshotRequest(image=base64.b64encode(b"image").decode())
    task_ids = []
    for user in users:
        async with task_db() as db:
            task, _ = await TaskService(db).create(user, request)
            task_ids.append(task.id)

    entered = asyncio.Event()
    release = asyncio.Event()
    active = 0
    peak = 0

    class Provider:
        async def stream_answer(self, images, *args):
            nonlocal active, peak
            active += 1
            peak = max(active, peak)
            if active == 2:
                entered.set()
            await release.wait()
            active -= 1
            yield SimpleNamespace(text='{"answer":"A"}')

    async def append(*args, **kwargs):
        return "1-0"

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"image")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)
    runners = [asyncio.create_task(ai_tasks._run_task(task_id)) for task_id in task_ids]
    try:
        await asyncio.wait_for(entered.wait(), 3)
    finally:
        release.set()
        await asyncio.gather(*runners)
    assert peak == 2


@pytest.mark.asyncio
async def test_cancel_during_stream_discards_answer(task_db, dispatch_boundary, monkeypatch):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"image").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER, request)
    entered = asyncio.Event()
    release = asyncio.Event()

    class Provider:
        async def stream_answer(self, images, *args):
            entered.set()
            await release.wait()
            yield SimpleNamespace(text='{"answer":"A"}')

    async def append(*args, **kwargs):
        return "1-0"

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"image")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)
    monkeypatch.setattr(router.event_bus, "append", append)
    runner = asyncio.create_task(ai_tasks._run_task(task.id))
    try:
        await asyncio.wait_for(entered.wait(), 3)
        async with task_db() as db:
            await router.cancel_task(task.id, SimpleNamespace(id=USER), db)
    finally:
        release.set()
        await runner
    async with task_db() as db:
        assert (await db.get(AITask, task.id)).status == "cancelled"
        assert (await db.scalars(select(Answer).where(Answer.task_id == task.id))).all() == []


@pytest.mark.asyncio
async def test_redelivered_running_task_fails_without_second_provider_call(
    task_db, dispatch_boundary, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"image").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER, request)
        assert await ai_tasks.acquire_execution(db, task.id)
        await db.commit()

    async def append(*args, **kwargs):
        return "1-0"

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)
    assert await ai_tasks.recover_redelivery(task.id) is True
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        assert persisted.status == "failed"
        assert persisted.error_code == "WORKER_LOST_UNCERTAIN"
        assert (await db.scalars(select(Answer).where(Answer.task_id == task.id))).all() == []


@pytest.mark.asyncio
async def test_redelivered_unclaimed_task_remains_queued(task_db, dispatch_boundary):
    async with task_db() as db:
        task = AITask(user_id=USER, mode="programming", status="queued", stage="queued")
        db.add(task)
        await db.commit()
    assert await ai_tasks.recover_redelivery(task.id) is False
    async with task_db() as db:
        assert (await db.get(AITask, task.id)).status == "queued"
