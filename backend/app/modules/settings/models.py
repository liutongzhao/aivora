from datetime import datetime
from uuid import UUID

from sqlalchemy import DateTime, JSON, String, func
from sqlalchemy.dialects.postgresql import UUID as PGUUID
from sqlalchemy.orm import Mapped, mapped_column

from app.infrastructure.models import Base


class UserConfig(Base):
    __tablename__ = "user_configs"

    user_id: Mapped[UUID] = mapped_column(PGUUID(as_uuid=True), primary_key=True)
    ai_model: Mapped[str] = mapped_column(String(160))
    programming_model: Mapped[str] = mapped_column(String(160))
    multiple_choice_model: Mapped[str] = mapped_column(String(160))
    universal_model: Mapped[str] = mapped_column(String(160))
    language: Mapped[str] = mapped_column(String(40))
    theme: Mapped[str] = mapped_column(String(20))
    selected_provider: Mapped[str] = mapped_column(String(120))
    shortcuts: Mapped[dict] = mapped_column(JSON)
    display: Mapped[dict] = mapped_column(JSON)
    processing: Mapped[dict] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

