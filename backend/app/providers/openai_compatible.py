import json
from collections.abc import AsyncIterator

import httpx

from app.config import get_settings
from app.providers.base import ProviderChunk


class OpenAICompatibleProvider:
    def __init__(self, base_url: str | None = None, api_key: str | None = None) -> None:
        settings = get_settings()
        self.base_url = (base_url or settings.ai_base_url).rstrip("/")
        self.api_key = api_key or settings.ai_api_key
        self.timeout = httpx.Timeout(120.0, connect=20.0)

    async def stream_answer(
        self,
        images: list[str],
        mode: str,
        model: str,
        language: str | None,
    ) -> AsyncIterator[ProviderChunk]:
        if not self.api_key:
            raise RuntimeError("AI_API_KEY 未配置")
        prompt = (
            f"请分析截图中的题目。题型：{mode}。"
            f"编程语言：{language or '未指定'}。请给出清晰、可读、可复核的答案。"
        )
        content: list[dict] = [{"type": "text", "text": prompt}]
        content.extend({"type": "image_url", "image_url": {"url": image}} for image in images)
        payload = {
            "model": model,
            "stream": True,
            "messages": [{"role": "user", "content": content}],
        }
        headers = {"Authorization": f"Bearer {self.api_key}", "Content-Type": "application/json"}
        endpoint = (
            f"{self.base_url}/chat/completions"
            if self.base_url.endswith("/v1")
            else f"{self.base_url}/v1/chat/completions"
        )
        async with httpx.AsyncClient(timeout=self.timeout) as client:
            async with client.stream(
                "POST",
                endpoint,
                headers=headers,
                json=payload,
            ) as response:
                response.raise_for_status()
                async for line in response.aiter_lines():
                    if not line or not line.startswith("data:"):
                        continue
                    raw = line[5:].strip()
                    if raw == "[DONE]":
                        yield ProviderChunk("", finished=True)
                        return
                    item = json.loads(raw)
                    delta = item.get("choices", [{}])[0].get("delta", {}).get("content")
                    if delta:
                        yield ProviderChunk(delta)
