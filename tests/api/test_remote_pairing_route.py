from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.modules.devices import router as remote_router


@pytest.mark.asyncio
async def test_pairing_route_calls_service_with_user_id(monkeypatch):
    user = SimpleNamespace(id=uuid4())
    db = SimpleNamespace(commit=AsyncMock())
    pairing = SimpleNamespace(_plain_code="1234ABCD", expires_at=datetime.now(timezone.utc))
    create_code = AsyncMock(return_value=(pairing, object()))
    monkeypatch.setattr(remote_router, "create_pairing_code", create_code)

    result = await remote_router.create_pairing(
        remote_router.PairingCreateRequest(deviceId="desktop-1"), user, db
    )

    create_code.assert_awaited_once_with(db, user.id, "desktop-1")
    db.commit.assert_awaited_once()
    assert result["code"] == "1234ABCD"
