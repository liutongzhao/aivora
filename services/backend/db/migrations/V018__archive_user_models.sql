ALTER TABLE user_models
    ADD COLUMN archived BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE user_models
    DROP CONSTRAINT user_models_connection_id_name_key;

CREATE UNIQUE INDEX user_models_connection_id_name_active_key
    ON user_models(connection_id, name)
    WHERE archived = FALSE;
