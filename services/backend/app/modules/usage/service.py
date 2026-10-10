from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.identity.models import User
from app.modules.usage.models import UsageLedger


class UsageError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 402):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


class TrialReservation:
    def __init__(self, ledger_id: UUID | None, entitled: bool):
        self.ledger_id = ledger_id
        self.entitled = entitled


class TrialUsageService:
    async def has_active_entitlement(self, db: AsyncSession, user_id: UUID) -> bool:
        from app.modules.licenses.models import UserEntitlement

        now = datetime.now(timezone.utc)
        return bool(await db.scalar(
            select(UserEntitlement.id).where(
                UserEntitlement.user_id == user_id,
                UserEntitlement.status == "active",
                UserEntitlement.starts_at <= now,
                UserEntitlement.expires_at > now,
            ).limit(1)
        ))

    async def reserve_for_task(
        self, db: AsyncSession, user_id: UUID, idempotency_key: str
    ) -> TrialReservation:
        existing = await db.scalar(
            select(UsageLedger).where(UsageLedger.idempotency_key == idempotency_key)
        )
        if existing:
            return TrialReservation(existing.id, False)

        user = await db.scalar(select(User).where(User.id == user_id).with_for_update())
        if not user or user.status != "active":
            raise UsageError("ACCOUNT_NOT_ELIGIBLE", "账号暂不可使用搜题", 403)
        if await self.has_active_entitlement(db, user_id):
            return TrialReservation(None, True)
        # Users created before the registration migration have no normalized
        # email or verification timestamp. Preserve their existing access.
        if user.email_verified_at is None and user.email_normalized is None:
            return TrialReservation(None, True)
        if not user.email_verified_at:
            raise UsageError("EMAIL_NOT_VERIFIED", "请先完成邮箱验证", 403)
        from app.modules.licenses.models import UserEntitlement

        has_entitlement = await db.scalar(
            select(UserEntitlement.id)
            .where(UserEntitlement.user_id == user_id)
            .limit(1)
        )
        if has_entitlement:
            raise UsageError("ENTITLEMENT_EXPIRED", "授权已到期，请续期后继续使用", 402)
        if user.trial_used >= user.trial_total:
            raise UsageError("TRIAL_EXHAUSTED", "免费试用次数已用完，请激活授权", 402)

        user.trial_used += 1
        ledger = UsageLedger(
            user_id=user_id,
            usage_type="trial_search",
            amount=1,
            status="reserved",
            idempotency_key=idempotency_key,
        )
        db.add(ledger)
        await db.flush()
        return TrialReservation(ledger.id, False)

    async def attach_task(self, db: AsyncSession, reservation_id: UUID | None, task_id: UUID) -> None:
        if not reservation_id:
            return
        await db.execute(
            update(UsageLedger).where(UsageLedger.id == reservation_id).values(task_id=task_id)
        )

    async def commit(self, db: AsyncSession, reservation_id: UUID | None) -> None:
        if reservation_id:
            await db.execute(
                update(UsageLedger)
                .where(UsageLedger.id == reservation_id, UsageLedger.status == "reserved")
                .values(status="committed")
            )

    async def reverse(self, db: AsyncSession, reservation_id: UUID | None, reason: str) -> None:
        if not reservation_id:
            return
        ledger = await db.scalar(
            select(UsageLedger).where(
                UsageLedger.id == reservation_id, UsageLedger.status == "reserved"
            ).with_for_update()
        )
        if not ledger:
            return
        user = await db.scalar(select(User).where(User.id == ledger.user_id).with_for_update())
        if user:
            user.trial_used = max(0, user.trial_used - ledger.amount)
        ledger.status = "reversed"
        ledger.reversed_at = datetime.now(timezone.utc)
        ledger.reversal_reason = reason

    async def summary(self, db: AsyncSession, user_id: UUID) -> dict:
        user = await db.get(User, user_id)
        from app.modules.licenses.service import LicenseCodeService

        entitlement = await LicenseCodeService().latest(db, user_id)
        entitlement_active = bool(
            entitlement
            and entitlement.status == "active"
            and entitlement.starts_at <= datetime.now(timezone.utc)
            and entitlement.expires_at > datetime.now(timezone.utc)
        )
        return {
            "trialTotal": user.trial_total if user else 0,
            "trialUsed": user.trial_used if user else 0,
            "trialRemaining": max(0, (user.trial_total if user else 0) - (user.trial_used if user else 0)),
            "entitlementActive": entitlement_active,
            "entitlementExpiresAt": entitlement.expires_at if entitlement else None,
            "entitlementStatus": entitlement.status if entitlement else None,
        }
