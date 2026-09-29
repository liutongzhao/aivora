from dataclasses import dataclass
from typing import Callable


@dataclass(frozen=True)
class PromptDefinition:
    mode: str
    system_prompt: str
    _user_prompt: Callable[[int, str | None], str]

    def user_prompt(self, images_count: int, language: str | None = None) -> str:
        return self._user_prompt(images_count, language)
