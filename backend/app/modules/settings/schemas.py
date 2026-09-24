from pydantic import BaseModel, Field


class UserConfigResponse(BaseModel):
    aiModel: str
    programmingModel: str
    multipleChoiceModel: str
    universalModel: str
    language: str
    theme: str
    selectedProvider: str
    shortcuts: dict
    display: dict
    processing: dict


class UserConfigUpdate(BaseModel):
    aiModel: str | None = Field(default=None, max_length=160)
    programmingModel: str | None = Field(default=None, max_length=160)
    multipleChoiceModel: str | None = Field(default=None, max_length=160)
    universalModel: str | None = Field(default=None, max_length=160)
    language: str | None = Field(default=None, max_length=40)
    theme: str | None = Field(default=None, max_length=20)
    selectedProvider: str | None = Field(default=None, max_length=120)
    shortcuts: dict | None = None
    display: dict | None = None
    processing: dict | None = None

