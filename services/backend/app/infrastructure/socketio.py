import asyncio
from datetime import datetime, timezone
import logging
from uuid import UUID

import socketio
from sqlalchemy import select, update

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.modules.devices.models import DesktopDevice, PairingCode, RemoteCommand, RemoteSession
from app.modules.devices.service import ALLOWED_ACTIONS, close_active_sessions, consume_pairing, mark_session_active, open_session, record_command, update_command
from app.modules.identity.models import User
from app.modules.identity.service import IdentityService

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=get_settings().allowed_origins)
desktop_sids: dict[UUID, str] = {}
mobile_sids: dict[UUID, str] = {}
sid_context: dict[str, dict] = {}
logger = logging.getLogger(__name__)

async def retire_stale_sessions() -> None:
    async with session_factory() as db:
        now = datetime.now(timezone.utc)
        await db.execute(
            update(PairingCode)
            .where(PairingCode.used_at.is_(None), PairingCode.revoked_at.is_(None))
            .values(revoked_at=now)
        )
        await db.commit()


async def _resolve_user(session_id: str | None) -> User | None:
    if not session_id:
        return None
    async with session_factory() as db:
        try:
            return await IdentityService(db).resolve_session(session_id)
        except Exception:
            return None


async def _emit_session_state(session_id: UUID, status: str, reason: str | None = None) -> None:
    payload = {"status": status, **({"reason": reason} if reason else {})}
    for sid, context in list(sid_context.items()):
        if context.get("session_id") == session_id:
            await sio.emit("remote:session_state", payload, to=sid, namespace="/remote")

async def detach_session(
    session_id: UUID, status: str, reason: str, preserve_desktop_sid: str | None = None
) -> None:
    affected = [
        (sid, context) for sid, context in list(sid_context.items())
        if context.get("session_id") == session_id
    ]
    for sid, context in affected:
        await sio.emit(
            "remote:session_state",
            {"status": status, "reason": reason, "sessionId": str(session_id)},
            to=sid, namespace="/remote",
        )
        context["session_id"] = None
        if sid == preserve_desktop_sid:
            continue
        sid_context.pop(sid, None)
        if context.get("kind") == "desktop" and desktop_sids.get(context.get("device_id")) == sid:
            desktop_sids.pop(context["device_id"], None)
        await sio.disconnect(sid, namespace="/remote")
    mobile_sids.pop(session_id, None)


async def close_user_sessions(user_id: UUID, reason: str = "user_closed") -> int:
    async with session_factory() as db:
        sessions = await close_active_sessions(db, user_id, reason)
        if reason == "user_closed":
            await db.execute(
                update(PairingCode)
                .where(PairingCode.user_id == user_id, PairingCode.used_at.is_(None), PairingCode.revoked_at.is_(None))
                .values(revoked_at=datetime.now(timezone.utc))
            )
        await db.commit()
    for session in sessions:
        await detach_session(session.id, session.status, reason)
    return len(sessions)


@sio.event(namespace="/remote")
async def connect(sid, environ, auth):
    user = await _resolve_user((auth or {}).get("sessionId"))
    if not user:
        return False
    sid_context[sid] = {"user_id": user.id, "kind": "unregistered"}


@sio.event(namespace="/remote")
async def disconnect(sid):
    context = sid_context.pop(sid, None)
    if not context:
        return
    device_id = context.get("device_id")
    if device_id and desktop_sids.get(device_id) == sid:
        desktop_sids.pop(device_id, None)
    session_id = context.get("session_id")
    if session_id and mobile_sids.get(session_id) == sid:
        mobile_sids.pop(session_id, None)
    # Transport disconnects are recoverable. The database session ends only
    # through the explicit close endpoint or a replacement connection.
    if session_id:
        async with session_factory() as db:
            await db.execute(
                update(RemoteSession)
                .where(RemoteSession.id == session_id, RemoteSession.status == "active")
                .values(last_seen_at=datetime.now(timezone.utc))
            )
            await db.commit()


@sio.on("remote:desktop_register", namespace="/remote")
async def desktop_register(sid, data):
    context = sid_context.get(sid)
    if not context:
        return {"success": False, "error": "未认证"}
    async with session_factory() as db:
        result = await db.execute(
            select(DesktopDevice).where(
                DesktopDevice.user_id == context["user_id"],
                DesktopDevice.device_id == str((data or {}).get("deviceId", "")),
                DesktopDevice.revoked_at.is_(None),
            )
        )
        device = result.scalar_one_or_none()
        if not device:
            return {"success": False, "error": "桌面设备未注册"}
        previous_sid = desktop_sids.get(device.id)
        if previous_sid and previous_sid != sid:
            previous = sid_context.get(previous_sid, {})
            if previous.get("session_id"):
                context["session_id"] = previous["session_id"]
                await db.execute(
                    update(RemoteSession)
                    .where(
                        RemoteSession.id == previous["session_id"],
                        RemoteSession.user_id == context["user_id"],
                        RemoteSession.status == "active",
                    )
                    .values(last_seen_at=datetime.now(timezone.utc), desktop_connected_at=datetime.now(timezone.utc))
                )
                await db.commit()
                sid_context[previous_sid]["session_id"] = None
            else:
                sid_context.pop(previous_sid, None)
                await sio.disconnect(previous_sid, namespace="/remote")
        context.update({"kind": "desktop", "device_id": device.id})
        desktop_sids[device.id] = sid
        if not context.get("session_id"):
            active = await db.execute(
                select(RemoteSession).where(
                    RemoteSession.user_id == context["user_id"],
                    RemoteSession.device_id == device.id,
                    RemoteSession.status == "active",
                ).order_by(RemoteSession.updated_at.desc())
            )
            session = active.scalar_one_or_none()
            if session:
                context["session_id"] = session.id
                session.last_seen_at = datetime.now(timezone.utc)
                session.desktop_connected_at = datetime.now(timezone.utc)
                await db.commit()
        return {"success": True}


@sio.on("remote:mobile_register", namespace="/remote")
async def mobile_register(sid, data):
    context = sid_context.get(sid)
    if not context or context.get("kind") != "unregistered":
        return {"success": False, "error": "未认证"}
    try:
        async with session_factory() as db:
            await db.execute(select(User.id).where(User.id == context["user_id"]).with_for_update())
            pairing = await consume_pairing(db, context["user_id"], str((data or {}).get("code", "")))
            if not pairing:
                return {"success": False, "error": "连接码无效或已过期"}
            desktop_sid = desktop_sids.get(pairing.device_id)
            if not desktop_sid:
                return {"success": False, "error": "桌面端尚未连接"}
            old_sessions = await close_active_sessions(db, context["user_id"], "new_remote_session")
            session = await open_session(db, context["user_id"], pairing.device_id, pairing.id)
            await mark_session_active(db, session)
            await db.commit()
    except Exception:
        logger.exception("Remote pairing failed")
        return {"success": False, "error": "连接失败，请稍后重试"}
    context.update({"kind": "mobile", "device_id": pairing.device_id, "session_id": session.id})
    for old_session in old_sessions:
        await detach_session(old_session.id, "replaced", "new_remote_session", preserve_desktop_sid=desktop_sid)
    desktop_context = sid_context.get(desktop_sid)
    if desktop_context:
        desktop_context["session_id"] = session.id
    mobile_sids[session.id] = sid
    payload = {
        "status": "active",
        "sessionId": str(session.id),
        "connectedAt": int(session.connected_at.timestamp() * 1000),
    }
    await sio.emit("remote:session_state", payload, to=desktop_sid, namespace="/remote")
    await sio.emit("remote:session_state", payload, to=sid, namespace="/remote")
    await sio.emit("remote:paired", {}, to=desktop_sid, namespace="/remote")
    return {"success": True, "sessionId": str(session.id)}


@sio.on("remote:mobile_reconnect", namespace="/remote")
async def mobile_reconnect(sid, data):
    context = sid_context.get(sid)
    session_id = (data or {}).get("sessionId")
    if not context or context.get("kind") != "unregistered" or not session_id:
        return {"success": False, "error": "远程会话无效"}
    try:
        session_uuid = UUID(str(session_id))
    except ValueError:
        return {"success": False, "error": "远程会话无效"}
    async with session_factory() as db:
        result = await db.execute(
            select(RemoteSession).where(
                RemoteSession.id == session_uuid,
                RemoteSession.user_id == context["user_id"],
                RemoteSession.status == "active",
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return {"success": False, "error": "远程会话已结束"}
        desktop_sid = desktop_sids.get(session.device_id)
        if not desktop_sid:
            return {"success": False, "error": "桌面端尚未连接"}
        session.mobile_connected_at = datetime.now(timezone.utc)
        session.last_seen_at = session.mobile_connected_at
        await db.commit()
    context.update({"kind": "mobile", "device_id": session.device_id, "session_id": session.id})
    mobile_sids[session.id] = sid
    payload = {"status": "active", "sessionId": str(session.id), "connectedAt": int(session.connected_at.timestamp() * 1000)}
    await sio.emit("remote:session_state", payload, to=desktop_sid, namespace="/remote")
    await sio.emit("remote:session_state", payload, to=sid, namespace="/remote")
    desktop_context = sid_context.get(desktop_sid)
    if desktop_context:
        desktop_context["session_id"] = session.id
    return {"success": True, "sessionId": str(session.id)}


async def _forward_command(sid: str, data: dict):
    context = sid_context.get(sid, {})
    if context.get("kind") != "mobile":
        return {"success": False, "error": "只有手机端可以发送远程命令"}
    if mobile_sids.get(context.get("session_id")) != sid:
        return {"success": False, "error": "远程会话已失效"}
    action = str(data.get("action", ""))
    request_id = str(data.get("requestId", ""))
    if action not in ALLOWED_ACTIONS or not request_id:
        return {"success": False, "error": "远程动作无效"}
    device_sid = desktop_sids.get(context.get("device_id"))
    session_id = context.get("session_id")
    if not device_sid or not session_id:
        return {"success": False, "error": "桌面端未连接"}
    if sid_context.get(device_sid, {}).get("session_id") != session_id:
        return {"success": False, "error": "桌面端会话已失效"}
    async with session_factory() as db:
        result = await db.execute(
            select(RemoteSession).where(
                RemoteSession.id == session_id,
                RemoteSession.user_id == context["user_id"],
                RemoteSession.status == "active",
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            return {"success": False, "error": "远程会话已结束"}
        command = await record_command(db, session.id, request_id, action)
        await db.commit()
    await sio.emit(
        "remote:execute",
        {"sessionId": str(session_id), "requestId": request_id, "action": action, "params": data.get("params", {})},
        to=device_sid,
        namespace="/remote",
    )
    asyncio.create_task(expire_command(session_id, request_id, 90 if action == "partialScreenshot" else 30))
    return {"success": True, "requestId": request_id, "status": command.status}

async def expire_command(session_id: UUID, request_id: str, seconds: int) -> None:
    await asyncio.sleep(seconds)
    async with session_factory() as db:
        result = await db.execute(
            select(RemoteCommand)
            .join(RemoteSession, RemoteSession.id == RemoteCommand.session_id)
            .where(
                RemoteCommand.session_id == session_id,
                RemoteCommand.request_id == request_id,
                RemoteSession.status == "active",
            )
            .with_for_update(of=RemoteCommand)
        )
        command = result.scalar_one_or_none()
        if not command or command.status not in {"created", "accepted", "running"}:
            return
        await update_command(db, command, "timeout", "ACTION_TIMEOUT", "桌面端未在规定时间内完成操作")
        await db.commit()
    mobile_sid = mobile_sids.get(session_id)
    if mobile_sid:
        await sio.emit(
            "remote:command_status",
            {"requestId": request_id, "status": "timeout", "errorMessage": "桌面端未在规定时间内完成操作"},
            to=mobile_sid, namespace="/remote",
        )


@sio.on("remote:command", namespace="/remote")
async def remote_command(sid, data):
    return await _forward_command(sid, data or {})


@sio.on("remote:execute", namespace="/remote")
async def remote_execute(sid, data):
    return await _forward_command(sid, data or {})


@sio.on("remote:command_status", namespace="/remote")
async def remote_command_status(sid, data):
    context = sid_context.get(sid, {})
    if context.get("kind") != "desktop" or not context.get("session_id"):
        return {"success": False, "error": "只有桌面端可以回传命令状态"}
    if desktop_sids.get(context.get("device_id")) != sid:
        return {"success": False, "error": "桌面端会话已失效"}
    payload = data or {}
    async with session_factory() as db:
        result = await db.execute(
            select(RemoteCommand).where(
                RemoteCommand.session_id == context["session_id"],
                RemoteCommand.request_id == str(payload.get("requestId", "")),
            ).join(RemoteSession, RemoteSession.id == RemoteCommand.session_id)
            .where(RemoteSession.status == "active")
            .with_for_update(of=RemoteCommand)
        )
        command = result.scalar_one_or_none()
        if not command:
            return {"success": False, "error": "命令不存在"}
        try:
            await update_command(db, command, str(payload.get("status", "failed")), payload.get("errorCode"), payload.get("errorMessage"))
        except ValueError:
            return {"success": False, "error": "命令状态无效"}
        await db.commit()
    mobile_sid = mobile_sids.get(context["session_id"])
    if mobile_sid:
        await sio.emit("remote:command_status", payload, to=mobile_sid, namespace="/remote")
    return {"success": True}


@sio.on("remote:result", namespace="/remote")
async def remote_result(sid, data):
    payload = dict(data or {})
    payload["status"] = "success" if payload.get("success") else "failed"
    payload["errorMessage"] = payload.get("errorMessage") or payload.get("error")
    return await remote_command_status(sid, payload)
