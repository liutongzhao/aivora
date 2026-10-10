ALTER TABLE ai_tasks
    ADD COLUMN IF NOT EXISTS usage_ledger_id UUID REFERENCES usage_ledger(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ai_tasks_usage_ledger ON ai_tasks (usage_ledger_id);
