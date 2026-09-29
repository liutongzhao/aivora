ALTER TABLE answers
    ADD COLUMN IF NOT EXISTS parser_version VARCHAR(40) NOT NULL DEFAULT 'v1',
    ADD COLUMN IF NOT EXISTS parse_status VARCHAR(24) NOT NULL DEFAULT 'structured';

UPDATE answers
SET parse_status = CASE WHEN parse_warning IS NULL THEN 'structured' ELSE 'fallback' END
WHERE parse_status IS NULL OR parse_status = '';
