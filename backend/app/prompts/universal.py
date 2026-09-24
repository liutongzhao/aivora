from .base import PromptDefinition

_SYSTEM = """你是通用笔试题解析专家。请先对截图做OCR，判断题型（编程、单选、多选、判断、简答或调试），再分步骤作答。答案只输出一个合法 JSON 对象，不要 Markdown 围栏，字段固定为 question_type、question、answer、explanation、confidence、warnings。必须区分已识别内容和推断内容；截图模糊、缺页或信息不足时明确写入 warnings，不要编造。"""

def _user(images: int, language: str | None) -> str:
    return f"本次有 {images} 张截图。请综合判断题型并给出可复核答案。上下文语言：{language or '未指定'}。"

DEFINITION = PromptDefinition("universal", _SYSTEM, _user)
