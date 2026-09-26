import base64
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select

from app.modules.tasks.models import AITask, TaskStreamToken
from app.modules.tasks.schemas import ProcessScreenshotRequest
from app.modules.tasks.service import TaskService


USER_A = UUID("00000000-0000-0000-0000-000000000001")
USER_B = UUID("00000000-0000-0000-0000-000000000002")
REQUEST = ProcessScreenshotRequest(image=base64.b64encode(b"image").decode())


@pytest.mark.asyncio
async def test_create_publishes_durable_task_immediately_for_each_user(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks import service

    monkeypatch.setattr(
        service, "get_settings",
        lambda: SimpleNamespace(redis_url="redis://unused", task_dispatch_enabled=True, byok_required=False),
    )
    for user in (USER_A, USER_B):
        async with task_db() as db:
            task, token = await TaskService(db).create(user, REQUEST)
            assert token
        async with task_db() as db:
            persisted = await db.get(AITask, task.id)
            assert persisted.status == "queued"
    _, sent = dispatch_boundary
    assert len(sent) == 2
    assert all(name == "aivora.run_ai_task" for name, _ in sent)
    assert all(len(args["args"]) == 1 and args["queue"] == "aivora" for _, args in sent)


@pytest.mark.asyncio
async def test_broker_failure_marks_task_failed(task_db, dispatch_boundary, monkeypatch):
    from app.modules.tasks import service

    def unavailable(*args, **kwargs):
        raise ConnectionError("broker unavailable")

    monkeypatch.setattr(service.celery_app, "send_task", unavailable)
    request = ProcessScreenshotRequest(image=REQUEST.image, client_request_id="broker-failure")
    async with task_db() as db:
        with pytest.raises(ConnectionError):
            await TaskService(db).create(USER_A, request)
    async with task_db() as db:
        persisted = await db.scalar(select(AITask).where(AITask.client_request_id == "broker-failure"))
        assert persisted.status == "failed"
        assert persisted.error_code == "TASK_DISPATCH_UNCERTAIN"


@pytest.mark.asyncio
async def test_event_bus_failure_does_not_prevent_enqueuing(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks import service

    async def unavailable(*args, **kwargs):
        raise ConnectionError("event stream unavailable")

    monkeypatch.setattr(service.event_bus, "append", unavailable)
    async with task_db() as db:
        task, _ = await TaskService(db).create(USER_A, REQUEST)
    assert dispatch_boundary[1] == [
        ("aivora.run_ai_task", {"args": [str(task.id)], "queue": "aivora"})
    ]


@pytest.mark.asyncio
async def test_byok_is_required_independent_of_dispatch_mode(
    task_db, dispatch_boundary, monkeypatch,
):
    from app.modules.tasks import service

    monkeypatch.setattr(
        service, "get_settings",
        lambda: SimpleNamespace(redis_url="redis://unused", byok_required=True),
    )
    async with task_db() as db:
        with pytest.raises(ValueError, match="配置模型"):
            await TaskService(db).create(USER_A, REQUEST)
    assert dispatch_boundary[1] == []


@pytest.mark.asyncio
async def test_new_task_purges_expired_stream_tokens(task_db, dispatch_boundary):
    async with task_db() as db:
        first, _ = await TaskService(db).create(USER_A, REQUEST)
        token = await db.scalar(select(TaskStreamToken).where(TaskStreamToken.task_id == first.id))
        token.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        await db.commit()
    async with task_db() as db:
        await TaskService(db).create(USER_B, REQUEST)
    async with task_db() as db:
        assert await db.scalar(select(TaskStreamToken).where(TaskStreamToken.task_id == first.id)) is None
