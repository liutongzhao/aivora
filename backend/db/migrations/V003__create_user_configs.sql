CREATE TABLE user_configs (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    ai_model VARCHAR(160) NOT NULL DEFAULT 'gpt-6-sol',
    programming_model VARCHAR(160) NOT NULL DEFAULT 'gpt-6-sol',
    multiple_choice_model VARCHAR(160) NOT NULL DEFAULT 'gpt-6-sol',
    universal_model VARCHAR(160) NOT NULL DEFAULT 'gpt-6-sol',
    language VARCHAR(40) NOT NULL DEFAULT 'python',
    theme VARCHAR(20) NOT NULL DEFAULT 'system',
    selected_provider VARCHAR(120) NOT NULL DEFAULT 'openai-compatible',
    shortcuts JSONB NOT NULL DEFAULT '{}'::jsonb,
    display JSONB NOT NULL DEFAULT '{}'::jsonb,
    processing JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

