CREATE INDEX idx_ai_tasks_input_cleanup_recheck
    ON ai_tasks(input_cleanup_completed_at, created_at)
    WHERE status = 'failed'
      AND error_code = 'TASK_INPUT_INTERRUPTED'
      AND input_cleanup_completed_at IS NOT NULL;
