from fastapi import APIRouter

from app.config import get_settings

router = APIRouter(tags=["system"])


@router.get("/health/live")
async def live() -> dict[str, str]:
    return {"status": "ok"}


@router.get("/health/ready")
async def ready() -> dict[str, str]:
    # Dependency-specific probes are added when the production health runner is enabled.
    return {"status": "ready", "service": get_settings().app_name}
