from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.models import Base


class StoredFile(Base):
    __tablename__ = "stored_files"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    task_id: Mapped[UUID | None] = mapped_column(PGUUID(as_uuid=True), nullable=True)
    bucket_name: Mapped[str] = mapped_column(String(120))
    object_key: Mapped[str] = mapped_column(Text, unique=True)
    content_type: Mapped[str] = mapped_column(String(160))
    size_bytes: Mapped[int] = mapped_column()
    sha256: Mapped[str | None] = mapped_column(String(64))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
