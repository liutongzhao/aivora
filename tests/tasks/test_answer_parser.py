from app.modules.tasks.parser import parse_answer


def test_parse_json_code_fence():
    raw = '''```json
{"question_type":"single_choice","answer":"B","explanation":"因为条件成立"}
```'''
    parsed = parse_answer(raw, "single_choice")
    assert parsed.parsed["answer"] == "B"
    assert parsed.warning is None
    assert parsed.content == raw


def test_parse_malformed_json_keeps_raw_content_and_warning():
    parsed = parse_answer("无法识别的答案", "programming")
    assert parsed.parsed["question_type"] == "programming"
    assert parsed.warning
    assert parsed.content == "无法识别的答案"
