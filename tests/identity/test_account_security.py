from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.identity.models import Session, User
from app.modules.identity.passwords import hash_password, verify_password
from app.modules.identity.schemas import ChangePasswordRequest
from app.modules.identity.service import IdentityError, IdentityService
from app.modules.identity.verification import hash_secret


async def create_security_user(db) -> User:
    email = f"{uuid4()}@example.test"
    user = User(
        email=email,
        email_normalized=email,
        username="security-user",
        password_hash=hash_password("OldPass123"),
        status="active",
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_change_password_requires_old_password_and_revokes_other_sessions(registration_db):
    async with registration_db() as db:
        user = await create_security_user(db)
        current = Session(
            user_id=user.id,
            token_hash=hash_secret("current-token"),
            device_type="web",
            device_name="Chrome",
            expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        )
        other = Session(
            user_id=user.id,
            token_hash=hash_secret("other-token"),
            device_type="desktop",
            device_name="MacBook",
            expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        )
        db.add_all([current, other])
        await db.commit()

        service = IdentityService(db)
        await service.change_password(
            user,
            "current-token",
            ChangePasswordRequest(old_password="OldPass123", new_password="NewPass123"),
        )
        await db.refresh(user)
        await db.refresh(current)
        await db.refresh(other)

        assert verify_password("NewPass123", user.password_hash)
        assert current.revoked_at is None
        assert other.revoked_at is not None


@pytest.mark.asyncio
async def test_change_password_rejects_wrong_old_password(registration_db):
    async with registration_db() as db:
        user = await create_security_user(db)
        with pytest.raises(IdentityError) as error:
            await IdentityService(db).change_password(
                user,
                "missing-token",
                ChangePasswordRequest(old_password="WrongPass123", new_password="NewPass123"),
            )
        assert error.value.code == "INVALID_OLD_PASSWORD"


@pytest.mark.asyncio
async def test_list_sessions_hides_tokens_and_revoke_others_keeps_current(registration_db):
    async with registration_db() as db:
        user = await create_security_user(db)
        current_token = f"current-{uuid4()}"
        other_token = f"other-{uuid4()}"
        current = Session(
            user_id=user.id,
            token_hash=hash_secret(current_token),
            device_type="web",
            device_name="Chrome",
            expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        )
        other = Session(
            user_id=user.id,
            token_hash=hash_secret(other_token),
            device_type="desktop",
            device_name="MacBook",
            expires_at=datetime.now(timezone.utc) + timedelta(days=10),
        )
        db.add_all([current, other])
        await db.commit()

        service = IdentityService(db)
        sessions = await service.list_sessions(user.id, current_token)
        assert len(sessions) == 2
        assert all("token" not in item for item in sessions)
        assert next(item for item in sessions if item["is_current"])["device_name"] == "Chrome"

        revoked = await service.revoke_other_sessions(user.id, current_token)
        await db.refresh(current)
        await db.refresh(other)
        assert revoked == 1
        assert current.revoked_at is None
        assert other.revoked_at is not None
        assert await db.scalar(select(Session).where(Session.revoked_at.is_(None), Session.user_id == user.id)) == current
