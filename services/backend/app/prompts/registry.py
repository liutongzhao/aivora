from .base import PromptDefinition
from .debug import DEFINITION as DEBUG
from .multiple_choice import DEFINITION as MULTIPLE_CHOICE
from .programming import DEFINITION as PROGRAMMING
from .single_choice import DEFINITION as SINGLE_CHOICE
from .universal import DEFINITION as UNIVERSAL

_DEFINITIONS = {d.mode: d for d in (PROGRAMMING, SINGLE_CHOICE, MULTIPLE_CHOICE, DEBUG, UNIVERSAL)}


class PromptRegistry:
    @classmethod
    def get(cls, mode: str | None, language: str | None = None) -> PromptDefinition:
        del language
        return _DEFINITIONS.get((mode or "").lower(), UNIVERSAL)
