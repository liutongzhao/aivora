from uuid import UUID

from pydantic import BaseModel, Field


class AIModelResponse(BaseModel):
    id: UUID
    name: str
    display_name: str
    question_types: list[str]
    supports_vision: bool


class AIModelCreate(BaseModel):
    provider_id: UUID
    name: str = Field(min_length=1, max_length=160)
    display_name: str = Field(min_length=1, max_length=160)
    question_types: list[str] = Field(default_factory=list)
    supports_vision: bool = False
    enabled: bool = True
    sort_order: int = 0
