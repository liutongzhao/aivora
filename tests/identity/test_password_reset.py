from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.identity.models import PasswordResetToken, Session, User
from app.modules.identity.passwords import hash_password, verify_password
from app.modules.identity.verification import RegistrationService, VerificationError, hash_secret


class MailCapture:
    def __init__(self):
        self.reset_messages = []

    async def send_verification_code(self, recipient, code, expires_minutes):
        pass

    async def send_password_reset(self, recipient, reset_url):
        self.reset_messages.append((recipient, reset_url))


class AllowLimiter:
    async def check_send(self, email, ip):
        pass

    async def check_verify(self, email, ip):
        pass

    async def check_password_reset(self, email, ip):
        pass


async def create_user(db, email: str) -> User:
    user = User(
        email=email,
        email_normalized=email,
        username="reset-user",
        password_hash=hash_password("OldPass123"),
        status="active",
        email_verified_at=datetime.now(timezone.utc),
    )
    db.add(user)
    await db.flush()
    return user


@pytest.mark.asyncio
async def test_unknown_email_returns_without_creating_token(registration_db):
    mail = MailCapture()
    async with registration_db() as db:
        service = RegistrationService(db, mail, AllowLimiter())
        await service.request_password_reset("missing@example.test", "127.0.0.1")
        assert mail.reset_messages == []
        assert await db.scalar(select(PasswordResetToken)) is None


@pytest.mark.asyncio
async def test_password_reset_is_single_use_and_revokes_sessions(registration_db):
    mail = MailCapture()
    email = f"{uuid4()}@example.test"
    async with registration_db() as db:
        user = await create_user(db, email)
        session = Session(
            user_id=user.id,
            token_hash=hash_secret("active-session"),
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
        )
        db.add(session)
        await db.commit()

        service = RegistrationService(db, mail, AllowLimiter())
        await service.request_password_reset(email, "127.0.0.1")
        reset_url = mail.reset_messages[0][1]
        token = reset_url.rsplit("token=", 1)[1]

        await service.confirm_password_reset(token, "NewPass123")
        await db.refresh(user)
        await db.refresh(session)
        assert verify_password("NewPass123", user.password_hash)
        assert session.revoked_at is not None

        with pytest.raises(VerificationError):
            await service.confirm_password_reset(token, "AnotherPass123")


@pytest.mark.asyncio
async def test_expired_password_reset_token_is_rejected(registration_db):
    mail = MailCapture()
    email = f"{uuid4()}@example.test"
    async with registration_db() as db:
        user = await create_user(db, email)
        token = "expired-reset-token"
        db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_secret(token),
                expires_at=datetime.now(timezone.utc) - timedelta(seconds=1),
            )
        )
        await db.commit()

        service = RegistrationService(db, mail, AllowLimiter())
        with pytest.raises(VerificationError):
            await service.confirm_password_reset(token, "NewPass123")
