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


@pytest.mark.asyncio
async def test_cancel_after_streaming_claim_blocks_first_provider_call(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"before-provider").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(dispatch_users[0], request)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()

    provider_calls = []
    events = []
    original_set_streaming = ai_tasks._set_streaming

    class Provider:
        async def stream_answer(self, *args):
            provider_calls.append(True)
            yield SimpleNamespace(text='{"answer":"A"}')

    async def set_streaming_then_cancel(task_id, generation):
        result = await original_set_streaming(task_id, generation)
        async with task_db() as db:
            await router.cancel_task(task_id, SimpleNamespace(id=dispatch_users[0]), db)
        return result

    async def append(*args, **kwargs):
        events.append((args, kwargs))

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "_set_streaming", set_streaming_then_cancel)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"before-provider")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)

    await ai_tasks._run_task(task.id, 1)

    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
    assert provider_calls == []
    assert persisted.status == "cancelled"
    assert [event[0][1] for event in events].count("content") == 0


@pytest.mark.asyncio
async def test_cancel_after_confirmation_blocks_provider_start(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"after-confirmation").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(dispatch_users[0], request)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()

    provider_calls = []
    original_confirm = ai_tasks._confirm_current

    class Provider:
        async def stream_answer(self, *args):
            provider_calls.append(True)
            yield SimpleNamespace(text='{"answer":"A"}')

    async def confirm_then_cancel(task_id, generation):
        confirmed = await original_confirm(task_id, generation)
        async with task_db() as db:
            await router.cancel_task(task_id, SimpleNamespace(id=dispatch_users[0]), db)
        return confirmed

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "_confirm_current", confirm_then_cancel)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"after-confirmation")

    await ai_tasks._run_task(task.id, 1)

    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
    assert provider_calls == []
    assert persisted.status == "cancelled"


@pytest.mark.asyncio
async def test_cancel_after_heartbeat_blocks_content_event(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"after-heartbeat").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(dispatch_users[1], request)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()

    events = []
    original_append_content = ai_tasks._append_content_if_current

    class Provider:
        async def stream_answer(self, *args):
            yield SimpleNamespace(text='{"answer":"A"}')

    async def cancel_before_content(task_id, generation, content, progress):
        async with task_db() as cancel_db:
            await router.cancel_task(task_id, SimpleNamespace(id=dispatch_users[1]), cancel_db)
        return await original_append_content(task_id, generation, content, progress)

    async def append(*args, **kwargs):
        events.append((args, kwargs))

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "_append_content_if_current", cancel_before_content)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"after-heartbeat")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)

    await ai_tasks._run_task(task.id, 1)

    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
    assert persisted.status == "cancelled"
    assert [event[0][1] for event in events].count("content") == 0


@pytest.mark.asyncio
async def test_content_append_finishes_before_concurrent_cancellation(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    request = ProcessScreenshotRequest(image=base64.b64encode(b"content-lock").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(dispatch_users[2], request)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()

    entered_content = asyncio.Event()
    release_content = asyncio.Event()
    release_provider = asyncio.Event()
    events = []

    class Provider:
        async def stream_answer(self, *args):
            yield SimpleNamespace(text='{"answer":"A"}')
            await release_provider.wait()

    async def append(task_id, event_type, *args, **kwargs):
        if event_type == "content":
            entered_content.set()
            await release_content.wait()
        events.append(event_type)

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"content-lock")
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)

    worker = asyncio.create_task(ai_tasks._run_task(task.id, 1))
    await asyncio.wait_for(entered_content.wait(), 2)

    async def cancel():
        async with task_db() as db:
            await router.cancel_task(task.id, SimpleNamespace(id=dispatch_users[2]), db)

    cancellation = asyncio.create_task(cancel())
    try:
        await asyncio.sleep(0.05)
        assert not cancellation.done()
    finally:
        release_content.set()
        await asyncio.wait_for(cancellation, 2)
        release_provider.set()
        await asyncio.wait_for(worker, 2)

    assert events.index("content") < events.index("cancelled")
    async with task_db() as db:
        assert (await db.get(AITask, task.id)).status == "cancelled"
