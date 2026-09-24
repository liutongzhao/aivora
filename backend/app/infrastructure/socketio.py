import hashlib
from datetime import datetime, timezone
from uuid import UUID

import socketio
from sqlalchemy import select

from app.config import get_settings
from app.infrastructure.database import session_factory
from app.modules.devices.models import DesktopDevice, PairingCode
from app.modules.identity.models import User
from app.modules.identity.service import IdentityService

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=get_settings().allowed_origins,
)

desktop_sids: dict[UUID, str] = {}
mobile_sids: dict[UUID, set[str]] = {}
sid_context: dict[str, dict] = {}


async def _resolve_user(session_id: str | None) -> User | None:
    if not session_id:
        return None
    async with session_factory() as db:
        try:
            return await IdentityService(db).resolve_session(session_id)
        except Exception:
            return None


@sio.event(namespace="/remote")
async def connect(sid, environ, auth):
    auth = auth or {}
    user = await _resolve_user(auth.get("sessionId"))
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
        for mobile_sid in mobile_sids.pop(device_id, set()):
            await sio.emit("remote:peer_state", {"connected": False}, to=mobile_sid, namespace="/remote")


@sio.on("remote:desktop_register", namespace="/remote")
async def desktop_register(sid, data):
    context = sid_context.get(sid)
    if not context:
        return {"success": False, "error": "未认证"}
    device_key = str(data.get("deviceId", ""))
    async with session_factory() as db:
        result = await db.execute(
            select(DesktopDevice).where(
                DesktopDevice.user_id == context["user_id"],
                DesktopDevice.device_id == device_key,
                DesktopDevice.revoked_at.is_(None),
            )
        )
        device = result.scalar_one_or_none()
        if not device:
            return {"success": False, "error": "桌面设备未注册"}
        context.update({"kind": "desktop", "device_id": device.id})
        desktop_sids[device.id] = sid
        await sio.emit(
            "remote:peer_state",
            {"connected": bool(mobile_sids.get(device.id))},
            to=sid,
            namespace="/remote",
        )
        return {"success": True}


@sio.on("remote:mobile_register", namespace="/remote")
async def mobile_register(sid, data):
    context = sid_context.get(sid)
    if not context:
        return {"success": False, "error": "未认证"}
    code = str(data.get("code", "")).upper()
    async with session_factory() as db:
        result = await db.execute(
            select(PairingCode).where(
                PairingCode.user_id == context["user_id"],
                PairingCode.used_at.is_(None),
                PairingCode.revoked_at.is_(None),
                PairingCode.expires_at > datetime.now(timezone.utc),
                PairingCode.code_hash == hashlib.sha256(code.encode()).hexdigest(),
            )
        )
        pairing = result.scalar_one_or_none()
        if not pairing:
            return {"success": False, "error": "连接码无效或已过期"}
        pairing.used_at = datetime.now(timezone.utc)
        await db.commit()
    context.update({"kind": "mobile", "device_id": pairing.device_id})
    mobile_sids.setdefault(pairing.device_id, set()).add(sid)
    desktop_sid = desktop_sids.get(pairing.device_id)
    if not desktop_sid:
        return {"success": False, "error": "桌面端尚未连接"}
    await sio.emit("remote:paired", {}, to=desktop_sid, namespace="/remote")
    await sio.emit("remote:peer_state", {"connected": True}, to=desktop_sid, namespace="/remote")
    return {"success": True}


@sio.on("remote:execute", namespace="/remote")
async def remote_execute(sid, data):
    context = sid_context.get(sid, {})
    if context.get("kind") != "mobile":
        return {"success": False, "error": "只有手机端可以发送远程命令"}
    device_sid = desktop_sids.get(context.get("device_id"))
    if not device_sid:
        return {"success": False, "error": "桌面端未连接"}
    await sio.emit("remote:execute", data, to=device_sid, namespace="/remote")
    return {"success": True}


@sio.on("remote:result", namespace="/remote")
async def remote_result(sid, data):
    context = sid_context.get(sid, {})
    for mobile_sid in mobile_sids.get(context.get("device_id"), set()):
        await sio.emit("remote:result", data, to=mobile_sid, namespace="/remote")
