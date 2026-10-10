ALTER TABLE users
    ADD COLUMN IF NOT EXISTS email_normalized VARCHAR(320),
    ADD COLUMN IF NOT EXISTS status VARCHAR(32) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_granted_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trial_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS trial_used INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS created_ip INET,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

UPDATE users
SET email_normalized = LOWER(email),
    status = CASE WHEN is_active THEN 'active' ELSE 'suspended' END,
    email_verified_at = COALESCE(email_verified_at, created_at)
WHERE email_normalized IS NULL;

ALTER TABLE users
    DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE users
    ADD CONSTRAINT users_status_check
    CHECK (status IN ('pending_verification', 'active', 'suspended', 'deleted'));

ALTER TABLE users
    ADD CONSTRAINT users_trial_total_check CHECK (trial_total >= 0),
    ADD CONSTRAINT users_trial_used_check CHECK (trial_used >= 0 AND trial_used <= trial_total);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_normalized
    ON users (email_normalized)
    WHERE email_normalized IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_status_created ON users (status, created_at DESC);

CREATE TABLE IF NOT EXISTS email_verification_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_normalized VARCHAR(320) NOT NULL,
    purpose VARCHAR(32) NOT NULL,
    code_hash CHAR(64) NOT NULL,
    registration_ticket_hash CHAR(64),
    registration_ticket_used_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    attempt_count INTEGER NOT NULL DEFAULT 0,
    request_ip INET,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT email_verification_purpose_check
        CHECK (purpose IN ('registration', 'email_change', 'password_reset')),
    CONSTRAINT email_verification_attempts_check CHECK (attempt_count >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_email_verification_ticket
    ON email_verification_codes (registration_ticket_hash)
    WHERE registration_ticket_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_email_verification_email_created
    ON email_verification_codes (email_normalized, purpose, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_verification_expires
    ON email_verification_codes (expires_at);
