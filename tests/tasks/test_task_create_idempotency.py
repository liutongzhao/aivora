import asyncio
import base64
from uuid import UUID

import pytest
from sqlalchemy import func, select

from app.modules.tasks.models import AITask
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.router import _find_stream_task
from app.modules.tasks.service import TaskService, hash_stream_token


USER_A = UUID("00000000-0000-0000-0000-000000000001")
USER_B = UUID("00000000-0000-0000-0000-000000000002")
IMAGE = base64.b64encode(b"png-bytes").decode()


@pytest.mark.asyncio
async def test_concurrent_same_user_claims_once_and_other_user_is_independent(task_db, dispatch_boundary):
    from app.modules.tasks.models import TaskImage

    request = ProcessScreenshotRequest(images=[IMAGE, IMAGE], client_request_id="same")

    async def create_for(user):
        async with task_db() as db:
            return await TaskService(db).create(user, request)

    (first, first_token), (second, second_token) = await asyncio.gather(
        create_for(USER_A), create_for(USER_A)
    )
    assert first.id == second.id
    assert first_token != second_token
    async with task_db() as db:
        assert await db.scalar(select(func.count()).select_from(AITask).where(
            AITask.user_id == USER_A, AITask.client_request_id == "same"
        )) == 1
        assert (await db.scalars(select(TaskImage.ordinal).where(
            TaskImage.task_id == first.id
        ).order_by(TaskImage.ordinal))).all() == [0, 1]
        task = await db.get(AITask, first.id)
        assert (await _find_stream_task(first.id, first_token, db)).id == first.id
        assert (await _find_stream_task(second.id, second_token, db)).id == second.id
        from app.modules.tasks.models import TaskStreamToken
        token_hashes = set((await db.scalars(select(TaskStreamToken.token_hash).where(
            TaskStreamToken.task_id == first.id
        ))).all())
        assert token_hashes == {hash_stream_token(first_token), hash_stream_token(second_token)}
        assert first_token not in token_hashes and second_token not in token_hashes
    other, _ = await create_for(USER_B)
    assert other.id != first.id
    async with task_db() as db:
        assert (await _find_stream_task(first.id, first_token, db)).id == first.id
    assert len(dispatch_boundary[1]) == 2


@pytest.mark.asyncio
async def test_duplicate_waits_for_created_then_returns_failed_original(task_db, dispatch_boundary, monkeypatch):
    from app.modules.tasks import service

    request = ProcessScreenshotRequest(image=IMAGE, client_request_id="failed-key")
    started = asyncio.Event()
    resume = asyncio.Event()
    original = service.FileService.save_bytes

    async def fail_later(*args, **kwargs):
        started.set()
        await resume.wait()
        raise RuntimeError("upload failed")

    monkeypatch.setattr(service.FileService, "save_bytes", fail_later)
    async def create():
        async with task_db() as db:
            return await TaskService(db).create(USER_A, request)

    first = asyncio.create_task(create())
    await asyncio.wait_for(started.wait(), 5)
    duplicate = asyncio.create_task(create())
    await asyncio.sleep(0.1)
    assert not duplicate.done()
    resume.set()
    with pytest.raises(RuntimeError, match="upload failed"):
        await first
    failed, _ = await asyncio.wait_for(duplicate, 5)
    assert failed.status == "failed"
    monkeypatch.setattr(service.FileService, "save_bytes", original)
    again, _ = await create()
    assert again.id == failed.id
    assert dispatch_boundary[1] == []


@pytest.mark.asyncio
async def test_legacy_single_token_remains_valid_and_expired_token_fails(task_db):
    from datetime import datetime, timedelta, timezone
    from fastapi import HTTPException

    token = "legacy-secret"
    async with task_db() as db:
        legacy = AITask(user_id=USER_A, mode="programming", status="completed",
                        stream_token_hash=hash_stream_token(token),
                        stream_token_expires_at=datetime.now(timezone.utc) + timedelta(minutes=1))
        db.add(legacy)
        await db.commit()
        assert (await _find_stream_task(legacy.id, token, db)).id == legacy.id
        legacy.stream_token_expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
        with pytest.raises(HTTPException) as error:
            await _find_stream_task(legacy.id, token, db)
        assert error.value.status_code == 401
