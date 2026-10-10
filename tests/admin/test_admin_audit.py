from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.modules.admin.models import AdminAuditLog
from app.modules.admin.service import AdminAuditService, sanitize_audit_details
from app.modules.identity.models import User


def test_sanitize_audit_details_redacts_secret_bearing_fields():
    result = sanitize_audit_details({
        "reason": "退款处理",
        "code": "AVR-SECRET",
        "nested": {"smtp_password": "mail-secret", "session_id": "session-secret"},
        "suffix": "ABCD",
    })

    assert result == {
        "reason": "退款处理",
        "code": "[REDACTED]",
        "nested": {"smtp_password": "[REDACTED]", "session_id": "[REDACTED]"},
        "suffix": "ABCD",
    }


@pytest.mark.asyncio
async def test_admin_audit_service_filters_by_action_and_returns_actor_email(registration_db):
    async with registration_db() as db:
        actor = User(email=f"{uuid4()}@example.test", password_hash="x", role="admin")
        db.add(actor)
        await db.flush()
        db.add_all([
            AdminAuditLog(
                admin_user_id=actor.id,
                action="license_code_revoked",
                resource_type="license_code",
                resource_id="code-1",
                details={"reason": "库存作废"},
                created_at=datetime.now(timezone.utc),
            ),
            AdminAuditLog(
                admin_user_id=actor.id,
                action="user_suspended",
                resource_type="user",
                resource_id="user-1",
                details={},
                created_at=datetime.now(timezone.utc),
            ),
        ])
        await db.commit()

        logs, total = await AdminAuditService().list_logs(db, action="license_code_revoked")

        assert total == 1
        assert logs[0]["action"] == "license_code_revoked"
        assert logs[0]["actor_email"] == actor.email
