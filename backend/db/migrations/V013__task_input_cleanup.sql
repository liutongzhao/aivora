ALTER TABLE ai_tasks ADD COLUMN input_cleanup_attempted_at TIMESTAMPTZ;
ALTER TABLE ai_tasks ADD COLUMN input_cleanup_completed_at TIMESTAMPTZ;

CREATE INDEX idx_ai_tasks_input_cleanup_pending
    ON ai_tasks(input_cleanup_attempted_at, created_at)
    WHERE status = 'failed'
      AND error_code = 'TASK_INPUT_INTERRUPTED'
      AND input_cleanup_completed_at IS NULL;
