import hashlib
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.modules.identity.models import Session, User
from app.modules.identity.passwords import hash_password, verify_password
from app.modules.identity.repository import IdentityRepository
from app.modules.identity.schemas import ChangePasswordRequest, LoginRequest, RegisterRequest
from app.modules.identity.verification import RegistrationService


class IdentityError(Exception):
    def __init__(self, code: str, message: str, status_code: int = 400):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


class IdentityService:
    def __init__(self, db: AsyncSession):
        self.repository = IdentityRepository(db)
        self.db = db

    async def register(self, request: RegisterRequest) -> User:
        raise IdentityError("EMAIL_VERIFICATION_REQUIRED", "请先完成邮箱验证", 400)

    async def register_verified(self, request: RegisterRequest, registration: RegistrationService, ip: str) -> User:
        email = await registration.use_ticket(request.registration_ticket)
        if await self.repository.find_user_by_email(email):
            raise IdentityError("EMAIL_ALREADY_EXISTS", "邮箱已注册", 409)
        now = datetime.now(timezone.utc)
        user = User(
            email=email,
            email_normalized=email,
            username=request.username or email.split("@", 1)[0],
            password_hash=hash_password(request.password),
            status="active",
            email_verified_at=now,
            trial_granted_at=now,
            trial_total=get_settings().trial_searches,
            trial_used=0,
            created_ip=ip,
        )
        await self.repository.create_user(user)
        await self.db.commit()
        return user

    async def login(self, request: LoginRequest) -> tuple[str, User]:
        user = await self.repository.find_user_by_email(str(request.email).lower())
        if not user or not verify_password(request.password, user.password_hash):
            raise IdentityError("INVALID_CREDENTIALS", "邮箱或密码错误", 401)
        if not user.is_active or user.status in {"suspended", "deleted"}:
            raise IdentityError("USER_DISABLED", "账号已被停用", 403)

        raw_token = secrets.token_urlsafe(48)
        session = Session(
            user_id=user.id,
            token_hash=_hash_token(raw_token),
            device_type=request.device_type,
            device_name=request.device_name,
            expires_at=datetime.now(timezone.utc) + timedelta(days=30),
        )
        await self.repository.create_session(session)
        await self.db.commit()
        user.last_login_at = datetime.now(timezone.utc)
        await self.db.commit()
        return raw_token, user

    async def resolve_session(self, raw_token: str) -> User:
        session = await self.repository.find_session(_hash_token(raw_token))
        if not session:
            raise IdentityError("SESSION_INVALID", "会话无效或已过期", 401)
        user = await self.repository.find_user(session.user_id)
        if not user or not user.is_active or user.status in {"suspended", "deleted"}:
            raise IdentityError("USER_DISABLED", "账号不可用", 403)
        await self.repository.touch_session(session.id)
        await self.db.commit()
        return user

    async def logout(self, raw_token: str) -> None:
        session = await self.repository.find_session(_hash_token(raw_token))
        if session:
            await self.repository.revoke_session(session.id)
            await self.db.commit()

    async def change_password(
        self,
        user: User,
        raw_token: str,
        request: ChangePasswordRequest,
    ) -> None:
        if not verify_password(request.old_password, user.password_hash):
            raise IdentityError("INVALID_OLD_PASSWORD", "原密码不正确", 400)
        if request.old_password == request.new_password:
            raise IdentityError("PASSWORD_UNCHANGED", "新密码不能与原密码相同", 400)
        session = await self.repository.find_session(_hash_token(raw_token))
        if not session or session.user_id != user.id:
            raise IdentityError("SESSION_INVALID", "会话无效或已过期", 401)
        user.password_hash = hash_password(request.new_password)
        await self.repository.revoke_other_sessions(user.id, session.id)
        await self.db.commit()

    async def list_sessions(self, user_id, raw_token: str) -> list[dict]:
        current_hash = _hash_token(raw_token)
        sessions = await self.repository.list_active_sessions(user_id)
        return [
            {
                "id": str(session.id),
                "device_type": session.device_type,
                "device_name": session.device_name,
                "created_at": session.created_at,
                "last_used_at": session.last_used_at,
                "expires_at": session.expires_at,
                "is_current": session.token_hash == current_hash,
            }
            for session in sessions
        ]

    async def revoke_other_sessions(self, user_id, raw_token: str) -> int:
        session = await self.repository.find_session(_hash_token(raw_token))
        if not session or session.user_id != user_id:
            raise IdentityError("SESSION_INVALID", "会话无效或已过期", 401)
        revoked = await self.repository.revoke_other_sessions(user_id, session.id)
        await self.db.commit()
        return revoked
