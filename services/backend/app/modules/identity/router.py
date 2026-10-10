from fastapi import APIRouter, Depends, HTTPException, Request, Response
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.identity.dependencies import get_current_user, get_session_token
from app.modules.identity.models import User
from app.modules.identity.schemas import (
    AuthResponse,
    LoginRequest,
    MessageResponse,
    RegisterRequest,
    SendVerificationCodeRequest,
    VerifyVerificationCodeRequest,
    VerificationMessageResponse,
    VerificationTicketResponse,
    PasswordResetRequest,
    PasswordResetConfirmRequest,
    ChangePasswordRequest,
    SessionResponse,
    UserResponse,
)
from app.modules.identity.service import IdentityError, IdentityService
from app.modules.identity.mail import SmtpMailSender
from app.modules.identity.rate_limits import IdentityRateLimiter
from app.modules.identity.verification import RegistrationService, VerificationError
from app.config import get_settings

router = APIRouter(prefix="/api/auth", tags=["auth"])
session_router = APIRouter(prefix="/api", tags=["auth"])


@router.post("/register", response_model=UserResponse, status_code=201)
async def register(
    request: RegisterRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> User:
    try:
        redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
        try:
            service = RegistrationService(db, SmtpMailSender(get_settings()), IdentityRateLimiter(redis))
            return await IdentityService(db).register_verified(
                request, service, http_request.client.host if http_request.client else "unknown"
            )
        finally:
            await redis.aclose()
    except (IdentityError, VerificationError) as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


@router.post("/registration/send-code", response_model=VerificationMessageResponse)
async def send_registration_code(
    request: SendVerificationCodeRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> VerificationMessageResponse:
    redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    try:
        service = RegistrationService(db, SmtpMailSender(get_settings()), IdentityRateLimiter(redis))
        await service.send_code(
            str(request.email), http_request.client.host if http_request.client else "unknown"
        )
        return VerificationMessageResponse(message="如果请求有效，验证码将发送到邮箱")
    except VerificationError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    finally:
        await redis.aclose()


@router.post("/registration/resend-code", response_model=VerificationMessageResponse)
async def resend_registration_code(
    request: SendVerificationCodeRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> VerificationMessageResponse:
    return await send_registration_code(request, http_request, db)


@router.post("/registration/verify-code", response_model=VerificationTicketResponse)
async def verify_registration_code(
    request: VerifyVerificationCodeRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> VerificationTicketResponse:
    redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    try:
        service = RegistrationService(db, SmtpMailSender(get_settings()), IdentityRateLimiter(redis))
        ticket, expires = await service.verify_code(
            str(request.email), request.code, http_request.client.host if http_request.client else "unknown"
        )
        return VerificationTicketResponse(registration_ticket=ticket, expires_in_seconds=expires)
    except VerificationError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    finally:
        await redis.aclose()


@router.post("/password-reset/request", response_model=VerificationMessageResponse)
async def request_password_reset(
    request: PasswordResetRequest,
    http_request: Request,
    db: AsyncSession = Depends(get_db_session),
) -> VerificationMessageResponse:
    redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    try:
        service = RegistrationService(db, SmtpMailSender(get_settings()), IdentityRateLimiter(redis))
        await service.request_password_reset(
            str(request.email),
            http_request.client.host if http_request.client else "unknown",
        )
        return VerificationMessageResponse(message="如果邮箱对应有效账号，重置邮件将发送到邮箱")
    except VerificationError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    finally:
        await redis.aclose()


@router.post("/password-reset/confirm", response_model=VerificationMessageResponse)
async def confirm_password_reset(
    request: PasswordResetConfirmRequest,
    db: AsyncSession = Depends(get_db_session),
) -> VerificationMessageResponse:
    redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    try:
        service = RegistrationService(db, SmtpMailSender(get_settings()), IdentityRateLimiter(redis))
        await service.confirm_password_reset(request.token, request.password)
        return VerificationMessageResponse(message="密码已重置，请重新登录")
    except VerificationError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})
    finally:
        await redis.aclose()


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
    response.set_cookie(
        "aivora_session",
        token,
        httponly=True,
        samesite="lax",
        secure=get_settings().environment == "production",
        max_age=30 * 86400,
    )
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


@router.post("/password/change", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    token: str = Depends(get_session_token),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessageResponse:
    try:
        await IdentityService(db).change_password(user, token, request)
        return MessageResponse(message="密码已修改，其他登录设备已退出")
    except IdentityError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


@router.get("/sessions", response_model=list[SessionResponse])
async def list_sessions(
    token: str = Depends(get_session_token),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    return await IdentityService(db).list_sessions(user.id, token)


@router.post("/sessions/revoke-others", response_model=MessageResponse)
async def revoke_other_sessions(
    token: str = Depends(get_session_token),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> MessageResponse:
    try:
        count = await IdentityService(db).revoke_other_sessions(user.id, token)
        return MessageResponse(message=f"已退出其他 {count} 个登录设备")
    except IdentityError as error:
        raise HTTPException(status_code=error.status_code, detail={"code": error.code, "message": error.message})


@session_router.get("/session_status")
async def session_status(user: User = Depends(get_current_user)) -> dict:
    return {"success": True, "user": UserResponse.model_validate(user).model_dump(mode="json")}


@router.get("/session_status")
async def auth_session_status(user: User = Depends(get_current_user)) -> dict:
    return {"success": True, "user": UserResponse.model_validate(user).model_dump(mode="json")}
