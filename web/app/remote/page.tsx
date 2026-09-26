"use client";

import { useEffect, useRef, useState } from "react";
import { io, Socket } from "socket.io-client";
import { getApiBase } from "../../lib/api-client";

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

export default function RemotePage() {
  const [code, setCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [message, setMessage] = useState("");
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  function connect() {
    const sessionId = window.localStorage.getItem("aivora_session_id");
    if (!sessionId || code.length !== 8) {
      setMessage("请先在当前浏览器登录，并输入有效连接码");
      return;
    }
    setMessage("正在连接桌面端…");
    const socket = io(`${getApiBase()}/remote`, { auth: { sessionId }, transports: ["websocket"] });
    socketRef.current = socket;
    socket.on("connect", () => socket.emit("remote:mobile_register", { code }, (result: { success?: boolean; error?: string }) => {
      if (!result?.success) { setMessage(result?.error ?? "连接失败"); socket.disconnect(); return; }
      setConnected(true);
      setMessage("已连接到桌面客户端");
    }));
    socket.on("remote:result", (result: { success?: boolean; error?: string }) => setMessage(result.success ? "操作已完成" : result.error ?? "操作失败"));
    socket.on("connect_error", () => setMessage("无法连接远程服务"));
    socket.on("disconnect", () => { setConnected(false); setMessage("桌面端已断开"); });
  }

  function execute(action: string) {
    socketRef.current?.emit("remote:execute", { action, requestId: crypto.randomUUID() }, (result: { success?: boolean; error?: string }) => {
      if (!result?.success) setMessage(result?.error ?? "操作发送失败");
    });
  }

  return (
    <main className="container">
      <section className="hero"><div><div className="eyebrow">REMOTE WORKSPACE</div><h1>手机远程控制</h1><p className="muted">将桌面端常用操作安全带到手机上。</p></div></section>
      <div className="card">
        <h2>{connected ? "桌面端已连接" : "连接桌面客户端"}</h2>
        <p className="muted">{connected ? "可以从下方选择操作。" : "打开桌面端远程控制，输入 8 位连接码。"}</p>
        {!connected ? <div className="form-actions"><input style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 12, padding: 12 }} maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="请输入连接码" /><button className="button" disabled={code.length !== 8} onClick={connect}>连接</button></div> : <button className="button ghost" onClick={() => socketRef.current?.disconnect()}>断开连接</button>}
        {message && <p className="muted" style={{ marginTop: 12 }}>{message}</p>}
      </div>
      {connected && <div className="card" style={{ marginTop: 18 }}><h2>截图与处理</h2><div className="remote-grid">{actions.map(([label, action]) => <button className="button remote-action" key={action} onClick={() => execute(action)}>{label}</button>)}</div></div>}
    </main>
  );
}
