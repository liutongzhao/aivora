import json
from unittest.mock import AsyncMock
from uuid import uuid4

import pytest

from app.modules.tasks.parser import parse_answer


def test_screenshot_answer_contract_preserves_structured_result(sample_png):
    raw = json.dumps({"question_type": "single_choice", "answer": "B", "explanation": "本地模拟答案"}, ensure_ascii=False)
    parsed = parse_answer(raw, "single_choice")
    assert parsed.parsed["answer"] == "B"
    assert parsed.warning is None
    assert sample_png.startswith("data:image/png;base64,")


def test_malformed_provider_response_reaches_answer_with_warning():
    parsed = parse_answer("provider timeout partial", "programming")
    assert parsed.parsed["answer"] == "provider timeout partial"
    assert parsed.warning is not None
