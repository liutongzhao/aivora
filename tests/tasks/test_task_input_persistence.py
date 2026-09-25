import base64
import json
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select

from app.infrastructure.storage import storage
from app.modules.tasks.models import AITask, Answer
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
        assert persisted.stream_token_hash == hash_stream_token(token)
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
