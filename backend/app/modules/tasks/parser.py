import json
import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class ParsedAnswer:
    content: str
    parsed: dict[str, Any]
    warning: str | None = None


def _extract_json(raw: str) -> dict[str, Any] | None:
    candidates = [raw.strip()]
    fenced = re.findall(r"```(?:json)?\s*(.*?)```", raw, flags=re.IGNORECASE | re.DOTALL)
    candidates.extend(fenced)
    for candidate in candidates:
        try:
            value = json.loads(candidate)
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(value, dict):
            return value
    return None


def parse_answer(raw_content: str, mode: str) -> ParsedAnswer:
    parsed = _extract_json(raw_content)
    if parsed is not None:
        parsed.setdefault("question_type", mode)
        return ParsedAnswer(raw_content, parsed, None)
    return ParsedAnswer(
        raw_content,
        {"question_type": mode, "answer": raw_content, "raw": raw_content},
        "模型返回的内容不是合法 JSON，已保留原文。",
    )
