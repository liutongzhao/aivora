from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4
from unittest.mock import AsyncMock

import pytest

from app.infrastructure import socketio as remote
from app.modules.devices.service import close_active_sessions, update_command


@pytest.mark.asyncio
async def test_replaced_socket_cannot_send_commands(monkeypatch):
    user_id, device_id, session_id = uuid4(), uuid4(), uuid4()
    remote.sid_context["old-mobile"] = {
        "user_id": user_id, "kind": "mobile", "device_id": device_id, "session_id": session_id
    }
    remote.mobile_sids[session_id] = "new-mobile"
    remote.desktop_sids[device_id] = "desktop"
    try:
        result = await remote.remote_command("old-mobile", {"action": "screenshot", "requestId": "1"})
        assert result["success"] is False
    finally:
        remote.sid_context.pop("old-mobile", None)
        remote.mobile_sids.pop(session_id, None)
        remote.desktop_sids.pop(device_id, None)


@pytest.mark.asyncio
async def test_command_cannot_transition_from_terminal_to_running():
    now = datetime.now(timezone.utc)
    command = SimpleNamespace(status="success", started_at=now, finished_at=now, error_code=None, error_message=None)
    with pytest.raises(ValueError, match="状态"):
        await update_command(None, command, "running")

@pytest.mark.asyncio
async def test_closing_session_cancels_inflight_commands():
    session = SimpleNamespace(
        id=uuid4(), status="active", connected_at=datetime.now(timezone.utc),
        disconnected_at=None, duration_seconds=None, disconnect_reason=None,
    )
    db = SimpleNamespace(execute=AsyncMock(return_value=SimpleNamespace(
        scalars=lambda: SimpleNamespace(all=lambda: [session])
    )))
    closed = await close_active_sessions(db, uuid4(), "user_closed")
    assert closed == [session]
    assert session.status == "closed"
    assert session.disconnected_at is not None
    assert db.execute.await_count == 2


@pytest.mark.asyncio
async def test_closing_socket_clears_mappings_and_notifies_both_peers(monkeypatch):
    session_id, device_id = uuid4(), uuid4()
    remote.sid_context["desktop"] = {"kind": "desktop", "device_id": device_id, "session_id": session_id}
    remote.sid_context["mobile"] = {"kind": "mobile", "device_id": device_id, "session_id": session_id}
    remote.desktop_sids[device_id] = "desktop"
    remote.mobile_sids[session_id] = "mobile"
    emit = AsyncMock()
    disconnect = AsyncMock()
    monkeypatch.setattr(remote.sio, "emit", emit)
    monkeypatch.setattr(remote.sio, "disconnect", disconnect)
    try:
        await remote.detach_session(session_id, "closed", "user_closed")
        assert session_id not in remote.mobile_sids
        assert "mobile" not in remote.sid_context
        assert "desktop" not in remote.sid_context
        assert device_id not in remote.desktop_sids
        assert emit.await_count == 2
        assert disconnect.await_count == 2
    finally:
        remote.desktop_sids.pop(device_id, None)
        remote.mobile_sids.pop(session_id, None)
        remote.sid_context.pop("desktop", None)
        remote.sid_context.pop("mobile", None)


@pytest.mark.asyncio
async def test_service_restart_retires_active_sessions(monkeypatch):
    db = SimpleNamespace(execute=AsyncMock(), commit=AsyncMock())
    monkeypatch.setattr(remote, "session_factory", lambda: _DbContext(db))
    await remote.retire_stale_sessions()
    assert db.execute.await_count == 3
    db.commit.assert_awaited_once()

@pytest.mark.asyncio
async def test_pairing_failure_returns_ack_instead_of_hanging(monkeypatch):
    class BrokenDb:
        async def __aenter__(self):
            raise RuntimeError("database unavailable")

        async def __aexit__(self, *_):
            return None

    remote.sid_context["phone"] = {"kind": "unregistered", "user_id": uuid4()}
    monkeypatch.setattr(remote, "session_factory", BrokenDb)
    try:
        result = await remote.mobile_register("phone", {"code": "1234ABCD"})
        assert result["success"] is False
    finally:
        remote.sid_context.pop("phone", None)

@pytest.mark.asyncio
async def test_command_status_locks_row_before_transition(monkeypatch):
    device_id, session_id = uuid4(), uuid4()
    remote.sid_context["desktop"] = {
        "kind": "desktop", "device_id": device_id, "session_id": session_id
    }
    remote.desktop_sids[device_id] = "desktop"
    command = SimpleNamespace(
        status="accepted", started_at=None, finished_at=None,
        error_code=None, error_message=None,
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: command)),
        commit=AsyncMock(),
    )
    monkeypatch.setattr(remote, "session_factory", lambda: _DbContext(db))
    try:
        result = await remote.remote_command_status("desktop", {"requestId": "request", "status": "success"})
        assert result["success"]
        query = db.execute.await_args.args[0]
        assert query._for_update_arg is not None
    finally:
        remote.sid_context.pop("desktop", None)
        remote.desktop_sids.pop(device_id, None)

@pytest.mark.asyncio
async def test_unanswered_command_expires_and_notifies_phone(monkeypatch):
    session_id = uuid4()
    command = SimpleNamespace(
        status="running", started_at=datetime.now(timezone.utc), finished_at=None,
        error_code=None, error_message=None,
    )
    db = SimpleNamespace(
        execute=AsyncMock(return_value=SimpleNamespace(scalar_one_or_none=lambda: command)),
        commit=AsyncMock(),
    )
    monkeypatch.setattr(remote, "session_factory", lambda: _DbContext(db))
    monkeypatch.setattr(remote.asyncio, "sleep", AsyncMock())
    emit = AsyncMock()
    monkeypatch.setattr(remote.sio, "emit", emit)
    remote.mobile_sids[session_id] = "phone"
    try:
        await remote.expire_command(session_id, "request", 30)
        assert command.status == "timeout"
        emit.assert_awaited_once()
        assert emit.await_args.args[0] == "remote:command_status"
    finally:
        remote.mobile_sids.pop(session_id, None)


class _DbContext:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        return self.db

    async def __aexit__(self, *_):
        return None
