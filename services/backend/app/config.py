from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "Aivora API"
    environment: str = "development"
    api_host: str = "127.0.0.1"
    api_port: int = 8000
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    database_url: str = Field(
        default="postgresql+asyncpg://aivora:aivora@127.0.0.1:15439/aivora"
    )
    redis_url: str = "redis://127.0.0.1:16379/0"
    minio_endpoint: str = "127.0.0.1:19000"
    minio_access_key: str = "aivora"
    minio_secret_key: str = "change-me"
    minio_secure: bool = False
    minio_bucket: str = "aivora-private"
    task_image_timeout_seconds: float = 20.0
    # Every model request must use the user's own provider connection.
    byok_required: bool = True
    task_dispatch_global_limit: int = Field(default=4, ge=1)
    task_dispatch_user_limit: int = Field(default=2, ge=1)
    trial_searches: int = Field(default=5, ge=0)
    license_default_duration_months: int = Field(default=6, ge=1, le=120)
    license_max_duration_months: int = Field(default=24, ge=1, le=120)

    mail_provider: str = "smtp"
    mail_host: str = ""
    mail_port: int = Field(default=465, ge=1, le=65535)
    mail_username: str = ""
    mail_password: str = ""
    mail_from: str = ""
    mail_from_name: str = "Aivora"
    mail_use_tls: bool = True
    mail_code_ttl_minutes: int = Field(default=10, ge=1, le=60)
    mail_registration_ticket_ttl_minutes: int = Field(default=15, ge=1, le=60)
    password_reset_ttl_minutes: int = Field(default=30, ge=5, le=120)
    web_base_url: str = "http://localhost:3000"

    ai_base_url: str = "https://ai-pixel.online"
    ai_model: str = "gpt-6-sol"
    ai_api_key: str = ""
    aivora_master_key: str = ""
    initial_admin_email: str = ""
    initial_admin_password: str = ""

    model_config = SettingsConfigDict(
        env_file=(".env", ".env.local"),
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        origins = [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]
        if self.environment == "development":
            for origin in ("http://127.0.0.1:54321", "http://localhost:54321"):
                if origin not in origins:
                    origins.append(origin)
        return origins


@lru_cache
def get_settings() -> Settings:
    return Settings()
