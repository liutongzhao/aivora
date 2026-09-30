UPDATE remote_commands AS command
SET status = 'cancelled',
    finished_at = COALESCE(command.finished_at, session.disconnected_at, NOW()),
    error_code = 'SESSION_CLOSED',
    error_message = '远程会话已结束'
FROM remote_sessions AS session
WHERE command.session_id = session.id
  AND session.status NOT IN ('pending', 'connecting', 'active', 'closing')
  AND command.status IN ('created', 'accepted', 'running');
