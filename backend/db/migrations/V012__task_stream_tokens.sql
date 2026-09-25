CREATE TABLE task_stream_tokens (
    task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
    token_hash CHAR(64) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (task_id, token_hash)
);
