CREATE TABLE task_images (
    task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
    ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
    stored_file_id UUID NOT NULL REFERENCES stored_files(id),
    PRIMARY KEY (task_id, ordinal)
);

ALTER TABLE ai_tasks ADD COLUMN dispatch_generation INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ai_tasks ADD COLUMN lease_state VARCHAR(16);
ALTER TABLE ai_tasks ADD COLUMN lease_expires_at TIMESTAMPTZ;
ALTER TABLE ai_tasks ADD COLUMN published_at TIMESTAMPTZ;

CREATE INDEX idx_ai_tasks_dispatch ON ai_tasks(status, created_at, user_id);
