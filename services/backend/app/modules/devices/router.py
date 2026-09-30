import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.infrastructure.database import get_db_session
from app.modules.devices.models import DesktopDevice, PairingCode
from app.modules.devices.models import RemoteCommand, RemoteSession
from app.modules.devices.service import close_active_sessions, create_pairing
from app.modules.identity.dependencies import get_current_user
from app.modules.identity.models import User

router = APIRouter(prefix="/api/remote", tags=["remote"])


class DeviceRegisterRequest(BaseModel):
    device_id: str = Field(min_length=1, max_length=160)
    name: str | None = Field(default=None, max_length=160)
    platform: str | None = Field(default=None, max_length=40)
    client_version: str | None = Field(default=None, max_length=80)


class PairingVerifyRequest(BaseModel):
    code: str = Field(min_length=8, max_length=8)


class PairingCreateRequest(BaseModel):
    deviceId: str = Field(min_length=1, max_length=160)


@router.post("/devices/register")
async def register_device(
    request: DeviceRegisterRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    result = await db.execute(
        select(DesktopDevice).where(
            DesktopDevice.user_id == user.id, DesktopDevice.device_id == request.device_id
        )
    )
    device = result.scalar_one_or_none()
    now = datetime.now(timezone.utc)
    if not device:
        device = DesktopDevice(user_id=user.id, **request.model_dump())
        db.add(device)
    else:
        device.name = request.name
        device.platform = request.platform
        device.client_version = request.client_version
        device.last_seen_at = now
        device.revoked_at = None
    await db.commit()
    await db.refresh(device)
    return {"success": True, "device_id": str(device.id)}


@router.post("/pairing/create")
async def create_pairing(
    request: PairingCreateRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    pairing, _device = await create_pairing(db, user.id, request.deviceId)
    code = pairing._plain_code  # type: ignore[attr-defined]
    await db.commit()
    return {"success": True, "code": code, "expiresAt": int(pairing.expires_at.timestamp() * 1000)}


@router.post("/pairing/verify")
async def verify_pairing(
    request: PairingVerifyRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    code_hash = hashlib.sha256(request.code.upper().encode()).hexdigest()
    result = await db.execute(
        select(PairingCode).where(
            PairingCode.code_hash == code_hash,
            PairingCode.user_id == user.id,
            PairingCode.used_at.is_(None),
            PairingCode.revoked_at.is_(None),
            PairingCode.expires_at > datetime.now(timezone.utc),
        )
    )
    pairing = result.scalar_one_or_none()
    if not pairing:
        raise HTTPException(status_code=400, detail="连接码无效或已过期")
    pairing.used_at = datetime.now(timezone.utc)
    await db.commit()
    return {"success": True, "device_id": str(pairing.device_id)}


@router.get("/devices")
async def list_devices(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    result = await db.execute(select(DesktopDevice).where(DesktopDevice.user_id == user.id))
    return [
        {
            "id": str(device.id),
            "deviceId": device.device_id,
            "name": device.name,
            "platform": device.platform,
            "clientVersion": device.client_version,
            "lastSeenAt": device.last_seen_at,
        }
        for device in result.scalars().all()
    ]


@router.get("/session/current")
async def current_session(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict | None:
    result = await db.execute(
        select(RemoteSession).where(
            RemoteSession.user_id == user.id,
            RemoteSession.status.in_(("pending", "connecting", "active", "closing")),
        )
    )
    session = result.scalar_one_or_none()
    if not session:
        return None
    return {
        "id": str(session.id),
        "deviceId": str(session.device_id),
        "status": session.status,
        "connectedAt": session.connected_at,
        "lastSeenAt": session.last_seen_at,
    }


@router.get("/sessions")
async def list_sessions(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    result = await db.execute(
        select(RemoteSession)
        .where(RemoteSession.user_id == user.id)
        .order_by(RemoteSession.created_at.desc())
        .limit(50)
    )
    return [
        {
            "id": str(session.id),
            "status": session.status,
            "connectedAt": session.connected_at,
            "disconnectedAt": session.disconnected_at,
            "durationSeconds": session.duration_seconds,
            "disconnectReason": session.disconnect_reason,
        }
        for session in result.scalars().all()
    ]


@router.get("/commands")
async def list_commands(
    session_id: UUID | None = None,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> list[dict]:
    query = (
        select(RemoteCommand)
        .join(RemoteSession, RemoteSession.id == RemoteCommand.session_id)
        .where(RemoteSession.user_id == user.id)
        .order_by(RemoteCommand.created_at.desc())
        .limit(100)
    )
    if session_id:
        query = query.where(RemoteCommand.session_id == session_id)
    result = await db.execute(query)
    return [
        {
            "id": str(command.id),
            "requestId": command.request_id,
            "action": command.action,
            "status": command.status,
            "createdAt": command.created_at,
            "finishedAt": command.finished_at,
            "durationMs": command.duration_ms,
            "errorMessage": command.error_message,
        }
        for command in result.scalars().all()
    ]


@router.post("/session/close")
async def close_session(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db_session),
) -> dict:
    sessions = await close_active_sessions(db, user.id, "user_closed")
    await db.commit()
    return {"success": True, "closed": len(sessions)}
