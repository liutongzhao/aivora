from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import require_admin
from app.modules.identity.models import User
from app.modules.models.schemas import AIModelCreate, AIModelResponse
from app.modules.models.service import ModelCatalogService

router = APIRouter(prefix="/api", tags=["models"])


@router.get("/ai/models", response_model=list[AIModelResponse])
async def list_models(db: AsyncSession = Depends(get_db_session)) -> list:
    return await ModelCatalogService(db).list_enabled()


@router.get("/admin/models", response_model=list[AIModelResponse])
async def list_admin_models(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> list:
    return await ModelCatalogService(db).list_all()


@router.post("/admin/models", response_model=AIModelResponse, status_code=201)
async def create_model(
    request: AIModelCreate,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> object:
    return await ModelCatalogService(db).create(request)


@router.patch("/admin/models/{model_id}/enabled", response_model=AIModelResponse)
async def set_model_enabled(
    model_id: UUID,
    enabled: bool,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db_session),
) -> object:
    model = await ModelCatalogService(db).set_enabled(model_id, enabled)
    if not model:
        raise HTTPException(status_code=404, detail="模型不存在")
    return model
