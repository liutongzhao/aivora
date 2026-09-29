from datetime import datetime
from uuid import UUID

from pydantic import BaseModel


class FileResponse(BaseModel):
    id: UUID
    object_key: str
    content_type: str
    size_bytes: int
    created_at: datetime


class FileUrlResponse(BaseModel):
    file_id: UUID
    url: str
    expires_in: int
