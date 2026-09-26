import asyncio
import base64
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import delete, select, update

from app.modules.files.models import StoredFile
from app.modules.tasks.models import AITask, Answer, TaskImage
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService
from app.workers import ai_tasks


USER = UUID("00000000-0000-0000-0000-000000000001")
REQUEST = ProcessScreenshotRequest(image=base64.b64encode(b"lease-image").decode())


async def create_reserved_task(task_db, user):
    async with task_db() as db:
        task, _ = await TaskService(db).create(user, REQUEST)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()
    return task.id, 1


class NoRedisInput:
    async def get(self, key):
        raise AssertionError(f"durable worker must not read Redis input: {key}")

    async def delete(self, key):
        raise AssertionError(f"durable worker must not delete Redis input: {key}")

    async def aclose(self):
        pass


@pytest.mark.asyncio
async def test_duplicate_generation_messages_call_provider_once(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    task_id, generation = await create_reserved_task(task_db, dispatch_users[0])
    calls = 0
    events = []

    class Provider:
        async def stream_answer(self, *args):
            nonlocal calls
            calls += 1
            yield SimpleNamespace(text='{"answer":"A"}')

    async def append(*args, **kwargs):
        events.append((args, kwargs))

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "Redis", SimpleNamespace(from_url=lambda *args, **kwargs: NoRedisInput()))
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"lease-image")

    await asyncio.gather(
        ai_tasks._run_task(task_id, generation),
        ai_tasks._run_task(task_id, generation),
    )

    async with task_db() as db:
        task = await db.get(AITask, task_id)
        answers = (await db.scalars(select(Answer).where(Answer.task_id == task_id))).all()
    assert calls == 1
    assert task.status == "completed"
    assert task.lease_state is None
    assert len(answers) == 1
    assert [event[0][1] for event in events].count("completed") == 1


@pytest.mark.asyncio
async def test_stale_generation_message_exits_without_provider_call(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    task_id, generation = await create_reserved_task(task_db, dispatch_users[1])
    calls = []

    class Provider:
        async def stream_answer(self, *args):
            calls.append(True)
            yield SimpleNamespace(text='{"answer":"A"}')

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    await ai_tasks._run_task(task_id, generation - 1)

    async with task_db() as db:
        task = await db.get(AITask, task_id)
    assert calls == []
    assert task.status == "queued"
    assert task.dispatch_generation == generation


@pytest.mark.asyncio
async def test_durable_creation_leaves_queued_work_for_dispatcher(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    from app.modules.tasks import service

    monkeypatch.setattr(
        service,
        "get_settings",
        lambda: SimpleNamespace(redis_url="redis://unused", task_dispatch_enabled=True),
    )
    request = ProcessScreenshotRequest(
        image=base64.b64encode(b"durable-create").decode(), client_request_id="durable-create"
    )
    async with task_db() as db:
        task, _ = await TaskService(db).create(dispatch_users[2], request)

    assert dispatch_boundary[1] == []
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
    assert persisted.status == "queued"
    assert persisted.lease_state is None


@pytest.mark.asyncio
async def test_legacy_worker_reads_redis_payload_when_task_images_are_missing(
    task_db, dispatch_boundary, monkeypatch,
):
    redis, _ = dispatch_boundary
    request = ProcessScreenshotRequest(image=base64.b64encode(b"legacy-image").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER, request)
        stored_file_id = await db.scalar(
            select(StoredFile.id).where(StoredFile.task_id == task.id)
        )
        await db.execute(delete(TaskImage).where(TaskImage.task_id == task.id))
        await db.commit()

    redis.values[f"aivora:task-input:{task.id}"] = (
        '{"images":["legacy-key"],"mode":"programming","language":null}'
    )
    calls = []

    class Provider:
        async def stream_answer(self, images, *args):
            calls.append(images)
            yield SimpleNamespace(text='{"answer":"A"}')

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(
        ai_tasks,
        "Redis",
        SimpleNamespace(from_url=lambda *args, **kwargs: redis),
    )
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: b"legacy-image")
    monkeypatch.setattr(ai_tasks.event_bus, "append", lambda *args, **kwargs: asyncio.sleep(0))

    await ai_tasks._run_task(task.id)

    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        answers = (await db.scalars(select(Answer).where(Answer.task_id == task.id))).all()
    assert stored_file_id is not None
    assert persisted.status == "completed"
    assert len(answers) == 1
    assert calls == [["data:image/png;base64,bGVnYWN5LWltYWdl"]]
