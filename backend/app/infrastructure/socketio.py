import socketio

from app.config import get_settings

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=get_settings().allowed_origins,
)


@sio.event(namespace="/remote")
async def connect(sid, environ, auth):
    await sio.save_session(sid, {"authenticated": bool(auth)})


@sio.event(namespace="/remote")
async def disconnect(sid):
    return None


@sio.event(namespace="/remote")
async def desktop_register(sid, data):
    await sio.emit("remote:desktop_registered", {"success": True}, to=sid, namespace="/remote")


@sio.event(namespace="/remote")
async def remote_command(sid, data):
    # The desktop client remains the enforcement point for the command allowlist.
    await sio.emit("remote:command", data, to=sid, namespace="/remote")
