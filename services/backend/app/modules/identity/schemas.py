from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


def validate_password_strength(value: str) -> str:
    if len(value) < 8:
        raise ValueError("密码长度至少为 8 位")
    if not any(char.isupper() for char in value):
        raise ValueError("密码必须包含大写字母")
    if not any(char.islower() for char in value):
        raise ValueError("密码必须包含小写字母")
    if not any(char.isdigit() for char in value):
        raise ValueError("密码必须包含数字")
    return value


class RegisterRequest(BaseModel):
    registration_ticket: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)
    username: str | None = Field(default=None, max_length=120)

    _validate_password = field_validator("password")(validate_password_strength)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    device_type: str = Field(default="web", max_length=30)
    device_name: str | None = Field(default=None, max_length=120)


class SendVerificationCodeRequest(BaseModel):
    email: EmailStr


class VerifyVerificationCodeRequest(BaseModel):
    email: EmailStr
    code: str = Field(min_length=6, max_length=6, pattern=r"^\d{6}$")


class VerificationMessageResponse(BaseModel):
    success: bool = True
    message: str


class VerificationTicketResponse(BaseModel):
    success: bool = True
    registration_ticket: str
    expires_in_seconds: int


class PasswordResetRequest(BaseModel):
    email: EmailStr


class PasswordResetConfirmRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=8, max_length=128)

    _validate_password = field_validator("password")(validate_password_strength)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: EmailStr
    username: str | None
    role: str
    is_active: bool
    created_at: datetime


class AuthResponse(BaseModel):
    success: bool = True
    session_id: str
    user: UserResponse


class MessageResponse(BaseModel):
    success: bool = True
    message: str
