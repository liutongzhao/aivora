from datetime import datetime, timezone
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.admin.models import AdminAuditLog
from app.modules.identity.models import User
from app.modules.licenses.models import LicenseCode, UserEntitlement
from app.modules.licenses.service import LicenseError, add_calendar_months


_SENSITIVE_KEY_PARTS = ("code", "password", "secret", "token", "session", "api_key", "apikey", "smtp")


def sanitize_audit_details(value):
    if isinstance(value, dict):
        return {
            key: "[REDACTED]" if any(part in key.lower() for part in _SENSITIVE_KEY_PARTS)
            else sanitize_audit_details(item)
            for key, item in value.items()
        }
    if isinstance(value, list):
        return [sanitize_audit_details(item) for item in value]
    return value


def _require_reason(reason: str) -> str:
    value = reason.strip()
    if len(value) < 3:
        raise LicenseError("ADMIN_REASON_REQUIRED", "请填写至少 3 个字符的操作原因", 400)
    return value


class AdminLicenseService:
    async def revoke_license_code(
        self, db: AsyncSession, admin_id: UUID, code_id: UUID, reason: str
    ) -> LicenseCode:
        reason = _require_reason(reason)
        code = await db.get(LicenseCode, code_id, with_for_update=True)
        if not code:
            raise LicenseError("LICENSE_NOT_FOUND", "授权码不存在", 404)
        if code.status != "unused":
            raise LicenseError("LICENSE_NOT_REVOCABLE", "只有未使用的授权码可以撤销", 409)
        code.status = "revoked"
        code.revoked_at = datetime.now(timezone.utc)
        code.revoke_reason = reason
        db.add(AdminAuditLog(
            admin_user_id=admin_id,
            action="license_code_revoked",
            resource_type="license_code",
            resource_id=str(code.id),
            details={"reason": reason, "suffix": code.code_suffix},
        ))
        await db.commit()
        return code

    async def extend_entitlement(
        self, db: AsyncSession, admin_id: UUID, user_id: UUID, months: int, reason: str
    ) -> UserEntitlement:
        reason = _require_reason(reason)
        if months < 1 or months > 120:
            raise LicenseError("ENTITLEMENT_DURATION_INVALID", "延长期限必须在 1 到 120 个月之间", 400)
        user = await db.get(User, user_id)
        if not user:
            raise LicenseError("USER_NOT_FOUND", "用户不存在", 404)
        entitlement = await db.scalar(
            select(UserEntitlement)
            .where(UserEntitlement.user_id == user_id)
            .order_by(UserEntitlement.expires_at.desc())
            .with_for_update()
        )
        if not entitlement:
            raise LicenseError("ENTITLEMENT_NOT_FOUND", "用户没有可调整的授权", 404)
        now = datetime.now(timezone.utc)
        base = max(now, entitlement.expires_at)
        entitlement.expires_at = add_calendar_months(base, months)
        entitlement.status = "active"
        entitlement.revoked_at = None
        entitlement.revoke_reason = None
        db.add(AdminAuditLog(
            admin_user_id=admin_id,
            action="entitlement_extended",
            resource_type="user",
            resource_id=str(user_id),
            details={"months": months, "reason": reason},
        ))
        await db.commit()
        return entitlement

    async def set_entitlement_status(
        self, db: AsyncSession, admin_id: UUID, user_id: UUID, status: str, reason: str
    ) -> UserEntitlement:
        reason = _require_reason(reason)
        if status not in {"paused", "revoked"}:
            raise LicenseError("ENTITLEMENT_STATUS_INVALID", "不支持的授权状态", 400)
        entitlement = await db.scalar(
            select(UserEntitlement)
            .where(UserEntitlement.user_id == user_id)
            .order_by(UserEntitlement.expires_at.desc())
            .with_for_update()
        )
        if not entitlement:
            raise LicenseError("ENTITLEMENT_NOT_FOUND", "用户没有可调整的授权", 404)
        entitlement.status = status
        entitlement.revoked_at = datetime.now(timezone.utc) if status == "revoked" else None
        entitlement.revoke_reason = reason
        db.add(AdminAuditLog(
            admin_user_id=admin_id,
            action=f"entitlement_{status}",
            resource_type="user",
            resource_id=str(user_id),
            details={"reason": reason},
        ))
        await db.commit()
        return entitlement

    async def revoke_entitlement(
        self, db: AsyncSession, admin_id: UUID, user_id: UUID, reason: str
    ) -> UserEntitlement:
        return await self.set_entitlement_status(db, admin_id, user_id, "revoked", reason)


class AdminAuditService:
    async def list_logs(
        self,
        db: AsyncSession,
        *,
        action: str | None = None,
        resource_type: str | None = None,
        search: str | None = None,
        limit: int = 50,
        offset: int = 0,
    ) -> tuple[list[dict], int]:
        conditions = []
        if action:
            conditions.append(AdminAuditLog.action == action)
        if resource_type:
            conditions.append(AdminAuditLog.resource_type == resource_type)
        if search:
            pattern = f"%{search.strip()}%"
            conditions.append(
                AdminAuditLog.resource_id.ilike(pattern)
                | AdminAuditLog.action.ilike(pattern)
                | AdminAuditLog.resource_type.ilike(pattern)
            )
        count_result = await db.execute(
            select(func.count()).select_from(AdminAuditLog).where(*conditions)
        )
        total = count_result.scalar_one()
        result = await db.execute(
            select(AdminAuditLog, User.email)
            .join(User, User.id == AdminAuditLog.admin_user_id)
            .where(*conditions)
            .order_by(AdminAuditLog.created_at.desc())
            .offset(max(offset, 0))
            .limit(min(max(limit, 1), 100))
        )
        return [
            {
                "id": str(log.id),
                "action": log.action,
                "resource_type": log.resource_type,
                "resource_id": log.resource_id,
                "actor_email": email,
                "details": sanitize_audit_details(log.details or {}),
                "created_at": log.created_at,
            }
            for log, email in result.all()
        ], total
