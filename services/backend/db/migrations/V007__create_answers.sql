CREATE TABLE answers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL UNIQUE REFERENCES ai_tasks(id) ON DELETE CASCADE,
    question_type VARCHAR(40),
    content TEXT,
    raw_content TEXT,
    parsed JSONB NOT NULL DEFAULT '{}'::jsonb,
    parse_warning TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

