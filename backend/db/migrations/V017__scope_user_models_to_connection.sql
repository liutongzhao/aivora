ALTER TABLE user_models
    DROP CONSTRAINT user_models_user_id_name_key;

ALTER TABLE user_models
    ADD CONSTRAINT user_models_connection_id_name_key UNIQUE (connection_id, name);
