ALTER TABLE remote_sessions
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE remote_sessions
SET created_at = connected_at,
    updated_at = COALESCE(disconnected_at, last_seen_at, connected_at);
