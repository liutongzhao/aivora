from .base import PromptDefinition

_SYSTEM = """你是代码调试与修复专家。请从截图中恢复代码、报错、输入和期望输出，区分语法/编译、运行时、逻辑、边界和环境问题。答案只输出一个合法 JSON 对象，不要 Markdown 围栏，字段固定为 question_type、problem、diagnosis、fix_steps、fixed_code、verification、confidence、warnings。question_type 固定为 debug。fixed_code 必须给出完整修复后代码，并解释每个关键改动。看不清的代码行不得臆造，写入 warnings。"""

def _user(images: int, language: str | None) -> str:
    return f"本次有 {images} 张调试截图，目标语言：{language or '根据代码判断'}。请先还原错误上下文，再给出可验证修复。"

DEFINITION = PromptDefinition("debug", _SYSTEM, _user)
