ALTER TABLE question_model_defaults
    ALTER COLUMN model_id DROP NOT NULL;

ALTER TABLE question_model_defaults
    ADD COLUMN use_trial_model BOOLEAN NOT NULL DEFAULT FALSE;
