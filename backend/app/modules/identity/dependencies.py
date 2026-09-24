from fastapi import Depends, Header, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.models import User
from app.modules.identity.service import IdentityError, IdentityService


async def get_session_token(
    request: Request,
    x_session_id: str | None = Header(default=None),
) -> str:
    return x_session_id or request.cookies.get("aivora_session") or ""


async def get_current_user(
    token: str = Depends(get_session_token),
    db: AsyncSession = Depends(get_db_session),
) -> User:
    if not token:
        raise HTTPException(status_code=401, detail={"code": "SESSION_REQUIRED", "message": "请先登录"})
    try:
        return await IdentityService(db).resolve_session(token)
    except IdentityError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail={"code": "ADMIN_REQUIRED", "message": "需要管理员权限"})
    return user

