"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type Model = { id: string; name: string; display_name: string; supports_vision: boolean };

export default function AdminModelsPage() {
  const [models, setModels] = useState<Model[]>([]);
  const load = () => apiFetch<Model[]>("/api/admin/models").then(setModels).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  async function toggle(model: Model) { await apiFetch(`/api/admin/models/${model.id}/enabled?enabled=false`, { method: "PATCH" }); await load(); }
  return <main className="container"><div className="hero"><div><div className="eyebrow">ADMIN / MODELS</div><h1>模型管理</h1><p className="muted">管理 OpenAI 兼容模型目录。</p></div></div><div className="card"><table className="table"><thead><tr><th>模型</th><th>视觉</th><th>状态</th><th>操作</th></tr></thead><tbody>{models.map((model) => <tr key={model.id}><td>{model.display_name}<div className="muted">{model.name}</div></td><td>{model.supports_vision ? "支持" : "不支持"}</td><td>启用</td><td><button className="button ghost" onClick={() => toggle(model)}>停用</button></td></tr>)}</tbody></table>{models.length === 0 && <p className="muted">暂无模型数据。</p>}</div></main>;
}
