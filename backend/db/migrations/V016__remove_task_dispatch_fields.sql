DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM ai_tasks
        WHERE status IN ('created', 'queued', 'processing', 'streaming')
    ) THEN
        RAISE EXCEPTION 'Drain Aivora queued and running tasks before V016 migration';
    END IF;
END $$;

DROP INDEX IF EXISTS idx_ai_tasks_dispatch;
DROP INDEX IF EXISTS idx_ai_tasks_input_cleanup_pending;
DROP INDEX IF EXISTS idx_ai_tasks_input_cleanup_recheck;
CREATE INDEX idx_task_stream_tokens_expires_at ON task_stream_tokens(expires_at);

ALTER TABLE ai_tasks
    DROP COLUMN dispatch_generation,
    DROP COLUMN lease_state,
    DROP COLUMN lease_expires_at,
    DROP COLUMN published_at,
    DROP COLUMN input_cleanup_attempted_at,
    DROP COLUMN input_cleanup_completed_at;
