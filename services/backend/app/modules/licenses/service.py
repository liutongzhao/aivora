import calendar
import hashlib
import secrets
from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.modules.identity.models import User
from app.modules.licenses.models import LicenseBatch, LicenseCode, LicenseSettings, UserEntitlement


def hash_license(code: str) -> str:
    return hashlib.sha256(code.encode("utf-8")).hexdigest()


def add_calendar_months(value: datetime, months: int) -> datetime:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return value.replace(year=year, month=month, day=day)


class LicenseError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class LicenseCodeService:
    @staticmethod
    def new_code() -> str:
        return "AVR-" + "-".join(secrets.token_hex(3).upper() for _ in range(3))

    async def create_batch(
        self, db: AsyncSession, admin_id: UUID, name: str | None, quantity: int, duration_months: int
    ) -> tuple[LicenseBatch, list[str]]:
        settings = await db.get(LicenseSettings, True)
        max_months = settings.max_duration_months if settings else get_settings().license_max_duration_months
        if quantity < 1 or quantity > 10000:
            raise LicenseError("LICENSE_QUANTITY_INVALID", "授权码数量必须在 1 到 10000 之间")
        if duration_months < 1 or duration_months > max_months:
            raise LicenseError("LICENSE_DURATION_INVALID", "授权期限超出管理员允许范围")
        batch = LicenseBatch(
            name=name, duration_months=duration_months, quantity=quantity, created_by=admin_id
        )
        db.add(batch)
        await db.flush()
        plaintext: list[str] = []
        for _ in range(quantity):
            code = self.new_code()
            plaintext.append(code)
            db.add(LicenseCode(
                batch_id=batch.id,
                code_hash=hash_license(code),
                code_suffix=code[-4:],
            ))
        await db.flush()
        return batch, plaintext

    async def redeem(self, db: AsyncSession, user_id: UUID, raw_code: str) -> UserEntitlement:
        user = await db.get(User, user_id)
        if not user or user.status != "active" or not user.email_verified_at:
            raise LicenseError("ACCOUNT_NOT_ELIGIBLE", "请先完成邮箱验证")
        code = await db.scalar(
            select(LicenseCode).where(LicenseCode.code_hash == hash_license(raw_code.strip().upper()))
            .with_for_update()
        )
        if not code or code.status != "unused":
            raise LicenseError("LICENSE_INVALID", "授权码无效或已使用")
        batch = await db.get(LicenseBatch, code.batch_id)
        if not batch:
            raise LicenseError("LICENSE_INVALID", "授权码无效")
        now = datetime.now(timezone.utc)
        current = await db.scalar(
            select(UserEntitlement)
            .where(
                UserEntitlement.user_id == user_id,
                UserEntitlement.status == "active",
                UserEntitlement.expires_at > now,
            )
            .order_by(UserEntitlement.expires_at.desc())
        )
        start = max(now, current.expires_at) if current else now
        entitlement = UserEntitlement(
            user_id=user_id,
            starts_at=start,
            expires_at=add_calendar_months(start, batch.duration_months),
            status="active",
            source="license_code",
            source_license_id=code.id,
        )
        code.status = "activated"
        code.activated_by = user_id
        code.activated_at = now
        db.add(entitlement)
        await db.commit()
        return entitlement

    async def current(self, db: AsyncSession, user_id: UUID) -> UserEntitlement | None:
        now = datetime.now(timezone.utc)
        return await db.scalar(
            select(UserEntitlement).where(
                UserEntitlement.user_id == user_id,
                UserEntitlement.status == "active",
                UserEntitlement.starts_at <= now,
                UserEntitlement.expires_at > now,
            ).order_by(UserEntitlement.expires_at.desc())
        )

    async def latest(self, db: AsyncSession, user_id: UUID) -> UserEntitlement | None:
        return await db.scalar(
            select(UserEntitlement)
            .where(UserEntitlement.user_id == user_id)
            .order_by(UserEntitlement.expires_at.desc())
            .limit(1)
        )
