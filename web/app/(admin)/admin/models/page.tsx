"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type Model = { id: string; name: string; display_name: string; supports_vision: boolean; enabled: boolean };

export default function AdminModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const [error, setError] = useState("");
  const load = () => apiFetch<Model[]>("/api/admin/models").then(setModels).catch((reason) => setError(reason instanceof Error ? reason.message : "模型加载失败"));
  useEffect(() => { void load(); }, []);
  async function toggle(model: Model) {
    try { await apiFetch(`/api/admin/models/${model.id}/enabled?enabled=${!model.enabled}`, { method: "PATCH" }); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "操作失败"); }
  }
  return <main className="container"><div className="app-page-heading"><div><div className="eyebrow">ADMIN / MODELS</div><h1>模型目录</h1><p className="muted">管理模型可用状态。</p></div></div>{error && <div className="notice" role="alert">{error}</div>}<div className="admin-table-wrap"><table className="table"><thead><tr><th>模型</th><th>视觉</th><th>状态</th><th>操作</th></tr></thead><tbody>{models.map((model) => <tr key={model.id}><td>{model.display_name}<div className="muted">{model.name}</div></td><td>{model.supports_vision ? "支持" : "不支持"}</td><td>{model.enabled ? "启用" : "停用"}</td><td><button className="button ghost" onClick={() => void toggle(model)}>{model.enabled ? "停用" : "启用"}</button></td></tr>)}</tbody></table>{models.length === 0 && <div className="empty-inline">暂无模型数据。</div>}</div></main>;
}
