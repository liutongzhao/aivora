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
    task_dispatch_enabled: bool = False
    task_dispatch_global_limit: int = Field(default=4, ge=1)
    task_dispatch_user_limit: int = Field(default=2, ge=1)

    ai_base_url: str = "https://ai-pixel.online"
    ai_model: str = "gpt-6-sol"
    ai_api_key: str = ""
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
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
