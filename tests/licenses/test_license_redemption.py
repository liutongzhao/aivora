import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.identity.models import User
from app.modules.licenses.models import LicenseCode, UserEntitlement
from app.modules.licenses.service import LicenseCodeService, LicenseError, add_calendar_months


def test_calendar_months_clamp_to_month_end():
    assert add_calendar_months(datetime(2026, 8, 31, tzinfo=timezone.utc), 6) == datetime(
        2027, 2, 28, tzinfo=timezone.utc
    )


@pytest.mark.asyncio
async def test_redeem_once_and_renew_from_current_expiry(registration_db):
    service = LicenseCodeService()
    async with registration_db() as db:
        admin = User(email=f"{uuid4()}@example.test", password_hash="x", role="admin")
        db.add(admin)
        await db.flush()
        buyer = User(
            email=f"{uuid4()}@example.test",
            email_normalized=f"{uuid4()}@example.test",
            password_hash="x",
            status="active",
            email_verified_at=datetime.now(timezone.utc),
            trial_total=5,
            trial_used=0,
        )
        db.add(buyer)
        await db.commit()
        batch, codes = await service.create_batch(db, admin.id, "test", 2, 6)
        first = await service.redeem(db, buyer.id, codes[0])
        second = await service.redeem(db, buyer.id, codes[1])
        assert second.starts_at == first.expires_at
        assert second.expires_at == add_calendar_months(first.expires_at, 6)
        with pytest.raises(LicenseError):
            await service.redeem(db, buyer.id, codes[0])
