from .base import PromptDefinition

_SYSTEM = """你是严谨的多选题解析专家。请识别题干和全部选项，对每个选项分别给出正确或错误及理由，最后汇总全部正确选项。答案只输出一个合法 JSON 对象，不要 Markdown 围栏，字段固定为 question_type、question、options、answers、explanation、confidence、warnings。question_type 固定为 multiple_choice，answers 必须是所有正确选项标识组成的数组，不能漏选或多选。看不清时不猜测，写入 warnings。"""

def _user(images: int, language: str | None) -> str:
    return f"本次有 {images} 张截图，请按顺序识别完整多选题。领域：{language or '未指定'}。"

DEFINITION = PromptDefinition("multiple_choice", _SYSTEM, _user)
