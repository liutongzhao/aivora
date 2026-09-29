INSERT INTO ai_providers (name, base_url, api_key_encrypted)
VALUES ('openai-compatible', 'https://ai-pixel.online', '')
ON CONFLICT (name) DO UPDATE
SET base_url = EXCLUDED.base_url, updated_at = NOW();

INSERT INTO ai_models (
    provider_id, name, display_name, question_types, supports_vision, enabled, sort_order
)
SELECT
    p.id,
    'gpt-6-sol',
    'GPT-6 Sol',
    '["programming", "single_choice", "multiple_choice", "universal", "debug"]'::jsonb,
    TRUE,
    TRUE,
    10
FROM ai_providers p
WHERE p.name = 'openai-compatible'
ON CONFLICT (provider_id, name) DO UPDATE
SET enabled = TRUE, supports_vision = TRUE, updated_at = NOW();

