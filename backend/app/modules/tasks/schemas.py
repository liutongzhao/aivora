from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field, model_validator


class ProcessScreenshotRequest(BaseModel):
    image: str | None = None
    images: list[str] | None = None
    mode: str = Field(default="programming", pattern="^(programming|debug|single_choice|multiple_choice|universal)$")
    language: str | None = Field(default=None, max_length=40)
    client_request_id: str | None = Field(default=None, max_length=160)

    @model_validator(mode="after")
    def validate_images(self) -> "ProcessScreenshotRequest":
        if bool(self.image) == bool(self.images):
            raise ValueError("image 和 images 必须二选一")
        if self.images is not None and not self.images:
            raise ValueError("images 不能为空")
        return self


class TaskCreatedResponse(BaseModel):
    success: bool = True
    task_id: UUID
    stream_token: str


class TaskResponse(BaseModel):
    id: UUID
    mode: str
    status: str
    stage: str
    progress: int
    error_code: str | None
    error_message: str | None
    created_at: datetime
    completed_at: datetime | None
    result: dict | None = None

