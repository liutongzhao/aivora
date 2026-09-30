from uuid import UUID

import socketio
from sqlalchemy import select

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.modules.devices.models import DesktopDevice, RemoteCommand, RemoteSession
from app.modules.devices.service import ALLOWED_ACTIONS, close_active_sessions, consume_pairing, mark_session_active, open_session, record_command, update_command
from app.modules.identity.models import User
from app.modules.identity.service import IdentityService

sio = socketio.AsyncServer(async_mode="asgi", cors_allowed_origins=get_settings().allowed_origins)
desktop_sids: dict[UUID, str] = {}
mobile_sids: dict[UUID, str] = {}
sid_context: dict[str, dict] = {}


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
    if not session_id:
        return
    async with session_factory() as db:
        result = await db.execute(select(RemoteSession).where(RemoteSession.id == session_id))
        session = result.scalar_one_or_none()
        if session and session.status in {"pending", "connecting", "active", "closing"}:
            session.status = "closed"
            session.disconnect_reason = "socket_disconnected"
            await db.commit()
    await _emit_session_state(session_id, "closed", "socket_disconnected")


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
        context.update({"kind": "desktop", "device_id": device.id})
        desktop_sids[device.id] = sid
        return {"success": True}


@sio.on("remote:mobile_register", namespace="/remote")
async def mobile_register(sid, data):
    context = sid_context.get(sid)
    if not context:
        return {"success": False, "error": "未认证"}
    async with session_factory() as db:
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
    context.update({"kind": "mobile", "device_id": pairing.device_id, "session_id": session.id})
    for old_session in old_sessions:
        await _emit_session_state(old_session.id, "replaced", "new_remote_session")
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


async def _forward_command(sid: str, data: dict):
    context = sid_context.get(sid, {})
    if context.get("kind") != "mobile":
        return {"success": False, "error": "只有手机端可以发送远程命令"}
    action = str(data.get("action", ""))
    request_id = str(data.get("requestId", ""))
    if action not in ALLOWED_ACTIONS or not request_id:
        return {"success": False, "error": "远程动作无效"}
    device_sid = desktop_sids.get(context.get("device_id"))
    session_id = context.get("session_id")
    if not device_sid or not session_id:
        return {"success": False, "error": "桌面端未连接"}
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
    return {"success": True, "requestId": request_id, "status": command.status}


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
    payload = data or {}
    async with session_factory() as db:
        result = await db.execute(
            select(RemoteCommand).where(
                RemoteCommand.session_id == context["session_id"],
                RemoteCommand.request_id == str(payload.get("requestId", "")),
            )
        )
        command = result.scalar_one_or_none()
        if not command:
            return {"success": False, "error": "命令不存在"}
        await update_command(db, command, str(payload.get("status", "failed")), payload.get("errorCode"), payload.get("errorMessage"))
        await db.commit()
    mobile_sid = mobile_sids.get(context["session_id"])
    if mobile_sid:
        await sio.emit("remote:command_status", payload, to=mobile_sid, namespace="/remote")
    return {"success": True}


@sio.on("remote:result", namespace="/remote")
async def remote_result(sid, data):
    payload = data or {}
    payload["status"] = "success" if payload.get("success") else "failed"
    return await remote_command_status(sid, payload)
