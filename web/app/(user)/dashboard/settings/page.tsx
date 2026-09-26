"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type Connection = { id: string; name: string; base_url: string; enabled: boolean };
type UserModel = { id: string; connection_id: string; name: string; display_name: string; supports_vision: boolean; enabled: boolean };
const modes = [
  ["programming", "编程题"],
  ["single_choice", "单选题"],
  ["multiple_choice", "多选题"],
  ["universal", "通用题"],
  ["debug", "调试题"],
] as const;

export default function SettingsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [models, setModels] = useState<UserModel[]>([]);
  const [name, setName] = useState("我的模型服务");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelName, setModelName] = useState("");
  const [modelDisplayName, setModelDisplayName] = useState("");
  const [selectedConnection, setSelectedConnection] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    const [nextConnections, nextModels] = await Promise.all([
      apiFetch<Connection[]>("/api/user/connections"),
      apiFetch<UserModel[]>("/api/user/models"),
    ]);
    setConnections(nextConnections);
    setModels(nextModels);
    if (!selectedConnection && nextConnections[0]) setSelectedConnection(nextConnections[0].id);
  }

  useEffect(() => { refresh().catch((error) => setMessage(error.message)); }, []);

  async function createConnection(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/api/user/connections", {
        method: "POST",
        body: JSON.stringify({ name, base_url: baseUrl, api_key: apiKey }),
      });
      setApiKey("");
      setMessage("连接已保存");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  }

  async function createModel(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch("/api/user/models", {
        method: "POST",
        body: JSON.stringify({
          connection_id: selectedConnection,
          name: modelName,
          display_name: modelDisplayName || modelName,
          supports_vision: true,
        }),
      });
      setMessage("模型已保存");
      setModelName("");
      setModelDisplayName("");
      await refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  }

  async function setDefault(mode: string, modelId: string) {
    try {
      await apiFetch(`/api/user/models/defaults/${mode}`, {
        method: "PUT",
        body: JSON.stringify({ model_id: modelId, language: "python" }),
      });
      setMessage("题型模型已更新");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  }

  return <main className="container">
    <div className="app-page-heading"><div><div className="eyebrow">YOUR API</div><h1>模型设置</h1><p className="muted">只使用你自己的 API。密钥保存后不会再次显示。</p></div></div>
    {message && <div className="notice">{message}</div>}
    <section className="card">
      <h2>API 连接</h2>
      <form className="form" onSubmit={createConnection}>
        <label>连接名称<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>API 地址<input type="url" placeholder="https://example.com/v1" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required /></label>
        <label>API 密钥<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required /></label>
        <button className="button" type="submit">保存连接</button>
      </form>
      {connections.length > 0 && <ul className="settings-list">{connections.map((connection) => <li key={connection.id}><strong>{connection.name}</strong><span>{connection.base_url}</span><small>{connection.enabled ? "已启用" : "已停用"}</small></li>)}</ul>}
    </section>
    <section className="card">
      <h2>模型</h2>
      <form className="form" onSubmit={createModel}>
        <label>使用连接<select value={selectedConnection} onChange={(event) => setSelectedConnection(event.target.value)} required><option value="">选择连接</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label>
        <label>模型 ID<input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="例如 gpt-4o" required /></label>
        <label>显示名称<input value={modelDisplayName} onChange={(event) => setModelDisplayName(event.target.value)} placeholder="可选" /></label>
        <button className="button" type="submit">保存模型</button>
      </form>
      {models.length > 0 && <div className="settings-list">{models.map((model) => <div key={model.id}><strong>{model.display_name}</strong><span>{model.name}</span></div>)}</div>}
    </section>
    <section className="card">
      <h2>题型默认模型</h2>
      <div className="form">{modes.map(([mode, label]) => <label key={mode}>{label}<select defaultValue="" onChange={(event) => event.target.value && setDefault(mode, event.target.value)}><option value="">选择模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}</select></label>)}</div>
    </section>
  </main>;
}
