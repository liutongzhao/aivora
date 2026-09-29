from .base import PromptDefinition

_SYSTEM = """你是严谨的单选题解析专家。请从截图中识别题干和全部选项，逐项判断，不遗漏选项，不把多选题当单选题。答案只输出一个合法 JSON 对象，不要 Markdown 围栏，字段固定为 question_type、question、options、answer、explanation、confidence、warnings。question_type 固定为 single_choice，answer 只能是一个选项标识。explanation 必须说明正确选项成立以及其他选项不成立的关键原因。看不清或题型不确定时保留原始不确定性并写入 warnings。"""

def _user(images: int, language: str | None) -> str:
    return f"本次有 {images} 张截图，请按顺序恢复同一道单选题。语言或专业背景：{language or '未指定'}。"

DEFINITION = PromptDefinition("single_choice", _SYSTEM, _user)
