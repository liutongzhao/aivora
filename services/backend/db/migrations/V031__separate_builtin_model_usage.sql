ALTER TABLE users
    ADD COLUMN IF NOT EXISTS builtin_model_total INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS builtin_model_used INTEGER NOT NULL DEFAULT 0;

UPDATE users
SET builtin_model_total = COALESCE(
        (SELECT trial_total FROM trial_model_settings WHERE id = TRUE),
        trial_total
    )
WHERE builtin_model_total = 0;

ALTER TABLE users
    ADD CONSTRAINT users_builtin_model_total_check CHECK (builtin_model_total >= 0),
    ADD CONSTRAINT users_builtin_model_used_check CHECK (builtin_model_used >= 0);

ALTER TABLE ai_tasks
    ADD COLUMN IF NOT EXISTS builtin_model_usage_ledger_id UUID REFERENCES usage_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_builtin_model_usage_ledger
    ON ai_tasks (builtin_model_usage_ledger_id);
