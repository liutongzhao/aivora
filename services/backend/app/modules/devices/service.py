import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.modules.devices.models import DesktopDevice, PairingCode, RemoteCommand, RemoteSession

ACTIVE_SESSION_STATUSES = ("pending", "connecting", "active", "closing")
ALLOWED_ACTIONS = {
    "screenshot", "partialScreenshot", "programming", "singleChoice",
    "singleChoiceAlt", "multipleChoice", "universal", "reset", "refreshConfig",
    "increaseOpacity", "decreaseOpacity", "zoomIn", "zoomOut", "copyCode",
    "deleteLastScreenshot", "quitApp",
}


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def revoke_open_pairings(db: AsyncSession, user_id: UUID, device_id: UUID) -> None:
    await db.execute(
        update(PairingCode)
        .where(
            PairingCode.user_id == user_id,
            PairingCode.device_id == device_id,
            PairingCode.used_at.is_(None),
            PairingCode.consumed_at.is_(None),
            PairingCode.revoked_at.is_(None),
        )
        .values(revoked_at=utcnow())
    )


async def create_pairing(
    db: AsyncSession, user_id: UUID, device_key: str
) -> tuple[PairingCode, DesktopDevice]:
    result = await db.execute(
        select(DesktopDevice).where(
            DesktopDevice.user_id == user_id,
            DesktopDevice.device_id == device_key,
            DesktopDevice.revoked_at.is_(None),
        )
    )
    device = result.scalar_one_or_none()
    if not device:
        device = DesktopDevice(
            user_id=user_id,
            device_id=device_key,
            name="Aivora Desktop",
            platform="desktop",
            last_seen_at=utcnow(),
        )
        db.add(device)
        await db.flush()
    await revoke_open_pairings(db, user_id, device.id)
    code = f"{secrets.randbelow(10000):04d}"
    pairing = PairingCode(
        user_id=user_id,
        device_id=device.id,
        code_hash=hashlib.sha256(code.encode()).hexdigest(),
        expires_at=utcnow() + timedelta(minutes=5),
    )
    db.add(pairing)
    await db.flush()
    pairing._plain_code = code  # type: ignore[attr-defined]
    return pairing, device


async def consume_pairing(
    db: AsyncSession, user_id: UUID, code: str
) -> PairingCode | None:
    if len(code) != 4 or not code.isascii() or not code.isdigit():
        return None
    result = await db.execute(
        select(PairingCode).where(
            PairingCode.user_id == user_id,
            PairingCode.used_at.is_(None),
            PairingCode.consumed_at.is_(None),
            PairingCode.revoked_at.is_(None),
            PairingCode.expires_at > utcnow(),
            PairingCode.code_hash == hashlib.sha256(code.upper().encode()).hexdigest(),
        )
    )
    pairing = result.scalar_one_or_none()
    if pairing:
        pairing.used_at = utcnow()
        pairing.consumed_at = pairing.used_at
    return pairing


async def close_active_sessions(
    db: AsyncSession, user_id: UUID, reason: str
) -> list[RemoteSession]:
    result = await db.execute(
        select(RemoteSession).where(
            RemoteSession.user_id == user_id,
            RemoteSession.status.in_(ACTIVE_SESSION_STATUSES),
        )
    )
    sessions = list(result.scalars().all())
    now = utcnow()
    for session in sessions:
        session.status = "replaced" if reason == "new_remote_session" else "closed"
        session.disconnected_at = now
        session.disconnect_reason = reason
        if session.connected_at:
            session.duration_seconds = max(0, int((now - session.connected_at).total_seconds()))
    if sessions:
        await db.execute(
            update(RemoteCommand)
            .where(
                RemoteCommand.session_id.in_([session.id for session in sessions]),
                RemoteCommand.status.in_(("created", "accepted", "running")),
            )
            .values(status="cancelled", finished_at=now, error_code="SESSION_CLOSED", error_message="远程会话已结束")
        )
    return sessions


async def open_session(
    db: AsyncSession, user_id: UUID, device_id: UUID, pairing_id: UUID
) -> RemoteSession:
    session = RemoteSession(
        user_id=user_id,
        device_id=device_id,
        status="connecting",
        last_seen_at=utcnow(),
    )
    db.add(session)
    await db.flush()
    await db.execute(
        update(PairingCode).where(PairingCode.id == pairing_id).values(session_id=session.id)
    )
    return session


async def mark_session_active(db: AsyncSession, session: RemoteSession) -> RemoteSession:
    now = utcnow()
    session.status = "active"
    session.connected_at = session.connected_at or now
    session.desktop_connected_at = session.desktop_connected_at or now
    session.mobile_connected_at = session.mobile_connected_at or now
    session.last_seen_at = now
    return session


async def record_command(
    db: AsyncSession, session_id: UUID, request_id: str, action: str
) -> RemoteCommand:
    command = RemoteCommand(
        session_id=session_id,
        request_id=request_id,
        action=action,
        status="accepted",
        accepted_at=utcnow(),
    )
    db.add(command)
    await db.flush()
    return command


async def update_command(
    db: AsyncSession,
    command: RemoteCommand,
    status: str,
    error_code: str | None = None,
    error_message: str | None = None,
) -> RemoteCommand:
    transitions = {
        "created": {"accepted", "rejected"},
        "accepted": {"running", "success", "failed", "timeout", "rejected", "cancelled"},
        "running": {"success", "failed", "timeout", "rejected", "cancelled"},
    }
    if status not in transitions.get(command.status, set()):
        raise ValueError("命令状态不可逆转")
    now = utcnow()
    command.status = status
    command.error_code = error_code
    command.error_message = error_message
    if status == "running":
        command.started_at = command.started_at or now
    if status in {"success", "failed", "timeout", "rejected", "cancelled"}:
        command.finished_at = now
        if command.started_at:
            command.duration_ms = max(0, int((now - command.started_at).total_seconds() * 1000))
    return command
