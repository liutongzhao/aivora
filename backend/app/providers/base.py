from dataclasses import dataclass
from typing import AsyncIterator, Protocol


@dataclass(frozen=True)
class ProviderChunk:
    text: str
    finished: bool = False


class AIProvider(Protocol):
    async def stream_answer(
        self,
        images: list[str],
        mode: str,
        model: str,
        language: str | None,
    ) -> AsyncIterator[ProviderChunk]:
        ...

