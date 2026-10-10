"use client";

import { FormEvent, useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { listAdminLicenseCodes } from "../../../../lib/admin-service";
import type { AdminLicenseCode } from "../../../../types/admin";

function statusLabel(status: string) {
  return status === "unused" ? "未使用" : status === "activated" ? "已激活" : "已撤销";
}

export default function AdminLicensesPage() {
  const [duration, setDuration] = useState(6);
  const [maxDuration, setMaxDuration] = useState(24);
  const [quantity, setQuantity] = useState(10);
  const [name, setName] = useState("");
  const [codes, setCodes] = useState<string[]>([]);
  const [history, setHistory] = useState<AdminLicenseCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSettings, setSavingSettings] = useState(false);
  const [busyCodeId, setBusyCodeId] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const [settings, list] = await Promise.all([
      apiFetch<{ defaultDurationMonths: number; maxDurationMonths: number }>("/api/admin/license-settings"),
      listAdminLicenseCodes(),
    ]);
    setDuration(settings.defaultDurationMonths);
    setMaxDuration(settings.maxDurationMonths);
    setHistory(list);
    setLoading(false);
  }

  useEffect(() => { void load().catch((reason) => { setLoading(false); setError(reason instanceof Error ? reason.message : "授权码加载失败"); }); }, []);

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

  async function saveSettings(event: FormEvent) {
    event.preventDefault();
    setSavingSettings(true);
    setError("");
    setMessage("");
    try {
      await apiFetch("/api/admin/license-settings", {
        method: "PATCH",
        body: JSON.stringify({ default_duration_months: duration, max_duration_months: maxDuration }),
      });
      setMessage("授权期限配置已保存。");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "授权期限保存失败");
    } finally {
      setSavingSettings(false);
    }
  }

  async function revokeCode(code: AdminLicenseCode) {
    if (!window.confirm(`确定撤销未使用授权码 ••••-${code.suffix} 吗？`)) return;
    const reason = window.prompt("请输入撤销原因", "库存作废处理");
    if (!reason) return;
    setBusyCodeId(code.id);
    setError("");
    setMessage("");
    try {
      await apiFetch(`/api/admin/license-codes/${code.id}/revoke`, {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
      setMessage(`授权码 ••••-${code.suffix} 已撤销。`);
      await load();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "授权码撤销失败");
    } finally {
      setBusyCodeId("");
    }
  }

  async function copyCodes() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setMessage(`已复制 ${codes.length} 个授权码。`);
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
    <section className="panel admin-license-settings"><div className="panel-heading"><div><span className="eyebrow">POLICY</span><h2>期限策略</h2><p className="muted">新批次默认使用此期限，单批次不能超过最大期限。</p></div></div><form className="form admin-settings-form" onSubmit={saveSettings}><label>默认有效月数<input type="number" min={1} max={maxDuration} value={duration} onChange={(event) => setDuration(Number(event.target.value))} /></label><label>最大有效月数<input type="number" min={duration} max={120} value={maxDuration} onChange={(event) => setMaxDuration(Number(event.target.value))} /></label><button className="button ghost" type="submit" disabled={savingSettings}>{savingSettings ? "保存中..." : "保存策略"}</button></form></section>
    {codes.length > 0 && <section className="panel admin-license-result"><div className="panel-heading"><div><span className="eyebrow">ONE-TIME RESULT</span><h2>本次生成结果</h2><p className="muted">明文只在本次生成结果中显示，请立即保存。</p></div><button className="button ghost" type="button" onClick={() => void copyCodes()}>复制</button></div><pre className="license-code-result">{codes.join("\n")}</pre></section>}
    <section className="panel admin-license-history"><div className="panel-heading"><div><span className="eyebrow">HISTORY</span><h2>授权码记录</h2></div><span className="muted">{loading ? "加载中..." : `${history.length} 条记录`}</span></div><div className="admin-table-wrap"><table className="table"><thead><tr><th>后缀</th><th>批次</th><th>期限</th><th>状态</th><th>兑换账号</th><th>创建时间</th><th>操作</th></tr></thead><tbody>{history.map((code) => <tr key={code.id}><td>••••-{code.suffix}</td><td>{code.batchName || "未命名批次"}</td><td>{code.durationMonths} 个月</td><td><span className={`ui-badge ${code.status === "unused" ? "ui-badge-info" : code.status === "activated" ? "ui-badge-success" : "ui-badge-danger"}`}>{statusLabel(code.status)}</span></td><td>{code.activatedBy ?? "未兑换"}</td><td>{new Date(code.createdAt).toLocaleString("zh-CN")}</td><td>{code.status === "unused" ? <button className="button ghost" type="button" onClick={() => void revokeCode(code)} disabled={busyCodeId === code.id}>{busyCodeId === code.id ? "撤销中..." : "撤销"}</button> : "—"}</td></tr>)}</tbody></table>{!loading && history.length === 0 && <p className="muted">暂无授权码记录。</p>}</div></section>
  </main>;
}
