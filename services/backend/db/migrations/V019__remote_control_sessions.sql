ALTER TABLE remote_sessions
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
    ADD COLUMN IF NOT EXISTS mobile_connected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS desktop_connected_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS disconnect_reason VARCHAR(80),
    ADD COLUMN IF NOT EXISTS duration_seconds INTEGER;

-- Earlier clients never managed server-side active sessions. Treat their rows as history.
UPDATE remote_sessions
SET status = 'closed',
    disconnected_at = COALESCE(disconnected_at, last_seen_at, connected_at),
    disconnect_reason = 'legacy_session'
WHERE status IN ('pending', 'connecting', 'active', 'closing');

CREATE INDEX IF NOT EXISTS idx_remote_sessions_user_created
    ON remote_sessions (user_id, connected_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uq_remote_sessions_one_active_per_user
    ON remote_sessions (user_id)
    WHERE status IN ('pending', 'connecting', 'active', 'closing');

ALTER TABLE pairing_codes
    ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES remote_sessions(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS consumed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_pairing_codes_user_created
    ON pairing_codes (user_id, created_at DESC);
