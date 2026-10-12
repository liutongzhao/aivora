from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.modules.admin.router import get_task, get_task_image


class FakeDb:
    def __init__(self, task, file):
        self.task = task
        self.file = file

    async def get(self, model, task_id):
        return self.task

    async def scalar(self, query):
        return self.file if self.task is None else None

    async def execute(self, query):
        return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: [self.file]))


@pytest.mark.asyncio
async def test_admin_task_detail_uses_authenticated_image_endpoint(monkeypatch):
    task_id, file_id = uuid4(), uuid4()
    task = SimpleNamespace(
        id=task_id, user_id=uuid4(), mode="single_choice", status="completed",
        stage="completed", progress=100, created_at=None, completed_at=None,
        error_code=None, error_message=None,
    )
    file = SimpleNamespace(id=file_id, object_key="task-images/private", content_type="image/png", size_bytes=3)
    result = await get_task(task_id, SimpleNamespace(role="admin"), FakeDb(task, file))
    assert result["images"][0]["url"] == f"/api/admin/tasks/{task_id}/images/{file_id}"


@pytest.mark.asyncio
async def test_admin_task_image_streams_private_object(monkeypatch):
    task_id, file_id = uuid4(), uuid4()
    file = SimpleNamespace(id=file_id, object_key="task-images/private", content_type="image/png", size_bytes=3)
    chunks = iter([b"png", b""])
    object_response = SimpleNamespace(
        read=lambda size: next(chunks),
        close=lambda: None,
        release_conn=lambda: None,
    )
    monkeypatch.setattr("app.modules.admin.router.storage.get_object", lambda key: object_response)
    response = await get_task_image(task_id, file_id, SimpleNamespace(role="admin"), FakeDb(None, file))
    assert response.media_type == "image/png"
    assert b"".join([chunk async for chunk in response.body_iterator]) == b"png"
