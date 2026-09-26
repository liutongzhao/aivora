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
  const [defaults, setDefaults] = useState<Record<string, { model_id: string; language: string }>>({});
  const [promptMode, setPromptMode] = useState<(typeof modes)[number][0]>("programming");
  const [prompt, setPrompt] = useState("");

  async function refresh() {
    const [nextConnections, nextModels, nextDefaults] = await Promise.all([
      apiFetch<Connection[]>("/api/user/connections"),
      apiFetch<UserModel[]>("/api/user/models"),
      apiFetch<{ mode: string; model_id: string; language: string }[]>("/api/user/models/defaults"),
    ]);
    setConnections(nextConnections);
    setModels(nextModels);
    setDefaults(Object.fromEntries(nextDefaults.map((item) => [item.mode, { model_id: item.model_id, language: item.language }])));
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
        body: JSON.stringify({ model_id: modelId, language: defaults[mode]?.language || (mode === "programming" || mode === "debug" ? "python" : "") }),
      });
      setMessage("题型模型已更新");
      setDefaults((current) => ({ ...current, [mode]: { model_id: modelId, language: current[mode]?.language || (mode === "programming" || mode === "debug" ? "python" : "") } }));
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  }

  async function setLanguage(mode: string, language: string) {
    const current = defaults[mode];
    if (!current?.model_id) return;
    await apiFetch(`/api/user/models/defaults/${mode}`, {
      method: "PUT",
      body: JSON.stringify({ model_id: current.model_id, language }),
    });
    setDefaults((value) => ({ ...value, [mode]: { ...current, language } }));
    setMessage("语言已更新");
  }

  async function loadPrompt(mode: string) {
    setPromptMode(mode as (typeof modes)[number][0]);
    const versions = await apiFetch<{ content: string }[]>(`/api/user/prompts/${mode}`);
    setPrompt(versions[0]?.content ?? "");
  }

  async function savePrompt(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch(`/api/user/prompts/${promptMode}`, { method: "POST", body: JSON.stringify({ content: prompt }) });
      setMessage("提示词已保存，新任务会使用新版本");
    } catch (error) { setMessage(error instanceof Error ? error.message : "保存失败"); }
  }

  return <main className="container">
    <div className="app-page-heading"><div><div className="eyebrow">CONFIGURATION</div><h1>模型设置</h1><p>管理你的 API 连接、题型模型和输出规则。</p></div><div className="settings-security"><span>●</span> 密钥加密保存</div></div>
    {message && <div className="notice">{message}</div>}
    <div className="settings-grid">
    <section className="card settings-card">
      <div className="section-heading"><div><span className="eyebrow">01 / CONNECTION</span><h2>API 连接</h2></div><span className="section-dot" /></div>
      <form className="form" onSubmit={createConnection}>
        <label>连接名称<input value={name} onChange={(event) => setName(event.target.value)} required /></label>
        <label>API 地址<input type="url" placeholder="https://example.com/v1" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} required /></label>
        <label>API 密钥<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} required /></label>
        <button className="button" type="submit">保存连接</button>
      </form>
      {connections.length > 0 && <ul className="settings-list">{connections.map((connection) => <li key={connection.id}><strong>{connection.name}</strong><span>{connection.base_url}</span><small>{connection.enabled ? "已启用" : "已停用"}</small></li>)}</ul>}
    </section>
    <section className="card settings-card">
      <div className="section-heading"><div><span className="eyebrow">02 / MODELS</span><h2>模型</h2></div><span className="section-dot" /></div>
      <form className="form" onSubmit={createModel}>
        <label>使用连接<select value={selectedConnection} onChange={(event) => setSelectedConnection(event.target.value)} required><option value="">选择连接</option>{connections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}</select></label>
        <label>模型 ID<input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="例如 gpt-4o" required /></label>
        <label>显示名称<input value={modelDisplayName} onChange={(event) => setModelDisplayName(event.target.value)} placeholder="可选" /></label>
        <button className="button" type="submit">保存模型</button>
      </form>
      {models.length > 0 && <div className="settings-list">{models.map((model) => <div key={model.id}><strong>{model.display_name}</strong><span>{model.name}</span></div>)}</div>}
    </section>
    <section className="card settings-card settings-card-wide">
      <div className="section-heading"><div><span className="eyebrow">03 / ROUTING</span><h2>题型默认模型</h2></div><span className="section-dot" /></div>
      <div className="routing-grid">{modes.map(([mode, label]) => <div className="routing-row" key={mode}><label>{label}<select value={defaults[mode]?.model_id || ""} onChange={(event) => event.target.value && setDefault(mode, event.target.value)}><option value="">选择模型</option>{models.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}</select></label>{(mode === "programming" || mode === "debug") && <label>输出语言<select value={defaults[mode]?.language || "python"} onChange={(event) => void setLanguage(mode, event.target.value)}><option value="python">Python</option><option value="java">Java</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="cpp">C++</option><option value="go">Go</option><option value="rust">Rust</option></select></label>}</div>)}</div>
    </section>
    <section className="card settings-card settings-card-wide">
      <div className="section-heading"><div><span className="eyebrow">04 / PROMPTS</span><h2>题型提示词</h2></div><span className="section-dot" /></div>
      <div className="form-actions">{modes.map(([mode, label]) => <button className={promptMode === mode ? "button" : "button secondary"} type="button" key={mode} onClick={() => void loadPrompt(mode)}>{label}</button>)}</div>
      <form className="form prompt-form" onSubmit={savePrompt}><label>{modes.find(([mode]) => mode === promptMode)?.[1]}提示词<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={10} required /></label><button className="button" type="submit">保存提示词</button></form>
    </section>
    </div>
  </main>;
}
