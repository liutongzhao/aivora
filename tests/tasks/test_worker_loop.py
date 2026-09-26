import asyncio
import base64
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from uuid import UUID

import pytest
from sqlalchemy import select, update

from app.modules.files.models import StoredFile
from app.modules.tasks.models import AITask, TaskImage
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


async def reserve(task_db, user, images):
    request = ProcessScreenshotRequest(
        images=[base64.b64encode(image).decode() for image in images]
    )
    async with task_db() as db:
        task, _ = await TaskService(db).create(user, request)
    async with task_db() as db:
        await db.execute(update(AITask).where(AITask.id == task.id).values(
            dispatch_generation=1, lease_state="reserved",
            lease_expires_at=datetime.now(timezone.utc) + timedelta(minutes=5),
        ))
        await db.commit()
    return task.id, 1


@pytest.mark.asyncio
async def test_worker_loads_durable_images_in_ordinal_order(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    task_id, generation = await reserve(task_db, dispatch_users[2], [b"first", b"second"])
    async with task_db() as db:
        rows = (await db.execute(
            select(TaskImage.ordinal, StoredFile.object_key)
            .join(StoredFile, StoredFile.id == TaskImage.stored_file_id)
            .where(TaskImage.task_id == task_id)
            .order_by(TaskImage.ordinal)
        )).all()
    values = {object_key: ordinal for ordinal, object_key in rows}
    received = []

    class Provider:
        async def stream_answer(self, images, *args):
            received.extend(images)
            yield SimpleNamespace(text='{"answer":"A"}')

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "Redis", SimpleNamespace(from_url=lambda *args, **kwargs: NoRedisInput()))
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", Provider)
    bytes_by_key = {
        object_key: (b"first" if ordinal == 0 else b"second")
        for object_key, ordinal in values.items()
    }
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", lambda key: bytes_by_key[key])
    monkeypatch.setattr(ai_tasks.event_bus, "append", lambda *args, **kwargs: asyncio.sleep(0))

    await ai_tasks._run_task(task_id, generation)

    assert received == [
        "data:image/png;base64,Zmlyc3Q=",
        "data:image/png;base64,c2Vjb25k",
    ]


@pytest.mark.asyncio
async def test_image_read_timeout_fails_task_and_releases_lease(
    task_db, dispatch_boundary, dispatch_users, monkeypatch,
):
    task_id, generation = await reserve(task_db, dispatch_users[3], [b"slow"])
    settings = SimpleNamespace(
        redis_url="redis://unused", task_image_timeout_seconds=0.01, ai_model="test-model"
    )

    def slow_bytes(*args, **kwargs):
        time.sleep(1)

    def forbidden_provider(*args, **kwargs):
        raise AssertionError("provider must not start after image timeout")

    async def append(*args, **kwargs):
        pass

    monkeypatch.setattr(ai_tasks, "session_factory", task_db)
    monkeypatch.setattr(ai_tasks, "get_settings", lambda: settings)
    monkeypatch.setattr(ai_tasks, "Redis", SimpleNamespace(from_url=lambda *args, **kwargs: NoRedisInput()))
    monkeypatch.setattr(ai_tasks.storage, "get_bytes", slow_bytes)
    monkeypatch.setattr(ai_tasks, "OpenAICompatibleProvider", forbidden_provider)
    monkeypatch.setattr(ai_tasks.event_bus, "append", append)

    await ai_tasks._run_task(task_id, generation)

    async with task_db() as db:
        task = await db.get(AITask, task_id)
    assert task.status == "failed"
    assert task.error_code == "TASK_IMAGE_TIMEOUT"
    assert task.lease_state is None
