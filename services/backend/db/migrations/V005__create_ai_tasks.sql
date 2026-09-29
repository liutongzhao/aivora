CREATE TABLE ai_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    client_request_id VARCHAR(160),
    mode VARCHAR(40) NOT NULL,
    language VARCHAR(40),
    status VARCHAR(30) NOT NULL DEFAULT 'created',
    stage VARCHAR(80) NOT NULL DEFAULT 'created',
    progress SMALLINT NOT NULL DEFAULT 0,
    input_image_count INTEGER NOT NULL DEFAULT 0,
    stream_token_hash CHAR(64),
    stream_token_expires_at TIMESTAMPTZ,
    error_code VARCHAR(80),
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT ai_tasks_status_check CHECK (
        status IN ('created', 'queued', 'processing', 'streaming', 'completed', 'failed', 'cancelled', 'expired')
    ),
    CONSTRAINT ai_tasks_progress_check CHECK (progress >= 0 AND progress <= 100)
);

CREATE UNIQUE INDEX idx_ai_tasks_user_idempotency
    ON ai_tasks (user_id, client_request_id)
    WHERE client_request_id IS NOT NULL;
CREATE INDEX idx_ai_tasks_user_created ON ai_tasks (user_id, created_at DESC);
CREATE INDEX idx_ai_tasks_status ON ai_tasks (status);

