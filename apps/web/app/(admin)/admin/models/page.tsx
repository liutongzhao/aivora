"use client";

import { useEffect, useState, type FormEvent } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { Toast } from "../../../../components/ui/Toast";

type Model = { id: string; name: string; display_name: string; supports_vision: boolean; enabled: boolean };
type TrialModel = { baseUrl: string; modelName: string; displayName: string; enabled: boolean; trialTotal: number; keyConfigured: boolean };

export default function AdminModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const [trial, setTrial] = useState<TrialModel | null>(null);
  const [trialKey, setTrialKey] = useState("");
  const [trialSaving, setTrialSaving] = useState(false);
  const [trialTesting, setTrialTesting] = useState(false);
  const [toast, setToast] = useState<{ tone: "success" | "error" | "info"; message: string } | null>(null);
  const load = () => Promise.all([apiFetch<Model[]>("/api/admin/models"), apiFetch<TrialModel>("/api/admin/trial-model")]).then(([nextModels, nextTrial]) => { setModels(nextModels); setTrial(nextTrial); }).catch((reason) => setError(reason instanceof Error ? reason.message : "模型加载失败"));
  useEffect(() => { void load(); }, []);
  async function toggle(model: Model) {
    try { await apiFetch(`/api/admin/models/${model.id}/enabled?enabled=${!model.enabled}`, { method: "PATCH" }); await load(); setToast({ tone: "success", message: model.enabled ? "模型已停用" : "模型已启用" }); }
    catch (reason) { setToast({ tone: "error", message: reason instanceof Error ? reason.message : "操作失败" }); }
  }
  async function saveTrial(event: FormEvent) {
    event.preventDefault();
    if (!trial || (!trialKey && !trial.keyConfigured)) return;
    setTrialSaving(true);
    try {
      await apiFetch("/api/admin/trial-model", { method: "PUT", body: JSON.stringify({ base_url: trial.baseUrl, ...(trialKey ? { api_key: trialKey } : {}), model_name: trial.modelName, display_name: trial.displayName, enabled: trial.enabled, trial_total: trial.trialTotal }) });
      setTrialKey("");
      await load();
      setToast({ tone: "success", message: "内置模型保存成功，用户端已更新" });
    } catch (reason) { setToast({ tone: "error", message: reason instanceof Error ? reason.message : "内置模型保存失败" }); }
    finally { setTrialSaving(false); }
  }
  async function testTrial() {
    if (!trial || (!trialKey && !trial.keyConfigured)) { setToast({ tone: "error", message: "请先配置 API Key" }); return; }
    setTrialTesting(true);
    try {
      await apiFetch("/api/admin/trial-model/test", { method: "POST", body: JSON.stringify({ base_url: trial.baseUrl, ...(trialKey ? { api_key: trialKey } : {}), model_name: trial.modelName, display_name: trial.displayName, enabled: trial.enabled, trial_total: trial.trialTotal }) });
      setToast({ tone: "success", message: "内置模型调用测试成功，未消耗次数" });
    } catch (reason) { setToast({ tone: "error", message: reason instanceof Error ? reason.message : "模型测试失败" }); }
    finally { setTrialTesting(false); }
  }
  return <main className="container">{toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}<div className="app-page-heading"><div><h1>模型配置</h1></div></div>{error && <div className="notice" role="alert">{error}</div>}
    {trial && <section className="card settings-card settings-card-wide"><div className="section-heading"><div><h2>内置模型</h2><p className="section-description">只有保存并启用后，用户端才会显示。API Key 只保存在服务端。</p></div></div><form className="form admin-settings-form" onSubmit={saveTrial}><label>API 地址<input value={trial.baseUrl} onChange={(event) => setTrial({ ...trial, baseUrl: event.target.value })} required /></label><label>模型 ID<input value={trial.modelName} onChange={(event) => setTrial({ ...trial, modelName: event.target.value })} required /></label><label>显示名称<input value={trial.displayName} onChange={(event) => setTrial({ ...trial, displayName: event.target.value })} required /></label><label>默认体验次数<input type="number" min="0" value={trial.trialTotal} onChange={(event) => setTrial({ ...trial, trialTotal: Number(event.target.value) })} required /></label><label>API Key<input type="password" value={trialKey} onChange={(event) => setTrialKey(event.target.value)} placeholder={trial.keyConfigured ? "已配置，重新填写可替换" : "输入内置模型 API Key"} /></label><label className="checkbox-label"><input type="checkbox" checked={trial.enabled} onChange={(event) => setTrial({ ...trial, enabled: event.target.checked })} />启用内置模型</label><div className="button-row"><button className="button secondary" type="button" onClick={() => void testTrial()} disabled={trialTesting || (!trialKey && !trial.keyConfigured)}>{trialTesting ? "测试中…" : "测试模型"}</button><button className="button" type="submit" disabled={trialSaving || (!trialKey && !trial.keyConfigured)}>{trialSaving ? "保存中…" : "保存内置模型"}</button></div></form></section>}
    <div className="admin-table-wrap"><table className="table"><thead><tr><th>模型</th><th>模型 ID</th><th>状态</th><th>操作</th></tr></thead><tbody>{trial?.keyConfigured && <tr><td>{trial.displayName}<div className="muted">系统内置</div></td><td>{trial.modelName}</td><td>{trial.enabled ? "启用" : "停用"}</td><td><span className="muted">由上方配置管理</span></td></tr>}{!trial?.keyConfigured && <tr><td colSpan={4} className="empty-inline">尚未配置内置模型。</td></tr>}</tbody></table></div></main>;
}
