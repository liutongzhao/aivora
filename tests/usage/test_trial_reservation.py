import asyncio
from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.identity.models import User
from app.modules.licenses.models import UserEntitlement
from app.modules.usage.service import TrialUsageService, UsageError


@pytest.mark.asyncio
async def test_last_trial_use_is_atomic(registration_db):
    user_id = uuid4()
    async with registration_db() as db:
        db.add(User(
            id=user_id, email=f"{user_id}@example.test", email_normalized=f"{user_id}@example.test",
            password_hash="x", status="active", email_verified_at=datetime.now(timezone.utc),
            trial_total=1, trial_used=0,
        ))
        await db.commit()

    async def reserve(key):
        async with registration_db() as db:
            try:
                reservation = await TrialUsageService().reserve_for_task(db, user_id, key)
                await db.commit()
                return reservation
            except UsageError:
                await db.rollback()
                return None

    first, second = await asyncio.gather(reserve("first"), reserve("second"))
    assert sum(item is not None for item in (first, second)) == 1

    async with registration_db() as db:
        user = await db.get(User, user_id)
        assert user.trial_used == 1


@pytest.mark.asyncio
async def test_expired_license_does_not_restore_trial(registration_db):
    user_id = uuid4()
    async with registration_db() as db:
        db.add(User(
            id=user_id, email=f"{user_id}@example.test", email_normalized=f"{user_id}@example.test",
            password_hash="x", status="active", email_verified_at=datetime.now(timezone.utc),
            trial_total=5, trial_used=0,
        ))
        db.add(UserEntitlement(
            user_id=user_id, starts_at=datetime(2025, 1, 1, tzinfo=timezone.utc),
            expires_at=datetime(2025, 7, 1, tzinfo=timezone.utc),
            status="active", source="license_code",
        ))
        await db.commit()
        with pytest.raises(UsageError) as exc:
            await TrialUsageService().reserve_for_task(db, user_id, str(uuid4()))
        assert exc.value.code == "ENTITLEMENT_EXPIRED"
