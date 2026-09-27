from types import SimpleNamespace
from uuid import UUID

import pytest
import pytest_asyncio
from sqlalchemy import text

from app.modules.byok.crypto import decrypt_secret
from app.modules.byok.schemas import (
    ConnectionCreate,
    ConnectionUpdate,
    ModelCreate,
    ModelDefaultUpdate,
    ModelUpdate,
)
from app.modules.byok.service import BYOKService


BYOK_USER_ID = UUID("00000000-0000-0000-0000-000000000003")


@pytest_asyncio.fixture
async def byok_user(task_db):
    async with task_db() as db:
        await db.execute(
            text(
                "INSERT INTO users (id, email, password_hash) "
                "VALUES (:id, 'byok-management@example.test', 'x') "
                "ON CONFLICT (id) DO NOTHING"
            ),
            {"id": BYOK_USER_ID},
        )
        await db.commit()
    yield BYOK_USER_ID
    async with task_db() as db:
        await db.execute(text("DELETE FROM users WHERE id = :id"), {"id": BYOK_USER_ID})
        await db.commit()


@pytest.fixture
def byok_key(monkeypatch):
    from cryptography.fernet import Fernet
    from app.modules.byok import crypto

    key = Fernet.generate_key().decode()
    monkeypatch.setattr(
        crypto,
        "get_settings",
        lambda: SimpleNamespace(aivora_master_key=key),
    )
    return key


@pytest.mark.asyncio
async def test_connection_can_be_updated_and_disabled(task_db, byok_key, byok_user):
    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user,
            ConnectionCreate(
                name="初始连接",
                base_url="https://api.example.com/v1",
                api_key="initial-secret",
            ),
        )
        updated = await service.update_connection(
            byok_user,
            connection.id,
            ConnectionUpdate(
                name="新连接",
                base_url="https://api.example.org/v1",
                api_key="updated-secret",
                replace_key=True,
                enabled=False,
            ),
        )

        assert updated.name == "新连接"
        assert updated.base_url == "https://api.example.org/v1"
        assert updated.enabled is False
        assert decrypt_secret(updated.api_key_encrypted) == "updated-secret"


@pytest.mark.asyncio
async def test_model_can_be_updated_and_disabled(task_db, byok_key, byok_user):
    from app.modules.byok.service import BYOKService

    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user,
            ConnectionCreate(
                name="模型连接",
                base_url="https://api.example.com/v1",
                api_key="initial-secret",
            ),
        )
        model = await service.create_model(
            byok_user,
            ModelCreate(
                connection_id=connection.id,
                name="model-a",
                display_name="模型 A",
            ),
        )
        updated = await service.update_model(
            byok_user,
            model.id,
            ModelUpdate(name="model-b", display_name="模型 B"),
        )
        disabled = await service.delete_model(byok_user, model.id)

        assert updated.name == "model-b"
        assert updated.display_name == "模型 B"
        assert disabled is True
        assert updated.enabled is False


@pytest.mark.asyncio
async def test_disabled_connection_and_model_can_be_reenabled(task_db, byok_key, byok_user):
    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user, ConnectionCreate(name="恢复连接", base_url="https://api.example.com/v1", api_key="initial-secret"),
        )
        model = await service.create_model(
            byok_user, ModelCreate(connection_id=connection.id, name="model-a", display_name="模型 A"),
        )
        await service.delete_connection(byok_user, connection.id)
        await service.update_model(byok_user, model.id, ModelUpdate(enabled=False))
        await service.update_connection(byok_user, connection.id, ConnectionUpdate(enabled=True))
        restored = await service.update_model(byok_user, model.id, ModelUpdate(enabled=True))
        assert restored.enabled is True
        assert (await service.connections(byok_user))[0].enabled is True


@pytest.mark.asyncio
async def test_archived_model_is_hidden_and_name_can_be_reused(task_db, byok_key, byok_user):
    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user, ConnectionCreate(name="归档连接", base_url="https://api.example.com/v1", api_key="initial-secret"),
        )
        model = await service.create_model(
            byok_user, ModelCreate(connection_id=connection.id, name="model-a", display_name="模型 A"),
        )
        assert await service.remove_model(byok_user, model.id) is True
        assert all(item.id != model.id for item in await service.models(byok_user))
        replacement = await service.create_model(
            byok_user, ModelCreate(connection_id=connection.id, name="model-a", display_name="模型 A"),
        )
        assert replacement.id != model.id
        assert await service.update_model(byok_user, model.id, ModelUpdate(enabled=True)) is None


@pytest.mark.asyncio
async def test_model_probe_is_user_scoped_and_uses_saved_connection(task_db, byok_key, byok_user, monkeypatch):
    calls = []

    async def probe(base_url, api_key, model_name):
        calls.append((base_url, api_key, model_name))

    monkeypatch.setattr("app.modules.byok.service.probe_model", probe)
    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user, ConnectionCreate(name="测试连接", base_url="https://api.example.com/v1", api_key="initial-secret"),
        )
        model = await service.create_model(
            byok_user, ModelCreate(connection_id=connection.id, name="model-a", display_name="模型 A"),
        )
        await service.test_model(byok_user, model.id)
        assert calls == [("https://api.example.com/v1", "initial-secret", "model-a")]
        with pytest.raises(ValueError, match="模型不存在"):
            await service.test_model(UUID("00000000-0000-0000-0000-000000000001"), model.id)


@pytest.mark.asyncio
async def test_model_probe_sends_a_real_minimal_completion(monkeypatch):
    from app.modules.byok.outbound import probe_model

    captured = []

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            pass

        def json(self):
            return {"choices": [{"message": {"content": "OK"}}]}

    class FakeClient:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, **kwargs):
            captured.append((url, kwargs))
            return FakeResponse()

    monkeypatch.setattr("app.modules.byok.outbound.httpx.AsyncClient", FakeClient)
    await probe_model("https://api.example.com/v1", "test-secret", "model-a")
    assert captured[0][0] == "https://api.example.com/v1/chat/completions"
    assert captured[0][1]["json"]["model"] == "model-a"
    assert captured[0][1]["json"]["max_tokens"] <= 16


@pytest.mark.asyncio
async def test_default_model_cannot_be_disabled(task_db, byok_key, byok_user):
    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user,
            ConnectionCreate(
                name="默认连接",
                base_url="https://api.example.com/v1",
                api_key="initial-secret",
            ),
        )
        model = await service.create_model(
            byok_user,
            ModelCreate(
                connection_id=connection.id,
                name="default-model",
                display_name="默认模型",
            ),
        )
        await service.set_default(
            byok_user,
            "programming",
            ModelDefaultUpdate(model_id=model.id, language="python"),
        )

        with pytest.raises(ValueError, match="默认模型"):
            await service.delete_model(byok_user, model.id)


@pytest.mark.asyncio
async def test_same_model_id_can_exist_on_separate_connections(task_db, byok_key, byok_user):
    async with task_db() as db:
        service = BYOKService(db)
        first = await service.create_connection(
            byok_user,
            ConnectionCreate(name="供应商一", base_url="https://one.example/v1", api_key="first-secret"),
        )
        second = await service.create_connection(
            byok_user,
            ConnectionCreate(name="供应商二", base_url="https://two.example/v1", api_key="second-secret"),
        )
        for connection in (first, second):
            await service.create_model(
                byok_user,
                ModelCreate(connection_id=connection.id, name="shared-model", display_name="同名模型"),
            )
        assert len([model for model in await service.models(byok_user) if model.name == "shared-model"]) == 2


@pytest.mark.asyncio
async def test_duplicate_model_on_same_connection_has_readable_error(task_db, byok_key, byok_user):
    async with task_db() as db:
        service = BYOKService(db)
        connection = await service.create_connection(
            byok_user,
            ConnectionCreate(name="同一连接", base_url="https://one.example/v1", api_key="first-secret"),
        )
        request = ModelCreate(connection_id=connection.id, name="model-a", display_name="模型 A")
        await service.create_model(byok_user, request)
        with pytest.raises(ValueError, match="已添加"):
            await service.create_model(byok_user, request)


@pytest.mark.asyncio
async def test_probe_connection_returns_available_models(monkeypatch):
    from app.modules.byok.outbound import probe_connection

    calls = []

    class FakeResponse:
        status_code = 200

        def raise_for_status(self):
            return None

        def json(self):
            return {"data": [{"id": "model-a"}, {"id": "model-b"}]}

    class FakeClient:
        def __init__(self, **kwargs):
            self.kwargs = kwargs

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def get(self, endpoint, headers):
            calls.append((endpoint, headers))
            return FakeResponse()

    monkeypatch.setattr("app.modules.byok.outbound.httpx.AsyncClient", FakeClient)
    result = await probe_connection("https://api.example.com/v1", "test-secret")

    assert result == ["model-a", "model-b"]
    assert calls == [
        (
            "https://api.example.com/v1/models",
            {
                "Authorization": "Bearer test-secret",
                "Content-Type": "application/json",
            },
        )
    ]
