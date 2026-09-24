"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type Config = { aiModel: string; programmingModel: string; multipleChoiceModel: string; universalModel: string; language: string; theme: string; selectedProvider: string };
type Model = { name: string; display_name: string };

export default function SettingsPage() {
  const [config, setConfig] = useState<Config | null>(null);
  const [models, setModels] = useState<Model[]>([]);
  const [saved, setSaved] = useState("");
  useEffect(() => { Promise.all([apiFetch<Config>("/api/config"), apiFetch<Model[]>("/api/ai/models")]).then(([current, catalog]) => { setConfig(current); setModels(catalog); }).catch(() => undefined); }, []);
  async function save() { if (!config) return; await apiFetch("/api/config", { method: "PUT", body: JSON.stringify(config) }); setSaved("已保存"); }
  const options = models.map((model) => <option key={model.name} value={model.name}>{model.display_name}</option>);
  return (
    <main className="container">
      <div className="hero"><div><div className="eyebrow">SETTINGS</div><h1>模型设置</h1><p className="muted">为不同题型选择默认模型。</p></div></div>
      <div className="card">{config ? <div className="form">{(["programmingModel", "multipleChoiceModel", "universalModel"] as const).map((key) => <label key={key}>{key === "programmingModel" ? "编程题" : key === "multipleChoiceModel" ? "选择题" : "通用题"}<select value={config[key]} onChange={(event) => setConfig({ ...config, [key]: event.target.value })}>{options}</select></label>)}<div className="form-actions"><button className="button" onClick={save}>保存设置</button>{saved && <span className="muted">{saved}</span>}</div></div> : <p className="muted">正在加载设置…</p>}</div>
    </main>
  );
}
