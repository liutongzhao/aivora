from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User
from app.modules.settings.schemas import UserConfigResponse, UserConfigUpdate
from app.modules.settings.service import SettingsService

router = APIRouter(prefix="/api", tags=["settings"])


@router.get("/config", response_model=UserConfigResponse)
async def get_config(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await SettingsService(db).get_config(user.id)


@router.put("/config", response_model=UserConfigResponse)
async def update_config(
    request: UserConfigUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await SettingsService(db).update_config(user.id, request)


@router.post("/config/shortcuts", response_model=UserConfigResponse)
async def update_shortcuts(
    payload: dict,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    return await SettingsService(db).update_config(
        user.id, UserConfigUpdate(shortcuts=payload.get("shortcuts", {}))
    )

