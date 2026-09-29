CREATE TABLE provider_connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(120) NOT NULL,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name)
);

CREATE INDEX idx_provider_connections_user ON provider_connections(user_id);

CREATE TABLE user_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    connection_id UUID NOT NULL REFERENCES provider_connections(id) ON DELETE CASCADE,
    name VARCHAR(160) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    supports_vision BOOLEAN NOT NULL DEFAULT TRUE,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, name),
    UNIQUE (user_id, id)
);

CREATE TABLE question_model_defaults (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(40) NOT NULL,
    model_id UUID NOT NULL REFERENCES user_models(id) ON DELETE RESTRICT,
    language VARCHAR(40) NOT NULL DEFAULT 'python',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, mode)
);

CREATE TABLE user_prompt_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode VARCHAR(40) NOT NULL,
    version INTEGER NOT NULL,
    content TEXT NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_id, mode, version)
);

CREATE INDEX idx_user_prompt_versions_user_mode
    ON user_prompt_versions(user_id, mode, version DESC);

ALTER TABLE ai_tasks
    ADD COLUMN provider_connection_id UUID REFERENCES provider_connections(id),
    ADD COLUMN user_model_id UUID REFERENCES user_models(id),
    ADD COLUMN prompt_version_id UUID REFERENCES user_prompt_versions(id);

CREATE INDEX idx_ai_tasks_user_model_config
    ON ai_tasks(provider_connection_id, user_model_id, prompt_version_id);
