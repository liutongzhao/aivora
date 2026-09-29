CREATE TABLE system_settings (
    key VARCHAR(160) PRIMARY KEY,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action VARCHAR(120) NOT NULL,
    resource_type VARCHAR(80) NOT NULL,
    resource_id VARCHAR(160),
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_admin_audit_created ON admin_audit_logs (created_at DESC);

CREATE TABLE client_releases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    version VARCHAR(80) NOT NULL UNIQUE,
    platform VARCHAR(40) NOT NULL,
    download_url TEXT NOT NULL,
    release_notes TEXT,
    is_latest BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

