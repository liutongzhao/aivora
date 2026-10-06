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
    pairing = SimpleNamespace(_plain_code="0042", expires_at=datetime.now(timezone.utc))
    create_code = AsyncMock(return_value=(pairing, object()))
    monkeypatch.setattr(remote_router, "create_pairing_code", create_code)

    result = await remote_router.create_pairing(
        remote_router.PairingCreateRequest(deviceId="desktop-1"), user, db
    )

    create_code.assert_awaited_once_with(db, user.id, "desktop-1")
    db.commit.assert_awaited_once()
    assert result["code"] == "0042"


def test_pairing_verify_request_accepts_four_digit_numeric_code():
    assert remote_router.PairingVerifyRequest(code="0042").code == "0042"


@pytest.mark.parametrize("code", ["42", "12345", "12A4", "１２３４"])
def test_pairing_verify_request_rejects_non_four_digit_numeric_code(code):
    with pytest.raises(ValueError):
        remote_router.PairingVerifyRequest(code=code)
