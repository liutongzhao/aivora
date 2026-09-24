CREATE TABLE task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
    event_id VARCHAR(120) NOT NULL,
    sequence BIGSERIAL NOT NULL,
    event_type VARCHAR(40) NOT NULL,
    stage VARCHAR(80),
    progress SMALLINT,
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (task_id, event_id),
    UNIQUE (task_id, sequence)
);

CREATE INDEX idx_task_events_task_sequence ON task_events (task_id, sequence);

