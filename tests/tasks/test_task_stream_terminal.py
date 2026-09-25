import asyncio
import base64
import json
from types import SimpleNamespace
from uuid import UUID

import pytest

from app.modules.tasks import router, service
from app.modules.tasks.models import AITask, Answer
from app.modules.tasks.schemas import ProcessScreenshotRequest


USER = UUID("00000000-0000-0000-0000-000000000001")
REQUEST = ProcessScreenshotRequest(image=base64.b64encode(b"stream").decode())


def event_data(frame: str) -> dict:
    return json.loads(frame.split("data: ", 1)[1].split("\n", 1)[0])


@pytest.mark.asyncio
async def test_initially_failed_task_terminates_stream_without_redis_event(
    task_db, dispatch_boundary, monkeypatch,
):
    async with task_db() as db:
        task, token = await service.TaskService(db).create(USER, REQUEST)
        await service.TaskService(db)._fail_queued(
            task.id, "TASK_DISPATCH_UNCERTAIN", "任务派发结果无法确认"
        )

    async def no_events(*args):
        return []

    async def idle(*args):
        await asyncio.Event().wait()
        yield {}

    monkeypatch.setattr(router.event_bus, "read_after", no_events)
    monkeypatch.setattr(router.event_bus, "listen", idle)
    request = SimpleNamespace(headers={}, is_disconnected=lambda: False)
    async with task_db() as db:
        response = await router.stream_task(task.id, request, token, db)
        stream = response.body_iterator
        assert event_data(await anext(stream))["type"] == "connected"
        terminal = event_data(await asyncio.wait_for(anext(stream), 1))
        assert terminal["type"] == "error"
        assert terminal["data"]["code"] == "TASK_DISPATCH_UNCERTAIN"
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(stream), 1)


@pytest.mark.asyncio
async def test_completed_database_fallback_keeps_nested_and_flat_result(
    task_db, dispatch_boundary, monkeypatch,
):
    async with task_db() as db:
        task, token = await service.TaskService(db).create(USER, REQUEST)
        persisted = await db.get(AITask, task.id)
        persisted.status = "completed"
        persisted.stage = "completed"
        db.add(Answer(task_id=task.id, question_type="single_choice",
                      content="A", raw_content="A", parsed={"answer": "A"}))
        await db.commit()

    async def no_events(*args):
        return []

    monkeypatch.setattr(router.event_bus, "read_after", no_events)
    async with task_db() as db:
        response = await router.stream_task(
            task.id, SimpleNamespace(headers={}, is_disconnected=lambda: False), token, db
        )
        stream = response.body_iterator
        assert event_data(await anext(stream))["type"] == "connected"
        terminal = event_data(await asyncio.wait_for(anext(stream), 1))
        assert terminal["type"] == "completed"
        assert terminal["data"]["result"]["parsed"] == {"answer": "A"}
        assert terminal["data"]["parsed"] == {"answer": "A"}


@pytest.mark.asyncio
async def test_pending_stream_notices_failed_database_status_on_heartbeat(
    task_db, dispatch_boundary, monkeypatch,
):
    async with task_db() as db:
        task, token = await service.TaskService(db).create(USER, REQUEST)

    heartbeat = asyncio.Event()

    async def no_events(*args):
        return []

    async def listen(*args):
        await heartbeat.wait()
        yield {"type": "heartbeat", "task_id": str(task.id), "data": {}}
        await asyncio.Event().wait()

    monkeypatch.setattr(router.event_bus, "read_after", no_events)
    monkeypatch.setattr(router.event_bus, "listen", listen)
    request = SimpleNamespace(headers={}, is_disconnected=lambda: asyncio.sleep(0, result=False))
    async with task_db() as db:
        response = await router.stream_task(task.id, request, token, db)
        stream = response.body_iterator
        assert event_data(await anext(stream))["type"] == "connected"
        pending = asyncio.create_task(anext(stream))
        await asyncio.sleep(0)
        async with task_db() as writer:
            await service.TaskService(writer)._fail_queued(
                task.id, "TASK_INPUT_REDIS_ERROR", "任务输入发布失败"
            )
        heartbeat.set()
        terminal = event_data(await asyncio.wait_for(pending, 1))
        assert terminal["type"] == "error"
        assert terminal["data"]["code"] == "TASK_INPUT_REDIS_ERROR"
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(stream), 1)


@pytest.mark.asyncio
async def test_redis_read_failure_uses_database_terminal_and_hides_exception(
    task_db, dispatch_boundary, monkeypatch,
):
    async with task_db() as db:
        task, token = await service.TaskService(db).create(USER, REQUEST)
        await service.TaskService(db)._fail_queued(
            task.id, "TASK_INPUT_REDIS_ERROR", "任务输入发布失败"
        )

    async def broken(*args):
        raise ConnectionError("redis password secret-123")

    monkeypatch.setattr(router.event_bus, "read_after", broken)
    request = SimpleNamespace(headers={}, is_disconnected=lambda: False)
    async with task_db() as db:
        response = await router.stream_task(task.id, request, token, db)
        stream = response.body_iterator
        assert event_data(await anext(stream))["type"] == "connected"
        frame = await asyncio.wait_for(anext(stream), 1)
        assert event_data(frame)["type"] == "error"
        assert "secret-123" not in frame


@pytest.mark.asyncio
async def test_redis_read_failure_on_pending_task_ends_stream_without_leaking_secret(
    task_db, dispatch_boundary, monkeypatch,
):
    async with task_db() as db:
        task, token = await service.TaskService(db).create(USER, REQUEST)

    async def broken(*args):
        raise ConnectionError("redis password secret-789")

    monkeypatch.setattr(router.event_bus, "read_after", broken)
    async with task_db() as db:
        response = await router.stream_task(
            task.id, SimpleNamespace(headers={}, is_disconnected=lambda: False), token, db
        )
        stream = response.body_iterator
        assert event_data(await anext(stream))["type"] == "connected"
        frame = await asyncio.wait_for(anext(stream), 1)
        assert event_data(frame)["data"]["code"] == "STREAM_UNAVAILABLE"
        assert "secret-789" not in frame
        with pytest.raises(StopAsyncIteration):
            await asyncio.wait_for(anext(stream), 1)


@pytest.mark.asyncio
async def test_dispatch_failure_best_effort_emits_error_without_raw_broker_exception(
    task_db, dispatch_boundary, monkeypatch,
):
    emitted = []

    async def append(*args, **kwargs):
        emitted.append(args)

    def lost_ack(*args, **kwargs):
        raise ConnectionError("broker password secret-456")

    monkeypatch.setattr(service.event_bus, "append", append)
    monkeypatch.setattr(service.celery_app, "send_task", lost_ack)
    async with task_db() as db:
        with pytest.raises(ConnectionError):
            await service.TaskService(db).create(USER, REQUEST)
    assert any(args[1] == "error" and args[2]["code"] == "TASK_DISPATCH_UNCERTAIN"
               and "secret-456" not in str(args) for args in emitted)


@pytest.mark.asyncio
async def test_terminal_event_publish_failure_does_not_mask_broker_error(
    task_db, dispatch_boundary, monkeypatch,
):
    async def broken_append(*args, **kwargs):
        raise ConnectionError("event stream offline")

    def lost_ack(*args, **kwargs):
        raise RuntimeError("original broker error")

    # Allow the queued progress event, then fail the terminal event.
    calls = 0

    async def append(*args, **kwargs):
        nonlocal calls
        calls += 1
        if calls == 2:
            await broken_append(*args, **kwargs)

    monkeypatch.setattr(service.event_bus, "append", append)
    monkeypatch.setattr(service.celery_app, "send_task", lost_ack)
    async with task_db() as db:
        with pytest.raises(RuntimeError, match="original broker error"):
            await service.TaskService(db).create(USER, REQUEST)
