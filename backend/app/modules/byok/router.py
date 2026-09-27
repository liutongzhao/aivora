from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.byok.schemas import (
    ConnectionCreate,
    ConnectionResponse,
    ConnectionTestRequest,
    ConnectionUpdate,
    ModelCreate,
    ModelDefaultUpdate,
    ModelResponse,
    ModelUpdate,
    PromptUpdate,
)
from app.modules.byok.service import BYOKService
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User

router = APIRouter(prefix="/api/user", tags=["user-config"])


def connection_response(item) -> ConnectionResponse:
    return ConnectionResponse(
        id=item.id, name=item.name, base_url=item.base_url, enabled=item.enabled,
    )


@router.get("/connections", response_model=list[ConnectionResponse])
async def list_connections(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return [connection_response(item) for item in await BYOKService(db).connections(user.id)]


@router.post("/connections", response_model=ConnectionResponse, status_code=201)
async def create_connection(
    request: ConnectionCreate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        return connection_response(await BYOKService(db).create_connection(user.id, request))
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error))


@router.post("/connections/test")
async def test_new_connection(
    request: ConnectionTestRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        models = await BYOKService(db).test_new_connection(request)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"success": True, "models": models, "message": "连接测试成功"}


@router.patch("/connections/{connection_id}", response_model=ConnectionResponse)
async def update_connection(
    connection_id: UUID, request: ConnectionUpdate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        item = await BYOKService(db).update_connection(user.id, connection_id, request)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not item:
        raise HTTPException(status_code=404, detail="连接不存在")
    return connection_response(item)


@router.post("/connections/{connection_id}/test")
async def test_saved_connection(
    connection_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        models = await BYOKService(db).test_connection(user.id, connection_id)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"success": True, "models": models, "message": "连接测试成功"}


@router.delete("/connections/{connection_id}")
async def disable_connection(
    connection_id: UUID, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    if not await BYOKService(db).delete_connection(user.id, connection_id):
        raise HTTPException(status_code=404, detail="连接不存在")
    return {"success": True}


@router.get("/models", response_model=list[ModelResponse])
async def list_models(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session)):
    return await BYOKService(db).models(user.id)


@router.post("/models", response_model=ModelResponse, status_code=201)
async def create_model(
    request: ModelCreate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        return await BYOKService(db).create_model(user.id, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))


@router.patch("/models/{model_id}", response_model=ModelResponse)
async def update_model(
    model_id: UUID,
    request: ModelUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        item = await BYOKService(db).update_model(user.id, model_id, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not item:
        raise HTTPException(status_code=404, detail="模型不存在")
    return item


@router.post("/models/{model_id}/test")
async def test_model(
    model_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        await BYOKService(db).test_model(user.id, model_id)
    except (ValueError, RuntimeError) as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"success": True, "message": "模型调用测试成功"}


@router.delete("/models/{model_id}")
async def disable_model(
    model_id: UUID,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        deleted = await BYOKService(db).remove_model(user.id, model_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    if not deleted:
        raise HTTPException(status_code=404, detail="模型不存在")
    return {"success": True}


@router.put("/models/defaults/{mode}")
async def set_model_default(
    mode: str, request: ModelDefaultUpdate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        item = await BYOKService(db).set_default(user.id, mode, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    return {"mode": item.mode, "model_id": item.model_id, "language": item.language}


@router.get("/models/defaults")
async def list_model_defaults(
    user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session),
):
    return [
        {"mode": item.mode, "model_id": item.model_id, "language": item.language}
        for item in await BYOKService(db).defaults(user.id)
    ]


@router.get("/prompts/{mode}")
async def list_prompts(
    mode: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db_session),
):
    return await BYOKService(db).prompts(user.id, mode)


@router.post("/prompts/{mode}")
async def save_prompt(
    mode: str, request: PromptUpdate, user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
):
    try:
        return await BYOKService(db).save_prompt(user.id, mode, request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
