"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type Code = {
  id: string;
  suffix: string;
  status: string;
  activated_by: string | null;
  created_at: string;
};

export default function AdminLicensesPage() {
  const [duration, setDuration] = useState(6);
  const [quantity, setQuantity] = useState(10);
  const [name, setName] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [history, setHistory] = useState<Code[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [settings, list] = await Promise.all([
      apiFetch<{ defaultDurationMonths: number }>("/api/admin/license-settings"),
      apiFetch<{ codes: Code[] }>("/api/admin/license-codes"),
    ]);
    setDuration(settings.defaultDurationMonths);
    setHistory(list.codes);
  }

  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : "授权码加载失败")); }, []);

  async function createBatch(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<{ codes: string[] }>("/api/admin/license-batches", {
        method: "POST",
        body: JSON.stringify({ name: name || undefined, quantity, duration_months: duration }),
      });
      setCodes(result.codes);
      setMessage("授权码已生成。明文只在本次页面显示，请立即保存。");
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "授权码生成失败");
    }
  }

  return <main className="container">
    <div className="app-page-heading"><div><div className="eyebrow">ADMIN / LICENSES</div><h1>授权码与期限</h1><p className="muted">批量生成期限授权，明文只显示一次。</p></div></div>
    {message && <div className="notice" role="status">{message}</div>}
    {error && <div className="notice" role="alert">{error}</div>}
    <section className="panel">
      <div className="panel-heading"><div><span className="eyebrow">CREATE BATCH</span><h2>生成授权码</h2></div></div>
      <form className="form" onSubmit={createBatch}>
        <label>批次备注<input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：首发用户" /></label>
        <label>有效月数<input type="number" min={1} max={120} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label>
        <label>生成数量<input type="number" min={1} max={10000} value={quantity} onChange={(event) => setQuantity(Number(event.target.value))} /></label>
        <button className="button" type="submit">生成授权码</button>
      </form>
    </section>
    {codes.length > 0 && <section className="panel" style={{ marginTop: 18 }}><div className="panel-heading"><div><span className="eyebrow">ONE-TIME RESULT</span><h2>本次生成结果</h2></div></div><div className="answer-content">{codes.join("\n")}</div></section>}
    <section className="panel" style={{ marginTop: 18 }}><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>授权码记录</h2></div></div><div className="admin-table-wrap"><table className="table"><thead><tr><th>后缀</th><th>状态</th><th>兑换账号</th><th>创建时间</th></tr></thead><tbody>{history.map((code) => <tr key={code.id}><td>••••-{code.suffix}</td><td>{code.status}</td><td>{code.activated_by ?? "未兑换"}</td><td>{new Date(code.created_at).toLocaleString("zh-CN")}</td></tr>)}</tbody></table>{history.length === 0 && <p className="muted">暂无授权码记录。</p>}</div></section>
  </main>;
}
