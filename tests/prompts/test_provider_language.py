import json

import httpx
import pytest

from app.providers.openai_compatible import OpenAICompatibleProvider


@pytest.mark.asyncio
async def test_programming_language_is_in_system_message_with_custom_user_prompt(monkeypatch):
    payloads = []

    def respond(request):
        payloads.append(json.loads(request.content))
        return httpx.Response(200, text="data: [DONE]\n\n")

    transport = httpx.MockTransport(respond)
    original_client = httpx.AsyncClient
    monkeypatch.setattr(
        httpx, "AsyncClient",
        lambda **kwargs: original_client(transport=transport, **kwargs),
    )
    provider = OpenAICompatibleProvider(base_url="https://example.com/v1", api_key="test-key")

    async for _ in provider.stream_answer(
        ["data:image/png;base64,AA=="], "programming", "test-model", "java", "请简洁作答"
    ):
        pass

    system, user = payloads[0]["messages"]
    assert "java" in system["content"]
    assert "目标编程语言" in system["content"]
    assert user["content"][0]["text"] == "请简洁作答"
