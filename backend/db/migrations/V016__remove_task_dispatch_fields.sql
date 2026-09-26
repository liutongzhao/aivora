DROP INDEX IF EXISTS idx_ai_tasks_dispatch;
DROP INDEX IF EXISTS idx_ai_tasks_input_cleanup_pending;
DROP INDEX IF EXISTS idx_ai_tasks_input_cleanup_recheck;

ALTER TABLE ai_tasks
    DROP COLUMN dispatch_generation,
    DROP COLUMN lease_state,
    DROP COLUMN lease_expires_at,
    DROP COLUMN published_at,
    DROP COLUMN input_cleanup_attempted_at,
    DROP COLUMN input_cleanup_completed_at;
