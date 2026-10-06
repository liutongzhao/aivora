"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import {
  Activity, AlertCircle, Camera, CheckCircle2, ClipboardCopy, Code2,
  History, ListChecks, LoaderCircle, Minus, Monitor, Plus, Power,
  RefreshCw, RotateCcw, ScanLine, Search, Smartphone, Sun, Trash2,
} from "lucide-react";
import { apiFetch, getApiBase } from "../../lib/api-client";

const actions = [
  ["截图", "screenshot"],
  ["局部截图", "partialScreenshot"],
  ["编程题", "programming"],
  ["单选题", "singleChoice"],
  ["多选题", "multipleChoice"],
  ["通用搜题", "universal"],
  ["一键重置", "reset"],
  ["刷新配置", "refreshConfig"],
  ["提高透明度", "increaseOpacity"],
  ["降低透明度", "decreaseOpacity"],
  ["放大内容", "zoomIn"],
  ["缩小内容", "zoomOut"],
  ["复制代码", "copyCode"],
  ["删除最后截图", "deleteLastScreenshot"],
] as const;
type Command = { requestId: string; action: string; status: string; errorMessage?: string; createdAt?: string };
type History = { id: string; status: string; connectedAt?: string; disconnectedAt?: string; durationSeconds?: number; disconnectReason?: string };
const labels: Record<string, string> = Object.fromEntries(actions.map(([label, action]) => [action, label]));
const actionIcons: Record<string, typeof Camera> = {
  screenshot: Camera, partialScreenshot: ScanLine, programming: Code2,
  singleChoice: ListChecks, multipleChoice: ListChecks, universal: Search,
  reset: RotateCcw, refreshConfig: RefreshCw, increaseOpacity: Sun,
  decreaseOpacity: Sun, zoomIn: Plus, zoomOut: Minus,
  copyCode: ClipboardCopy, deleteLastScreenshot: Trash2,
};
const actionGroups = [
  { name: "截屏与答题", items: actions.slice(0, 6) },
  { name: "窗口与显示", items: actions.slice(8, 12) },
  { name: "其他操作", items: [...actions.slice(6, 8), ...actions.slice(12)] },
];
const statusLabels: Record<string, string> = {
  sending: "发送中", accepted: "已接收", running: "执行中", success: "已完成",
  failed: "失败", timeout: "超时", rejected: "已拒绝", cancelled: "已取消",
};
function duration(seconds: number) {
  return `${Math.floor(seconds / 60)}分${String(seconds % 60).padStart(2, "0")}秒`;
}
function createRequestId() {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export default function RemotePage() {
  const [code, setCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const [session, setSession] = useState<{ sessionId?: string; connectedAt?: number; status?: string }>({});
  const [commandStates, setCommandStates] = useState<Record<string, Command>>({});
  const [history, setHistory] = useState<History[]>([]);
  const [recentCommands, setRecentCommands] = useState<Command[]>([]);
  const [now, setNow] = useState(Date.now());
  const [historyView, setHistoryView] = useState<"commands" | "sessions">("commands");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  async function refreshHistory() {
    try {
      const [sessions, commands] = await Promise.all([
        apiFetch<History[]>("/api/remote/sessions"),
        apiFetch<Command[]>("/api/remote/commands"),
      ]);
      setHistory(sessions);
      setRecentCommands(commands);
    } catch {
      // History is optional while the live connection remains available.
    }
  }
  useEffect(() => { void refreshHistory(); }, []);

  function connect() {
    const sessionId = window.localStorage.getItem("aivora_session_id");
    if (!sessionId || code.length !== 8) {
      setMessage("请先在当前浏览器登录，并输入有效连接码");
      return;
    }
    socketRef.current?.disconnect();
    setConnected(false);
    setMessage("正在连接桌面端…");
    const socket = io(`${getApiBase()}/remote`, {
      auth: { sessionId },
      transports: ["polling", "websocket"],
      reconnection: true,
      reconnectionAttempts: 3,
      timeout: 10000,
    });
    socketRef.current = socket;
    socket.on("connect", () => socket.timeout(10000).emit("remote:mobile_register", { code }, (error: Error | null, result: { success?: boolean; error?: string }) => {
      if (error) { setConnected(false); setMessage("连接超时，请检查桌面端和本地服务后重试"); socket.disconnect(); return; }
      if (!result?.success) { setConnected(false); setMessage(result?.error ?? "连接失败"); socket.disconnect(); return; }
      setConnected(true);
      setMessage("已连接到桌面客户端");
      void refreshHistory();
    }));
    socket.on("remote:session_state", (next: { status?: string; sessionId?: string; connectedAt?: number; reason?: string }) => {
      setSession(next);
      const active = next.status === "active";
      setConnected(active);
      const reasons: Record<string, string> = { new_remote_session: "当前账号已在其他设备建立远程连接", user_closed: "远程连接已结束", socket_disconnected: "连接已断开" };
      setMessage(active ? "已连接到桌面客户端" : reasons[next.reason ?? ""] ?? "远程连接已结束");
      if (!active) void refreshHistory();
    });
    socket.on("remote:command_status", (result: { requestId: string; status: string; errorMessage?: string }) => {
      setCommandStates((current) => ({
        ...current,
        [result.requestId]: { ...current[result.requestId], ...result },
      }));
      if (["success", "failed", "timeout", "rejected"].includes(result.status)) void refreshHistory();
    });
    socket.on("remote:result", (result: { success?: boolean; error?: string; requestId?: string }) => {
      if (result.requestId) {
        setCommandStates((current) => ({ ...current, [result.requestId!]: { ...current[result.requestId!], status: result.success ? "success" : "failed", errorMessage: result.error } }));
      }
      setMessage(result.success ? "操作已完成" : result.error ?? "操作失败");
    });
    socket.on("connect_error", () => { setConnected(false); setMessage("无法连接远程服务"); });
    socket.on("disconnect", () => { setConnected(false); setMessage((current) => current === "正在连接桌面端…" ? "连接已中断，请重试" : current === "已连接到桌面客户端" ? "桌面端已断开" : current); void refreshHistory(); });
  }

  function execute(action: string) {
    const socket = socketRef.current;
    if (!connected || !socket?.connected) {
      setConnected(false);
      setMessage("连接已失效，请重新连接");
      return;
    }
    const requestId = createRequestId();
    setCommandStates((current) => ({ ...current, [requestId]: { requestId, action, status: "sending", createdAt: new Date().toISOString() } }));
    socket.timeout(10000).emit("remote:command", { action, requestId }, (error: Error | null, result: { success?: boolean; error?: string }) => {
      if (error || !result?.success) {
        setCommandStates((current) => ({ ...current, [requestId]: { ...current[requestId], status: "failed", errorMessage: error ? "发送超时，请重新连接后重试" : result?.error ?? "操作发送失败" } }));
        if (error) {
          setConnected(false);
          setMessage("发送超时，请重新连接后重试");
        }
      }
      else setCommandStates((current) => {
        const previous = current[requestId];
        return { ...current, [requestId]: ["sending", "accepted"].includes(previous?.status) ? { ...previous, status: "accepted" } : previous };
      });
    });
    return requestId;
  }

  const currentCommands = Object.values(commandStates).reverse();
  const activity = [
    ...currentCommands,
    ...recentCommands.filter((item) => !commandStates[item.requestId]),
  ].slice(0, 8);

  return (
    <main className="remote-workspace">
      <header className="remote-header">
        <div>
          <span className="remote-kicker">AIVORA / REMOTE</span>
          <h1>手机远程控制</h1>
        </div>
        <span className={`remote-presence ${connected ? "is-online" : ""}`}>
          <span className="remote-presence-dot" />{connected ? "桌面端在线" : "未连接"}
        </span>
      </header>

      <section className="remote-connection" aria-label="连接状态">
        <div className="remote-connection-icon">{connected ? <Monitor size={22} /> : <Smartphone size={22} />}</div>
        <div className="remote-connection-main">
          <h2>{connected ? "已连接桌面客户端" : "连接桌面客户端"}</h2>
          {connected ? (
            <p><span className="remote-connected-at">连接于 {session.connectedAt ? new Date(session.connectedAt).toLocaleTimeString() : "刚刚"} <span className="remote-separator">·</span> </span>已连接 {session.connectedAt ? duration(Math.max(0, Math.floor((now - session.connectedAt) / 1000))) : "0分00秒"}</p>
          ) : (
            <p>在桌面端生成连接码后输入</p>
          )}
        </div>
        {connected && <button className="remote-disconnect" title="断开连接" onClick={() => {
          socketRef.current?.disconnect();
          void apiFetch("/api/remote/session/close", { method: "POST" }).then(refreshHistory).catch(() => setMessage("结束会话失败，请重试"));
        }}><Power size={17} aria-hidden="true" /><span>断开</span></button>}
        {!connected && <div className="remote-connect-form">
          <input aria-label="连接码" maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="请输入连接码" />
          <button className="button" disabled={code.length !== 8} onClick={connect}>连接</button>
        </div>}
      </section>
      {message && message !== "已连接到桌面客户端" && <p className={`remote-message ${message.includes("失败") || message.includes("超时") ? "is-error" : ""}`} role="status">{message}</p>}

      {connected && <section className="remote-actions" aria-label="远程操作">
        <div className="remote-section-head"><h2>远程操作</h2><span>选择一项操作</span></div>
        {actionGroups.map((group) => <div className="remote-action-group" key={group.name}>
          <h3>{group.name}</h3>
          <div className="remote-control-grid">{group.items.map(([label, action]) => {
            const Icon = actionIcons[action];
            const pending = currentCommands.some((item) => item.action === action && ["sending", "accepted", "running"].includes(item.status));
            return <button className="remote-control-button" key={action} disabled={pending} onClick={() => execute(action)}>
              {pending ? <LoaderCircle size={19} className="remote-spin" aria-hidden="true" /> : <Icon size={19} aria-hidden="true" />}
              <span>{label}</span>
            </button>;
          })}</div>
        </div>)}
      </section>}

      <section className="remote-records" aria-label="远程记录">
        <div className="remote-records-head">
          <h2>记录</h2>
          <div className="remote-tabs" role="tablist" aria-label="记录类型">
            <button role="tab" aria-selected={historyView === "commands"} onClick={() => setHistoryView("commands")}><Activity size={15} />操作记录</button>
            <button role="tab" aria-selected={historyView === "sessions"} onClick={() => setHistoryView("sessions")}><History size={15} />连接记录</button>
          </div>
        </div>
        {historyView === "commands" ? activity.length === 0 ? <p className="remote-empty">暂无操作记录</p> :
          <div className="remote-record-list">{activity.map((item) => {
            const pending = ["sending", "accepted", "running"].includes(item.status);
            const failed = ["failed", "timeout", "rejected", "cancelled"].includes(item.status);
            return <div className="remote-record" key={item.requestId}>
              <span className={`remote-record-icon ${failed ? "is-error" : pending ? "is-pending" : ""}`}>
                {failed ? <AlertCircle size={17} /> : pending ? <LoaderCircle size={17} className="remote-spin" /> : <CheckCircle2 size={17} />}
              </span>
              <span className="remote-record-description"><strong>{labels[item.action] ?? item.action}</strong>{item.errorMessage && <small>{item.errorMessage}</small>}</span>
              <span className={`remote-record-state ${failed ? "is-error" : pending ? "is-pending" : ""}`}>{statusLabels[item.status] ?? item.status}</span>
            </div>;
          })}</div> :
          history.length === 0 ? <p className="remote-empty">暂无连接记录</p> :
          <div className="remote-record-list">{history.slice(0, 8).map((item) => <div className="remote-record" key={item.id}>
            <span className="remote-record-icon"><Smartphone size={17} /></span>
            <span className="remote-record-description"><strong>{item.connectedAt ? new Date(item.connectedAt).toLocaleString() : "等待连接"}</strong><small>{item.status === "active" ? "连接中" : item.status === "replaced" ? "已被替换" : "已结束"}</small></span>
            <span className="remote-record-duration">{item.durationSeconds != null ? duration(item.durationSeconds) : item.connectedAt && item.status === "active" ? duration(Math.max(0, Math.floor((now - new Date(item.connectedAt).getTime()) / 1000))) : "0分00秒"}</span>
          </div>)}</div>}
      </section>
    </main>
  );
}
