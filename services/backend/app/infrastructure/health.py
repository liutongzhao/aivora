from fastapi import APIRouter
from sqlalchemy import text
from redis.asyncio import Redis

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.infrastructure.storage import storage

router = APIRouter(tags=["system"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready() -> dict:
    checks: dict[str, str] = {}
    try:
        async with session_factory() as db:
            await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "error"
    redis = Redis.from_url(get_settings().redis_url)
    try:
        await redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "error"
    finally:
        await redis.aclose()
    try:
        storage.ensure_bucket()
        checks["minio"] = "ok"
    except Exception:
        checks["minio"] = "error"
    status = "ready" if all(value == "ok" for value in checks.values()) else "degraded"
    return {"status": status, "service": get_settings().app_name, "checks": checks}
