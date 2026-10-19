CREATE TABLE IF NOT EXISTS trial_model_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE,
    base_url TEXT NOT NULL,
    api_key_encrypted TEXT NOT NULL,
    model_name VARCHAR(160) NOT NULL,
    display_name VARCHAR(160) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    trial_total INTEGER NOT NULL DEFAULT 20,
    updated_by UUID REFERENCES users(id),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT trial_model_settings_singleton CHECK (id = TRUE),
    CONSTRAINT trial_model_settings_trial_total_check CHECK (trial_total >= 0)
);
