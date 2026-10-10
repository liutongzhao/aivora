import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.modules.identity.mail import MailSender
from app.modules.identity.models import EmailVerificationCode, PasswordResetToken, Session, User
from app.modules.identity.passwords import hash_password
from app.modules.identity.rate_limits import IdentityRateLimiter, RateLimitError


def normalize_email(email: str) -> str:
    return email.strip().lower()


def hash_secret(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


class VerificationError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class RegistrationService:
    def __init__(self, db: AsyncSession, mail: MailSender, limiter: IdentityRateLimiter):
        self.db = db
        self.mail = mail
        self.limiter = limiter
        self.settings = get_settings()

    async def send_code(self, email: str, ip: str) -> None:
        normalized = normalize_email(email)
        try:
            await self.limiter.check_send(normalized, ip)
        except RateLimitError as error:
            raise VerificationError(error.code, error.message, 429) from error

        code = f"{secrets.randbelow(1_000_000):06d}"
        now = datetime.now(timezone.utc)
        await self.db.execute(
            update(EmailVerificationCode)
            .where(
                EmailVerificationCode.email_normalized == normalized,
                EmailVerificationCode.purpose == "registration",
                EmailVerificationCode.consumed_at.is_(None),
            )
            .values(consumed_at=now)
        )
        record = EmailVerificationCode(
            email_normalized=normalized,
            purpose="registration",
            code_hash=hash_secret(code),
            expires_at=now + timedelta(minutes=self.settings.mail_code_ttl_minutes),
            request_ip=ip,
        )
        self.db.add(record)
        await self.db.flush()
        try:
            await self.mail.send_verification_code(
                normalized, code, self.settings.mail_code_ttl_minutes
            )
        except Exception as error:
            await self.db.rollback()
            raise VerificationError("MAIL_SEND_FAILED", "验证码发送失败，请稍后重试", 503) from error
        await self.db.commit()

    async def verify_code(self, email: str, code: str, ip: str) -> tuple[str, int]:
        normalized = normalize_email(email)
        try:
            await self.limiter.check_verify(normalized, ip)
        except RateLimitError as error:
            raise VerificationError(error.code, error.message, 429) from error

        now = datetime.now(timezone.utc)
        record = await self.db.scalar(
            select(EmailVerificationCode)
            .where(
                EmailVerificationCode.email_normalized == normalized,
                EmailVerificationCode.purpose == "registration",
                EmailVerificationCode.consumed_at.is_(None),
                EmailVerificationCode.expires_at > now,
            )
            .order_by(EmailVerificationCode.created_at.desc())
            .with_for_update()
        )
        if not record:
            raise VerificationError("CODE_INVALID", "验证码无效或已过期", 400)
        if record.attempt_count >= 5:
            raise VerificationError("CODE_INVALID", "验证码无效或已过期", 400)
        if record.code_hash != hash_secret(code):
            record.attempt_count += 1
            if record.attempt_count >= 5:
                record.consumed_at = now
            await self.db.commit()
            raise VerificationError("CODE_INVALID", "验证码无效或已过期", 400)

        ticket = secrets.token_urlsafe(48)
        record.consumed_at = now
        record.registration_ticket_hash = hash_secret(ticket)
        await self.db.commit()
        return ticket, self.settings.mail_registration_ticket_ttl_minutes * 60

    async def consume_ticket(self, ticket: str) -> str:
        record = await self.db.scalar(
            select(EmailVerificationCode)
            .where(
                EmailVerificationCode.registration_ticket_hash == hash_secret(ticket),
                EmailVerificationCode.purpose == "registration",
                EmailVerificationCode.consumed_at.is_not(None),
                EmailVerificationCode.registration_ticket_used_at.is_(None),
            )
            .order_by(EmailVerificationCode.created_at.desc())
            .with_for_update()
        )
        if not record:
            raise VerificationError("REGISTRATION_TICKET_INVALID", "注册验证已失效，请重新验证邮箱", 401)
        created_at = record.created_at
        if not created_at or created_at + timedelta(minutes=self.settings.mail_registration_ticket_ttl_minutes) <= datetime.now(timezone.utc):
            raise VerificationError("REGISTRATION_TICKET_INVALID", "注册验证已失效，请重新验证邮箱", 401)
        return record.email_normalized

    async def use_ticket(self, ticket: str) -> str:
        normalized = await self.consume_ticket(ticket)
        record = await self.db.scalar(
            select(EmailVerificationCode)
            .where(EmailVerificationCode.registration_ticket_hash == hash_secret(ticket))
            .with_for_update()
        )
        if not record:
            raise VerificationError("REGISTRATION_TICKET_INVALID", "注册验证已失效，请重新验证邮箱", 401)
        record.registration_ticket_used_at = datetime.now(timezone.utc)
        await self.db.flush()
        return normalized

    async def request_password_reset(self, email: str, ip: str) -> None:
        normalized = normalize_email(email)
        try:
            await self.limiter.check_password_reset(normalized, ip)
        except RateLimitError as error:
            raise VerificationError(error.code, error.message, 429) from error

        user = await self.db.scalar(select(User).where(User.email_normalized == normalized))
        if not user or user.status != "active":
            return
        raw_token = secrets.token_urlsafe(48)
        now = datetime.now(timezone.utc)
        await self.db.execute(
            update(PasswordResetToken)
            .where(PasswordResetToken.user_id == user.id, PasswordResetToken.used_at.is_(None))
            .values(used_at=now)
        )
        self.db.add(
            PasswordResetToken(
                user_id=user.id,
                token_hash=hash_secret(raw_token),
                expires_at=now + timedelta(minutes=self.settings.password_reset_ttl_minutes),
            )
        )
        await self.db.flush()
        reset_url = f"{self.settings.web_base_url.rstrip('/')}/reset-password?token={raw_token}"
        try:
            await self.mail.send_password_reset(normalized, reset_url)
        except Exception:
            # Do not reveal account existence or mail-provider details.
            await self.db.rollback()
            return
        await self.db.commit()

    async def confirm_password_reset(self, token: str, password: str) -> None:
        record = await self.db.scalar(
            select(PasswordResetToken)
            .where(
                PasswordResetToken.token_hash == hash_secret(token),
                PasswordResetToken.used_at.is_(None),
                PasswordResetToken.expires_at > datetime.now(timezone.utc),
            )
            .with_for_update()
        )
        if not record:
            raise VerificationError("RESET_TOKEN_INVALID", "重置链接无效或已过期", 400)
        user = await self.db.scalar(
            select(User).where(User.id == record.user_id).with_for_update()
        )
        if not user or user.status != "active":
            raise VerificationError("RESET_TOKEN_INVALID", "重置链接无效或已过期", 400)
        user.password_hash = hash_password(password)
        record.used_at = datetime.now(timezone.utc)
        await self.db.execute(
            update(Session)
            .where(Session.user_id == user.id, Session.revoked_at.is_(None))
            .values(revoked_at=datetime.now(timezone.utc))
        )
        await self.db.commit()
