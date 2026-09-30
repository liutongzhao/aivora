CREATE TABLE remote_commands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES remote_sessions(id) ON DELETE CASCADE,
    request_id VARCHAR(160) NOT NULL,
    action VARCHAR(80) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'created',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ,
    finished_at TIMESTAMPTZ,
    duration_ms INTEGER,
    error_code VARCHAR(80),
    error_message TEXT,
    UNIQUE (session_id, request_id)
);

CREATE INDEX idx_remote_commands_session_created
    ON remote_commands (session_id, created_at DESC);
