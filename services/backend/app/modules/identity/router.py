from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import get_current_user, get_session_token
from app.modules.identity.models import User
from app.modules.identity.schemas import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    UserResponse,
)
from app.modules.identity.service import IdentityError, IdentityService

router = APIRouter(prefix="/api/auth", tags=["auth"])
session_router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(request: RegisterRequest, db: AsyncSession = Depends(get_db_session)) -> User:
    try:
        return await IdentityService(db).register(request)
    except IdentityError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


@router.post("/login", response_model=AuthResponse)
async def login(
    request: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db_session),
) -> AuthResponse:
    try:
        token, user = await IdentityService(db).login(request)
    except IdentityError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    response.set_cookie("aivora_session", token, httponly=True, samesite="lax", secure=False, max_age=30 * 86400)
    return AuthResponse(session_id=token, user=user)


@router.post("/logout", response_model=MessageResponse)
async def logout(
    response: Response,
    token: str = Depends(get_session_token),
    db: AsyncSession = Depends(get_db_session),
) -> MessageResponse:
    if token:
        await IdentityService(db).logout(token)
    response.delete_cookie("aivora_session")
    return MessageResponse(message="已退出登录")


@session_router.get("/session_status")
async def session_status(user: User = Depends(get_current_user)) -> dict:
    return {"success": True, "user": UserResponse.model_validate(user).model_dump(mode="json")}


@router.get("/session_status")
async def auth_session_status(user: User = Depends(get_current_user)) -> dict:
    return {"success": True, "user": UserResponse.model_validate(user).model_dump(mode="json")}
