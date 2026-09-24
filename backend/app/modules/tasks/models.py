from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Integer, JSON, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.models import Base


class AITask(Base):
    __tablename__ = "ai_tasks"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    client_request_id: Mapped[str | None] = mapped_column(String(160), nullable=True)
    mode: Mapped[str] = mapped_column(String(40))
    language: Mapped[str | None] = mapped_column(String(40))
    status: Mapped[str] = mapped_column(String(30), default="created")
    stage: Mapped[str] = mapped_column(String(80), default="created")
    progress: Mapped[int] = mapped_column(SmallInteger, default=0)
    input_image_count: Mapped[int] = mapped_column(Integer, default=0)
    stream_token_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    stream_token_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    error_code: Mapped[str | None] = mapped_column(String(80))
    error_message: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class TaskEvent(Base):
    __tablename__ = "task_events"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), index=True)
    event_id: Mapped[str] = mapped_column(String(120))
    sequence: Mapped[int] = mapped_column(Integer)
    event_type: Mapped[str] = mapped_column(String(40))
    stage: Mapped[str | None] = mapped_column(String(80))
    progress: Mapped[int | None] = mapped_column(SmallInteger)
    data: Mapped[dict] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Answer(Base):
    __tablename__ = "answers"

    id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True, default=uuid4)
    task_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), unique=True)
    question_type: Mapped[str | None] = mapped_column(String(40))
    content: Mapped[str | None] = mapped_column(Text)
    raw_content: Mapped[str | None] = mapped_column(Text)
    parsed: Mapped[dict] = mapped_column(JSON)
    parse_warning: Mapped[str | None] = mapped_column(Text)
    parser_version: Mapped[str] = mapped_column(String(40), default="v1")
    parse_status: Mapped[str] = mapped_column(String(24), default="structured")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
