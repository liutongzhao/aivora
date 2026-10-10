CREATE TABLE license_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    default_duration_months INTEGER NOT NULL DEFAULT 6,
    max_duration_months INTEGER NOT NULL DEFAULT 24,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT license_duration_check CHECK (
        default_duration_months > 0 AND max_duration_months >= default_duration_months
    )
);

INSERT INTO license_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

CREATE TABLE license_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(160),
    duration_months INTEGER NOT NULL,
    quantity INTEGER NOT NULL,
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT license_batch_duration_check CHECK (duration_months > 0),
    CONSTRAINT license_batch_quantity_check CHECK (quantity > 0)
);

CREATE TABLE license_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    batch_id UUID NOT NULL REFERENCES license_batches(id) ON DELETE CASCADE,
    code_hash CHAR(64) NOT NULL UNIQUE,
    code_suffix VARCHAR(16) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'unused',
    activated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    activated_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT license_code_status_check CHECK (status IN ('unused', 'activated', 'revoked'))
);

CREATE INDEX idx_license_codes_batch_status ON license_codes (batch_id, status);

CREATE TABLE user_entitlements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entitlement_type VARCHAR(32) NOT NULL DEFAULT 'license',
    starts_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'active',
    source VARCHAR(32) NOT NULL,
    source_license_id UUID REFERENCES license_codes(id) ON DELETE SET NULL,
    created_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ,
    revoke_reason TEXT,
    CONSTRAINT entitlement_status_check CHECK (status IN ('active', 'expired', 'paused', 'revoked')),
    CONSTRAINT entitlement_dates_check CHECK (expires_at > starts_at)
);

CREATE INDEX idx_entitlements_user_expiry ON user_entitlements (user_id, expires_at DESC);
