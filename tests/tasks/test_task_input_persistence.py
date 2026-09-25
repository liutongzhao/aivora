import asyncio
import base64
import json
import time
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
        persisted = await db.get(AITask, task.id)
        assert persisted.status == "failed"
        assert persisted.error_code == "TASK_INPUT_INTERRUPTED"
        assert persisted.input_cleanup_completed_at is not None
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
async def test_created_cleanup_is_bounded_persistent_and_preserves_failure(
    task_db, dispatch_users, monkeypatch,
):
    from app.modules.tasks import service

    calls = []
    oldest = datetime.now(timezone.utc) - timedelta(hours=1)
    async with task_db() as db:
        rows = [
            AITask(user_id=dispatch_users[0], mode="programming", status="created",
                   stage="created", created_at=oldest + timedelta(seconds=index))
            for index in range(12)
        ]
        db.add_all(rows)
        await db.commit()
        ids = [row.id for row in rows]

    def cleanup(task):
        calls.append(task.id)
        return task.id != ids[0]

    monkeypatch.setattr(service, "_remove_task_objects", cleanup)
    async with task_db() as db:
        assert await service.reconcile_created_tasks(db) == 12
        await db.commit()
        tasks = {task.id: task for task in
                 (await db.scalars(select(AITask).where(AITask.id.in_(ids)))).all()}
        assert all(task.status == "failed" and task.error_code == "TASK_INPUT_INTERRUPTED"
                   for task in tasks.values())
        assert len(calls) <= 10
        assert tasks[ids[0]].input_cleanup_completed_at is None
        assert sum(task.input_cleanup_completed_at is not None for task in tasks.values()) == len(calls) - 1
        first_calls = len(calls)
        assert await service.reconcile_created_tasks(db) == 0
        assert len(calls) > first_calls
        assert calls.count(ids[0]) == 1
        assert len(calls) <= 12

    async with task_db() as db:
        task = await db.get(AITask, ids[0])
        task.input_cleanup_attempted_at = datetime.now(timezone.utc) - timedelta(minutes=10)
        await db.commit()
    monkeypatch.setattr(service, "_remove_task_objects", lambda task: calls.append(task.id) or True)
    async with task_db() as db:
        await service.reconcile_created_tasks(db)
        assert (await db.get(AITask, ids[0])).input_cleanup_completed_at is not None
    assert calls.count(ids[0]) == 2


@pytest.mark.asyncio
async def test_stalled_storage_cleanup_does_not_block_following_task(
    task_db, dispatch_users, monkeypatch,
):
    from app.modules.tasks import service

    ids = []
    async with task_db() as db:
        for index, user in enumerate(dispatch_users[:2]):
            task = AITask(user_id=user, mode="programming", status="created",
                          stage="created",
                          created_at=datetime.now(timezone.utc) - timedelta(hours=2-index))
            db.add(task)
            await db.flush()
            ids.append(task.id)
        await db.commit()

    def slow_first(task):
        if task.id == ids[0]:
            time.sleep(3)
        return True

    monkeypatch.setattr(service, "_remove_task_objects", slow_first)
    started = time.monotonic()
    async with task_db() as db:
        await service.reconcile_created_tasks(db)
        await db.commit()
        assert (await db.get(AITask, ids[0])).input_cleanup_completed_at is None
        assert (await db.get(AITask, ids[1])).input_cleanup_completed_at is not None
    assert time.monotonic() - started < 3


@pytest.mark.asyncio
async def test_late_upload_after_empty_scan_is_removed_on_slow_recheck(
    task_db, dispatch_users,
):
    from app.modules.tasks.service import reconcile_created_tasks

    user = dispatch_users[0]
    async with task_db() as db:
        task = AITask(user_id=user, mode="programming", status="created", stage="created",
                      created_at=datetime.now(timezone.utc) - timedelta(hours=2))
        db.add(task)
        await db.commit()
        task_id = task.id
    async with task_db() as db:
        assert await reconcile_created_tasks(db) == 1
        first_scan = (await db.get(AITask, task_id)).input_cleanup_completed_at
        assert first_scan is not None

    key = f"task-images/{user}/{task_id}/late"
    storage.put_bytes(key, b"late input", "image/png")
    async with task_db() as db:
        assert await reconcile_created_tasks(db) == 0
    assert storage.exists(key)

    async with task_db() as db:
        task = await db.get(AITask, task_id)
        task.input_cleanup_completed_at = datetime.now(timezone.utc) - timedelta(hours=2)
        task.input_cleanup_attempted_at = datetime.now(timezone.utc) - timedelta(hours=2)
        await db.commit()
    async with task_db() as db:
        assert await reconcile_created_tasks(db) == 0
        task = await db.get(AITask, task_id)
        assert task.status == "failed"
        assert task.error_code == "TASK_INPUT_INTERRUPTED"
        assert task.input_cleanup_completed_at > first_scan
    assert not storage.exists(key)


@pytest.mark.asyncio
async def test_old_successful_scans_do_not_starve_failed_cleanup_retry(
    task_db, dispatch_users, monkeypatch,
):
    from app.modules.tasks import service

    now = datetime.now(timezone.utc)
    async with task_db() as db:
        historical = [
            AITask(user_id=dispatch_users[0], mode="programming", status="failed",
                   stage="error", error_code="TASK_INPUT_INTERRUPTED",
                   created_at=now - timedelta(hours=4),
                   input_cleanup_attempted_at=now - timedelta(hours=3),
                   input_cleanup_completed_at=now - timedelta(hours=3))
            for _ in range(12)
        ]
        retry = AITask(
            user_id=dispatch_users[1], mode="programming", status="failed", stage="error",
            error_code="TASK_INPUT_INTERRUPTED", created_at=now - timedelta(hours=2),
            input_cleanup_attempted_at=now - timedelta(minutes=6),
        )
        db.add_all([*historical, retry])
        await db.commit()
        retry_id = retry.id
        old_ids = {task.id for task in historical}

    calls = []
    monkeypatch.setattr(service, "_remove_task_objects", lambda task: calls.append(task.id) or True)
    async with task_db() as db:
        assert await service.reconcile_created_tasks(db) == 0
        assert (await db.get(AITask, retry_id)).input_cleanup_completed_at is not None
    assert retry_id in calls
    assert old_ids.intersection(calls)
    assert len(calls) <= 10


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
