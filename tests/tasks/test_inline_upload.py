import base64
from uuid import UUID

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.storage import storage
from app.modules.tasks.models import AITask
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService


USER = UUID("00000000-0000-0000-0000-000000000001")


@pytest.mark.asyncio
async def test_upload_is_not_committed_before_all_images_exist(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks import service

    seen = []
    original = service.FileService.save_bytes

    async def inspect_before_upload(file_service, *args, **kwargs):
        async with task_db() as db:
            rows = (await db.scalars(select(AITask).where(
                AITask.client_request_id == "atomic-upload"
            ))).all()
            seen.append(len(rows))
        return await original(file_service, *args, **kwargs)

    monkeypatch.setattr(service.FileService, "save_bytes", inspect_before_upload)
    request = ProcessScreenshotRequest(
        images=[base64.b64encode(value).decode() for value in (b"one", b"two")],
        client_request_id="atomic-upload",
    )
    async with task_db() as db:
        await TaskService(db).create(USER, request)
    assert seen == [0, 0]


@pytest.mark.asyncio
async def test_failed_upload_removes_objects_without_dispatch(task_db, dispatch_boundary, monkeypatch):
    original = storage.put_bytes
    count = 0

    def fail_second(*args):
        nonlocal count
        count += 1
        if count == 2:
            raise RuntimeError("upload failed")
        return original(*args)

    monkeypatch.setattr(storage, "put_bytes", fail_second)
    request = ProcessScreenshotRequest(
        images=[base64.b64encode(value).decode() for value in (b"one", b"two")],
        client_request_id="failed-upload",
    )
    async with task_db() as db:
        with pytest.raises(RuntimeError, match="upload failed"):
            await TaskService(db).create(USER, request)
    async with task_db() as db:
        failed = await db.scalar(select(AITask).where(AITask.client_request_id == "failed-upload"))
        assert failed.status == "failed"
        assert failed.error_code == "TASK_INPUT_UPLOAD_FAILED"
        assert list(storage.client.list_objects(
            storage.bucket, prefix=f"task-images/{USER}/{failed.id}/", recursive=True,
        )) == []
    assert dispatch_boundary[1] == []


@pytest.mark.asyncio
async def test_database_commit_failure_preserves_original_error(
    task_db, dispatch_boundary, monkeypatch,
):
    original = AsyncSession.commit
    raised = False

    async def fail_once(db):
        nonlocal raised
        if not raised:
            raised = True
            raise ConnectionError("database unavailable")
        return await original(db)

    monkeypatch.setattr(AsyncSession, "commit", fail_once)
    request = ProcessScreenshotRequest(image=base64.b64encode(b"image").decode())
    async with task_db() as db:
        with pytest.raises(ConnectionError, match="database unavailable"):
            await TaskService(db).create(USER, request)
    assert dispatch_boundary[1] == []


@pytest.mark.asyncio
async def test_uncertain_commit_does_not_delete_persisted_images(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.files.models import StoredFile

    original = AsyncSession.commit
    raised = False

    async def ack_lost(db):
        nonlocal raised
        await original(db)
        if not raised:
            raised = True
            raise ConnectionError("commit acknowledgement lost")

    monkeypatch.setattr(AsyncSession, "commit", ack_lost)
    request = ProcessScreenshotRequest(
        image=base64.b64encode(b"image").decode(), client_request_id="ack-lost",
    )
    async with task_db() as db:
        with pytest.raises(ConnectionError, match="commit acknowledgement lost"):
            await TaskService(db).create(USER, request)
    async with task_db() as db:
        task = await db.scalar(select(AITask).where(AITask.client_request_id == "ack-lost"))
        file = await db.scalar(select(StoredFile).where(StoredFile.task_id == task.id))
    assert task.status == "queued"
    assert storage.exists(file.object_key)
    assert dispatch_boundary[1] == []
