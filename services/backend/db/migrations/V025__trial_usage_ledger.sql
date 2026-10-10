CREATE TABLE usage_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    task_id UUID REFERENCES ai_tasks(id) ON DELETE SET NULL,
    usage_type VARCHAR(32) NOT NULL,
    amount INTEGER NOT NULL,
    status VARCHAR(24) NOT NULL,
    idempotency_key VARCHAR(200) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    reversed_at TIMESTAMPTZ,
    reversal_reason TEXT,
    CONSTRAINT usage_amount_check CHECK (amount > 0),
    CONSTRAINT usage_status_check CHECK (status IN ('reserved', 'committed', 'reversed'))
);

CREATE INDEX idx_usage_ledger_user_created ON usage_ledger (user_id, created_at DESC);
CREATE INDEX idx_usage_ledger_task ON usage_ledger (task_id);
