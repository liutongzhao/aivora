import asyncio
import base64
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage import storage
from app.modules.tasks.models import AITask
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService
from app.workers import ai_tasks


USER = "00000000-0000-0000-0000-000000000001"
SECRET = "secret-object-key-and-screenshot-data"


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["image", "progress"])
async def test_claimed_worker_outer_fault_fails_once_without_leaking_input(
    task_db, dispatch_boundary, monkeypatch, fault,
):
    from uuid import UUID

    redis, _ = dispatch_boundary
    async with task_db() as db:
        task, _ = await TaskService(db).create(
            UUID(USER), ProcessScreenshotRequest(image=base64.b64encode(b"sensitive image").decode())
        )

    emitted = []
    calls = []

    async def append(task_id, event_type, data, **kwargs):
        if fault == "progress" and event_type == "progress":
            raise RuntimeError(SECRET)
        emitted.append((event_type, data))

    async def broken_get(key):
        raise RuntimeError(SECRET)

    def broken_image(key):
        raise RuntimeError(SECRET)

    class Provider:
        async def stream_answer(self, *args):
            calls.append(True)
            yield

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    if fault == "redis":
        monkeypatch.setattr(redis, "get", broken_get)
    if fault == "image":
        monkeypatch.setattr(storage, "get_bytes", broken_image)

    try:
        await ai_tasks._run_task(task.id)
    except RuntimeError:
        pass
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        assert persisted.status == "failed"
        assert persisted.stage == "error"
        assert persisted.error_code == "WORKER_UNCERTAIN"
        assert SECRET not in (persisted.error_message or "")
    assert calls == []
    assert emitted[-1][0] == "error"
    assert emitted[-1][1]["code"] == "WORKER_UNCERTAIN"
    assert SECRET not in str(emitted)
    await ai_tasks._run_task(task.id)
    assert calls == []


@pytest.mark.asyncio
async def test_provider_exception_does_not_expose_raw_error(task_db, dispatch_boundary, monkeypatch):
    from uuid import UUID

    async with task_db() as db:
        task, _ = await TaskService(db).create(
            UUID(USER), ProcessScreenshotRequest(image=base64.b64encode(b"private").decode())
        )

    emitted = []

    async def append(task_id, event_type, data, **kwargs):
        emitted.append((event_type, data))

    class Provider:
        async def stream_answer(self, *args):
            raise RuntimeError(SECRET)
            yield

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    await ai_tasks._run_task(task.id)
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        assert persisted.status == "failed"
        assert persisted.error_code == "AI_PROVIDER_ERROR"
        assert SECRET not in (persisted.error_message or "")
    assert emitted[-1][0] == "error"
    assert SECRET not in str(emitted)


def test_legacy_celery_entry_does_not_retry_unknown_exception(monkeypatch):
    attempts = []

    async def broken_run(task_id):
        attempts.append(task_id)
        raise RuntimeError(SECRET)

    def forbidden_retry(*args, **kwargs):
        raise AssertionError("automatic retry must not run")

    monkeypatch.setattr(ai_tasks, "_run_task", broken_run)
    monkeypatch.setattr(ai_tasks.run_ai_task, "retry", forbidden_retry)
    ai_tasks.run_ai_task.run(str(uuid4()))
    assert len(attempts) == 1


@pytest.mark.asyncio
@pytest.mark.parametrize("fault", ["read"])
async def test_preclaim_database_fault_retries_without_reopening_claim(
    task_db, dispatch_boundary, monkeypatch, fault,
):
    from uuid import UUID

    from sqlalchemy import select

    from app.modules.tasks.models import Answer

    async with task_db() as db:
        task, _ = await TaskService(db).create(
            UUID(USER), ProcessScreenshotRequest(image=base64.b64encode(b"claim").decode())
        )

    original_get = AsyncSession.get
    original_commit = AsyncSession.commit
    failed = False
    provider_calls = []

    async def flaky_get(self, entity, ident, *args, **kwargs):
        nonlocal failed
        if fault == "read" and not failed and entity is AITask and ident == task.id:
            failed = True
            raise ConnectionError(SECRET)
        return await original_get(self, entity, ident, *args, **kwargs)

    async def flaky_commit(self):
        nonlocal failed
        if fault.startswith("commit") and not failed:
            failed = True
            if fault == "commit_after_write":
                await original_commit(self)
            raise ConnectionError(SECRET)
        return await original_commit(self)

    class Provider:
        async def stream_answer(self, *args):
            provider_calls.append(True)
            yield type("Chunk", (), {"text": '{"answer":"A"}'})()

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    monkeypatch.setattr(AsyncSession, "get", flaky_get)
    monkeypatch.setattr(AsyncSession, "commit", flaky_commit)
    with pytest.raises(RuntimeError, match="claim unavailable"):
        await ai_tasks._run_task(task.id)
    assert failed
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        assert persisted.status == ("processing" if fault == "commit_after_write" else "queued")

    await ai_tasks._run_task(task.id)
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        answers = (await db.scalars(select(Answer).where(Answer.task_id == task.id))).all()
        if fault == "commit_after_write":
            assert persisted.status == "processing"
            assert answers == []
            assert provider_calls == []
        else:
            assert persisted.status == "completed"
            assert len(answers) == len(provider_calls) == 1


def test_legacy_celery_entry_retries_only_preclaim_fault(monkeypatch):
    attempts = []
    assert ai_tasks.run_ai_task.max_retries is None

    async def unconfirmed_claim(task_id):
        raise ai_tasks.ClaimUnavailable()

    def schedule_retry(*args, **kwargs):
        attempts.append(kwargs)
        raise RuntimeError("retry scheduled")

    monkeypatch.setattr(ai_tasks, "_run_task", unconfirmed_claim)
    monkeypatch.setattr(ai_tasks.run_ai_task, "retry", schedule_retry)
    with pytest.raises(RuntimeError, match="retry scheduled"):
        ai_tasks.run_ai_task.run(str(uuid4()))
    assert len(attempts) == 1
    assert attempts[0]["max_retries"] is None
