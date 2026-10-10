from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.admin.service import AdminLicenseService
from app.modules.admin.models import AdminAuditLog
from app.modules.identity.models import User
from app.modules.licenses.models import LicenseCode, UserEntitlement
from app.modules.licenses.service import LicenseCodeService, LicenseError


@pytest.mark.asyncio
async def test_admin_can_revoke_unused_license_without_persisting_plaintext(registration_db):
    async with registration_db() as db:
        admin = User(email=f"{uuid4()}@example.test", password_hash="x", role="admin")
        db.add(admin)
        await db.flush()
        batch, codes = await LicenseCodeService().create_batch(db, admin.id, "test", 1, 6)
        await db.commit()

        code = (await db.execute(select(LicenseCode).where(LicenseCode.batch_id == batch.id))).scalar_one()
        await AdminLicenseService().revoke_license_code(db, admin.id, code.id, "库存作废")

        audit = (
            await db.execute(
                select(AdminAuditLog)
                .where(AdminAuditLog.action == "license_code_revoked")
                .order_by(AdminAuditLog.created_at.desc())
            )
        ).scalars().first()
        assert audit is not None
        assert audit.action == "license_code_revoked"
        assert "code" not in audit.details
        with pytest.raises(LicenseError):
            await LicenseCodeService().redeem(db, admin.id, codes[0])


@pytest.mark.asyncio
async def test_admin_can_extend_and_revoke_user_entitlement(registration_db):
    async with registration_db() as db:
        admin = User(email=f"{uuid4()}@example.test", password_hash="x", role="admin")
        buyer = User(email=f"{uuid4()}@example.test", password_hash="x", status="active")
        db.add_all([admin, buyer])
        await db.flush()
        entitlement = UserEntitlement(
            user_id=buyer.id,
            starts_at=datetime.now(timezone.utc),
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
            status="active",
            source="license_code",
            created_by=admin.id,
        )
        db.add(entitlement)
        await db.commit()

        extended = await AdminLicenseService().extend_entitlement(db, admin.id, buyer.id, 2, "售后补偿")
        assert extended.status == "active"
        assert extended.expires_at > datetime.now(timezone.utc) + timedelta(days=80)

        revoked = await AdminLicenseService().revoke_entitlement(db, admin.id, buyer.id, "退款处理")
        assert revoked.status == "revoked"
        assert revoked.revoke_reason == "退款处理"
