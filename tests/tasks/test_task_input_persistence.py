import asyncio
import base64
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage import storage
from app.modules.tasks.models import AITask, Answer, TaskStreamToken
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService, hash_stream_token


USER = UUID("00000000-0000-0000-0000-000000000001")


@pytest.mark.asyncio
async def test_images_persist_in_order_and_legacy_redis_dispatch_remains(task_db, dispatch_boundary):
    from app.modules.tasks.models import TaskImage
    from app.modules.files.models import StoredFile

    request = ProcessScreenshotRequest(
        images=[base64.b64encode(b"first").decode(), base64.b64encode(b"second").decode()]
    )
    async with task_db() as db:
        task, token = await TaskService(db).create(USER, request)
    async with task_db() as db:
        rows = (await db.execute(
            select(TaskImage.ordinal, StoredFile.object_key)
            .join(StoredFile, TaskImage.stored_file_id == StoredFile.id)
            .where(TaskImage.task_id == task.id).order_by(TaskImage.ordinal)
        )).all()
        assert [ordinal for ordinal, _ in rows] == [0, 1]
        assert [storage.get_bytes(key) for _, key in rows] == [b"first", b"second"]
        persisted = await db.get(AITask, task.id)
        assert persisted.status == "queued"
        assert await db.scalar(select(TaskStreamToken.token_hash).where(
            TaskStreamToken.task_id == task.id
        )) == hash_stream_token(token)
    redis, dispatched = dispatch_boundary
    assert json.loads(redis.values[f"aivora:task-input:{task.id}"])["images"] == [
        key for _, key in rows
    ]
    assert len(dispatched) == 1


@pytest.mark.asyncio
async def test_second_upload_failure_cleans_objects_and_never_queues(task_db, dispatch_boundary, monkeypatch):
    original = storage.put_bytes
    calls = 0

    def fail_second(*args):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise RuntimeError("second upload failed")
        return original(*args)

    monkeypatch.setattr(storage, "put_bytes", fail_second)
    request = ProcessScreenshotRequest(images=[
        base64.b64encode(b"one").decode(), base64.b64encode(b"two").decode()
    ], client_request_id="broken")
    async with task_db() as db:
        with pytest.raises(RuntimeError, match="second upload failed"):
            await TaskService(db).create(USER, request)
    async with task_db() as db:
        task = await db.scalar(select(AITask).where(AITask.client_request_id == "broken"))
        assert task.status == "failed"
    assert list(storage.client.list_objects(storage.bucket, prefix=f"task-images/{USER}/{task.id}/",
                                            recursive=True)) == []
    assert dispatch_boundary[1] == []


@pytest.mark.asyncio
async def test_reconcile_stale_created_placeholder_removes_orphan(task_db, dispatch_boundary):
    from app.modules.tasks.service import reconcile_created_tasks

    async with task_db() as db:
        task = AITask(user_id=USER, mode="programming", status="created", stage="created",
                      client_request_id="interrupted",
                      created_at=datetime.now(timezone.utc) - timedelta(hours=1))
        db.add(task)
        await db.commit()
        key = f"task-images/{USER}/{task.id}/orphan"
        storage.put_bytes(key, b"orphan", "image/png")
    async with task_db() as db:
        assert await reconcile_created_tasks(db, older_than=timedelta(minutes=5)) == 1
        assert (await db.get(AITask, task.id)).status == "failed"
    assert not storage.exists(key)
    async with task_db() as db:
        assert await reconcile_created_tasks(db, older_than=timedelta(minutes=5)) == 0
    assert not storage.exists(key)


@pytest.mark.asyncio
async def test_cleanup_failure_preserves_upload_error_and_reconciles_remaining_object(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks.service import reconcile_created_tasks

    original_put = storage.put_bytes
    original_delete = storage.delete
    uploads = 0
    deleted = []

    def fail_after_two_uploads(*args):
        nonlocal uploads
        uploads += 1
        if uploads == 3:
            raise RuntimeError("original upload failure")
        return original_put(*args)

    def fail_first_delete(key):
        if not deleted:
            deleted.append(key)
            raise RuntimeError("cleanup failure")
        deleted.append(key)
        return original_delete(key)

    monkeypatch.setattr(storage, "put_bytes", fail_after_two_uploads)
    monkeypatch.setattr(storage, "delete", fail_first_delete)
    request = ProcessScreenshotRequest(
        images=[base64.b64encode(str(i).encode()).decode() for i in range(3)],
        client_request_id="cleanup-error",
    )
    async with task_db() as db:
        with pytest.raises(RuntimeError, match="original upload failure"):
            await TaskService(db).create(USER, request)
    async with task_db() as db:
        task = await db.scalar(select(AITask).where(AITask.client_request_id == "cleanup-error"))
        assert task.status == "failed"
        assert task.error_code == "TASK_INPUT_INTERRUPTED"
    assert len(deleted) >= 2
    assert len(list(storage.client.list_objects(
        storage.bucket, prefix=f"task-images/{USER}/{task.id}/", recursive=True
    ))) == 1
    monkeypatch.setattr(storage, "delete", original_delete)
    async with task_db() as db:
        assert await reconcile_created_tasks(db) == 0
        assert await reconcile_created_tasks(db) == 0
    assert not storage.exists(deleted[0])


@pytest.mark.asyncio
async def test_redis_write_failure_marks_task_failed_before_dispatch(task_db, dispatch_boundary, monkeypatch):
    redis, dispatched = dispatch_boundary

    async def fail_set(*args, **kwargs):
        raise ConnectionError("redis unavailable")

    monkeypatch.setattr(redis, "set", fail_set)
    request = ProcessScreenshotRequest(image=base64.b64encode(b"redis").decode(),
                                       client_request_id="redis-error")
    async with task_db() as db:
        with pytest.raises(ConnectionError, match="redis unavailable"):
            await TaskService(db).create(USER, request)
    async with task_db() as db:
        task = await db.scalar(select(AITask).where(AITask.client_request_id == "redis-error"))
        assert task.status == "failed"
        assert task.error_code == "TASK_INPUT_REDIS_ERROR"
    assert dispatched == []


@pytest.mark.asyncio
async def test_uncertain_broker_ack_never_retries_or_runs_failed_task(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks import service
    from app.workers import ai_tasks

    sends = []

    def ack_lost(*args, **kwargs):
        sends.append(args)
        raise ConnectionError("ack lost")

    class Provider:
        async def stream_answer(self, *args):
            raise AssertionError("provider must not be called")
            yield

    monkeypatch.setattr(service.celery_app, "send_task", ack_lost)
    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    request = ProcessScreenshotRequest(image=base64.b64encode(b"broker").decode(),
                                       client_request_id="broker-error")
    async with task_db() as db:
        with pytest.raises(ConnectionError, match="ack lost"):
            await TaskService(db).create(USER, request)
    async with task_db() as db:
        task = await db.scalar(select(AITask).where(AITask.client_request_id == "broker-error"))
        assert task.status == "failed"
        assert task.error_code == "TASK_DISPATCH_UNCERTAIN"
    await ai_tasks._run_task(task.id)
    async with task_db() as db:
        assert (await db.get(AITask, task.id)).status == "failed"
        assert await db.scalar(select(Answer).where(Answer.task_id == task.id)) is None
        duplicate, _ = await TaskService(db).create(USER, request)
        assert duplicate.id == task.id
    assert len(sends) == 1


@pytest.mark.asyncio
async def test_legacy_worker_consumes_redis_single_image(task_db, dispatch_boundary, monkeypatch):
    from app.workers import ai_tasks

    class Provider:
        async def stream_answer(self, images, mode, model, language):
            assert images == ["data:image/png;base64," + base64.b64encode(b"legacy").decode()]
            yield SimpleNamespace(text='{"answer":"A"}')

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    request = ProcessScreenshotRequest(image=base64.b64encode(b"legacy").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER, request)
    await ai_tasks._run_task(task.id)
    async with task_db() as db:
        assert (await db.get(AITask, task.id)).status == "completed"
        assert (await db.scalar(select(Answer).where(Answer.task_id == task.id))) is not None


@pytest.mark.asyncio
async def test_worker_loses_queued_claim_when_dispatch_failure_wins_after_read(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks import service
    from app.workers import ai_tasks

    request = ProcessScreenshotRequest(image=base64.b64encode(b"race").decode())
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER, request)

    read_queued = asyncio.Event()
    release_worker = asyncio.Event()
    original_get = AsyncSession.get
    provider_calls = []

    async def pause_after_read(self, entity, ident, *args, **kwargs):
        result = await original_get(self, entity, ident, *args, **kwargs)
        if entity is AITask and ident == task.id and result.status == "queued":
            read_queued.set()
            await release_worker.wait()
        return result

    class Provider:
        async def stream_answer(self, *args):
            provider_calls.append(True)
            yield SimpleNamespace(text='{"answer":"A"}')

    monkeypatch.setattr(AsyncSession, "get", pause_after_read)
    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    worker = asyncio.create_task(ai_tasks._run_task(task.id))
    try:
        await asyncio.wait_for(read_queued.wait(), 5)
        async with task_db() as db:
            await service.TaskService(db)._fail_queued(
                task.id, "TASK_DISPATCH_UNCERTAIN", "任务派发结果无法确认"
            )
    finally:
        release_worker.set()
    await asyncio.wait_for(worker, 5)
    async with task_db() as db:
        persisted = await db.get(AITask, task.id)
        assert persisted.status == "failed"
        assert persisted.error_code == "TASK_DISPATCH_UNCERTAIN"
        assert await db.scalar(select(Answer).where(Answer.task_id == task.id)) is None
    assert provider_calls == []
