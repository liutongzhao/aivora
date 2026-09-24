"use client";

import { useState } from "react";

const actions = ["截图", "局部截图", "编程题", "单选题", "多选题", "通用搜题", "一键重置", "刷新配置", "提高透明度", "降低透明度", "放大内容", "缩小内容", "复制代码", "删除最后截图"];

export default function RemotePage() {
  const [code, setCode] = useState("");
  const [connected, setConnected] = useState(false);
  return (
    <main className="container">
      <section className="hero"><div><div className="eyebrow">REMOTE WORKSPACE</div><h1>手机远程控制</h1><p className="muted">将桌面端常用操作安全带到手机上。</p></div></section>
      <div className="card">
        <h2>{connected ? "桌面端已连接" : "连接桌面客户端"}</h2>
        <p className="muted">{connected ? "可以从下方选择操作。" : "打开桌面端远程控制，输入 8 位连接码。"}</p>
        {!connected ? <div className="form-actions"><input style={{ flex: 1, border: "1px solid var(--line)", borderRadius: 12, padding: 12 }} maxLength={8} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="请输入连接码" /><button className="button" disabled={code.length !== 8} onClick={() => setConnected(true)}>连接</button></div> : <button className="button ghost" onClick={() => setConnected(false)}>断开连接</button>}
      </div>
      {connected && <div className="card" style={{ marginTop: 18 }}><h2>截图与处理</h2><div className="remote-grid">{actions.map((action) => <button className="button remote-action" key={action}>{action}</button>)}</div></div>}
    </main>
  );
}
