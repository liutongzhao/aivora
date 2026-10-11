ALTER TABLE provider_connections
    ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_provider_connections_user_archived
    ON provider_connections(user_id, archived);
