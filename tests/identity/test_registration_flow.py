from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.identity.models import EmailVerificationCode, User
from app.modules.identity.schemas import RegisterRequest
from app.modules.identity.service import IdentityService
from app.modules.identity.verification import RegistrationService, VerificationError, hash_secret


class MailCapture:
    def __init__(self):
        self.messages = []
        self.reset_messages = []

    async def send_verification_code(self, recipient, code, expires_minutes):
        self.messages.append((recipient, code, expires_minutes))

    async def send_password_reset(self, recipient, reset_url):
        self.reset_messages.append((recipient, reset_url))


class AllowLimiter:
    async def check_send(self, email, ip):
        pass

    async def check_verify(self, email, ip):
        pass


@pytest.mark.asyncio
async def test_verified_registration_consumes_ticket_and_grants_trial(registration_db):
    mail = MailCapture()
    email = f"{uuid4()}@example.test"
    async with registration_db() as db:
        registration = RegistrationService(db, mail, AllowLimiter())
        await registration.send_code(email.upper(), "127.0.0.1")
        assert mail.messages[0][0] == email
        code = mail.messages[0][1]
        record = await db.scalar(select(EmailVerificationCode).where(EmailVerificationCode.email_normalized == email))
        assert record.code_hash == hash_secret(code)
        assert code not in record.code_hash
        ticket, _ = await registration.verify_code(email, code, "127.0.0.1")
        user = await IdentityService(db).register_verified(
            RegisterRequest(registration_ticket=ticket, password="StrongPass123"), registration, "127.0.0.1"
        )
        assert user.email_verified_at is not None
        assert (user.trial_total, user.trial_used) == (5, 0)
        with pytest.raises(VerificationError):
            await registration.consume_ticket(ticket)


@pytest.mark.asyncio
async def test_wrong_code_five_times_invalidates_it(registration_db):
    mail = MailCapture()
    email = f"{uuid4()}@example.test"
    async with registration_db() as db:
        registration = RegistrationService(db, mail, AllowLimiter())
        await registration.send_code(email, "127.0.0.1")
        code = mail.messages[0][1]
        wrong = "000000" if code != "000000" else "999999"
        for _ in range(5):
            with pytest.raises(VerificationError):
                await registration.verify_code(email, wrong, "127.0.0.1")
        with pytest.raises(VerificationError):
            await registration.verify_code(email, code, "127.0.0.1")


@pytest.mark.asyncio
async def test_expired_code_cannot_be_verified(registration_db):
    mail = MailCapture()
    email = f"{uuid4()}@example.test"
    async with registration_db() as db:
        registration = RegistrationService(db, mail, AllowLimiter())
        await registration.send_code(email, "127.0.0.1")
        record = await db.scalar(select(EmailVerificationCode).where(EmailVerificationCode.email_normalized == email))
        record.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        await db.commit()
        with pytest.raises(VerificationError):
            await registration.verify_code(email, mail.messages[0][1], "127.0.0.1")


@pytest.mark.asyncio
async def test_resend_invalidates_previous_code(registration_db):
    mail = MailCapture()
    email = f"{uuid4()}@example.test"
    async with registration_db() as db:
        registration = RegistrationService(db, mail, AllowLimiter())
        await registration.send_code(email, "127.0.0.1")
        first = mail.messages[0][1]
        await registration.send_code(email, "127.0.0.1")
        with pytest.raises(VerificationError):
            await registration.verify_code(email, first, "127.0.0.1")
        ticket, _ = await registration.verify_code(email, mail.messages[1][1], "127.0.0.1")
        assert ticket
