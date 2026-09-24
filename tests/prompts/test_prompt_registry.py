from app.prompts.registry import PromptRegistry


def test_programming_prompt_is_detailed_and_localized():
    definition = PromptRegistry.get("programming", "zh-CN")
    prompt = definition.user_prompt(2, "zh-CN")
    assert "输入" in definition.system_prompt
    assert "复杂度" in definition.system_prompt
    assert "2" in prompt
    assert "JSON" in definition.system_prompt


def test_unknown_mode_falls_back_to_universal():
    definition = PromptRegistry.get("unknown", "zh-CN")
    assert definition.mode == "universal"
