from pathlib import Path


MIGRATION = Path(__file__).resolve().parents[2] / "services/backend/db/migrations/V024__registration_email_verification.sql"


def test_registration_migration_defines_verification_and_account_state():
    sql = MIGRATION.read_text()
    assert "email_normalized" in sql
    assert "email_verified_at" in sql
    assert "status" in sql
    assert "CREATE TABLE IF NOT EXISTS email_verification_codes" in sql
    assert "registration_ticket_hash" in sql
    assert "CHECK (status IN ('pending_verification', 'active', 'suspended', 'deleted'))" in sql


def test_registration_migration_keeps_existing_users_usable():
    sql = MIGRATION.read_text()
    assert "UPDATE users" in sql
    assert "CASE WHEN is_active THEN 'active' ELSE 'suspended' END" in sql
