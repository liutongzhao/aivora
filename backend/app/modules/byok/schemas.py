from uuid import UUID

from pydantic import BaseModel, Field, HttpUrl


class ConnectionCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    base_url: HttpUrl
    api_key: str = Field(min_length=8, max_length=4096)


class ConnectionUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    base_url: HttpUrl | None = None
    api_key: str | None = Field(default=None, min_length=8, max_length=4096)
    enabled: bool | None = None
    replace_key: bool = False


class ConnectionResponse(BaseModel):
    id: UUID
    name: str
    base_url: str
    enabled: bool
    key_configured: bool = True


class ModelCreate(BaseModel):
    connection_id: UUID
    name: str = Field(min_length=1, max_length=160)
    display_name: str = Field(min_length=1, max_length=160)
    supports_vision: bool = True


class ModelUpdate(BaseModel):
    connection_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=160)
    display_name: str | None = Field(default=None, min_length=1, max_length=160)
    supports_vision: bool | None = None
    enabled: bool | None = None


class ModelResponse(BaseModel):
    id: UUID
    connection_id: UUID
    name: str
    display_name: str
    supports_vision: bool
    enabled: bool


class ModelDefaultUpdate(BaseModel):
    model_id: UUID
    language: str = Field(default="python", max_length=40)


class ConnectionTestRequest(BaseModel):
    base_url: HttpUrl
    api_key: str = Field(min_length=8, max_length=4096)


class PromptUpdate(BaseModel):
    content: str = Field(min_length=1, max_length=20000)
