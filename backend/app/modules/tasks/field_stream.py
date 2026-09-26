import json
from dataclasses import dataclass


@dataclass(frozen=True)
class FieldEvent:
    type: str
    field: str
    delta: str | None = None
    value: str | list[str] | None = None


class FieldProjector:
    """Projects safe, decoded fields from a growing JSON response."""

    def __init__(self, mode: str):
        self.mode = mode
        self.buffer = ""
        self.emitted: dict[str, int] = {}
        self.answer_emitted = False

    def feed(self, chunk: str) -> list[FieldEvent]:
        self.buffer += chunk
        events: list[FieldEvent] = []
        for field in ("code", "fixed_code", "explanation", "analysis", "reasoning", "thoughts"):
            value = self._string_field(field)
            if value is None:
                continue
            previous = self.emitted.get(field, 0)
            if len(value) > previous:
                event_type = "code_delta" if field in {"code", "fixed_code"} else "explanation_delta"
                events.append(FieldEvent(event_type, field, delta=value[previous:]))
                self.emitted[field] = len(value)
        if not self.answer_emitted:
            try:
                parsed = json.loads(self.buffer)
            except (json.JSONDecodeError, TypeError):
                parsed = None
            if isinstance(parsed, dict):
                answer = parsed.get("answer")
                answers = parsed.get("answers")
                if isinstance(answer, str) and answer:
                    events.append(FieldEvent("answer_set", "answer", value=answer))
                    self.answer_emitted = True
                elif isinstance(answers, list) and all(isinstance(item, str) for item in answers):
                    events.append(FieldEvent("answer_set", "answers", value=answers))
                    self.answer_emitted = True
        return events

    def finish(self) -> str | None:
        try:
            json.loads(self.buffer)
        except json.JSONDecodeError as error:
            return f"模型结果尚未完成或不是有效 JSON: {error.msg}"
        return None

    def _string_field(self, field: str) -> str | None:
        marker = json.dumps(field, ensure_ascii=False) + ":"
        start = self.buffer.find(marker)
        if start < 0:
            return None
        start += len(marker)
        while start < len(self.buffer) and self.buffer[start].isspace():
            start += 1
        if start >= len(self.buffer) or self.buffer[start] != '"':
            return None
        decoder = json.JSONDecoder()
        try:
            value, _ = decoder.raw_decode(self.buffer[start:])
        except json.JSONDecodeError:
            return None
        return value if isinstance(value, str) else None
