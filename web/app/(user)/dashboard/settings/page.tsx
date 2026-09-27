"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { Toast } from "../../../../components/ui/Toast";

type Connection = { id: string; name: string; base_url: string; enabled: boolean };
type UserModel = {
  id: string;
  connection_id: string;
  name: string;
  display_name: string;
  supports_vision: boolean;
  enabled: boolean;
};
type ToastState = { tone: "success" | "error" | "info"; message: string };

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
  const [selectedConnection, setSelectedConnection] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [connectionFormOpen, setConnectionFormOpen] = useState(false);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [connectionName, setConnectionName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [modelFormOpen, setModelFormOpen] = useState(false);
  const [modelName, setModelName] = useState("");
  const [modelDisplayName, setModelDisplayName] = useState("");
  const [modelSupportsVision, setModelSupportsVision] = useState(true);
  const [editingModelId, setEditingModelId] = useState<string | null>(null);
  const [defaults, setDefaults] = useState<Record<string, { model_id: string; language: string }>>({});
  const [promptMode, setPromptMode] = useState<(typeof modes)[number][0]>("programming");
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);

  const selectedModels = useMemo(
    () => models.filter((model) => model.connection_id === selectedConnection),
    [models, selectedConnection],
  );
  const importedModelNames = useMemo(
    () => new Set(selectedModels.map((model) => model.name)),
    [selectedModels],
  );
  const activeModels = models.filter(
    (model) => model.enabled && connections.some((connection) => connection.id === model.connection_id && connection.enabled),
  );

  function notify(tone: ToastState["tone"], message: string) {
    setToast({ tone, message });
  }

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  async function refresh() {
    const [nextConnections, nextModels, nextDefaults] = await Promise.all([
      apiFetch<Connection[]>("/api/user/connections"),
      apiFetch<UserModel[]>("/api/user/models"),
      apiFetch<{ mode: string; model_id: string; language: string }[]>("/api/user/models/defaults"),
    ]);
    setConnections(nextConnections);
    setModels(nextModels);
    setDefaults(Object.fromEntries(nextDefaults.map((item) => [item.mode, { model_id: item.model_id, language: item.language }])));
    setSelectedConnection((current) => (
      nextConnections.some((connection) => connection.id === current && connection.enabled)
        ? current
        : nextConnections.find((connection) => connection.enabled)?.id ?? ""
    ));
  }

  useEffect(() => {
    refresh().catch((error) => notify("error", error instanceof Error ? error.message : "配置加载失败"));
  }, []);

  useEffect(() => {
    let active = true;
    setAvailableModels([]);
    if (!selectedConnection) return;
    setSyncing(true);
    apiFetch<{ models: string[] }>(`/api/user/connections/${selectedConnection}/test`, { method: "POST" })
      .then((result) => {
        if (active) setAvailableModels(result.models);
      })
      .catch((error) => {
        if (active) notify("error", error instanceof Error ? error.message : "同步模型失败");
      })
      .finally(() => {
        if (active) setSyncing(false);
      });
    return () => { active = false; };
  }, [selectedConnection]);

  function resetConnectionForm() {
    setConnectionFormOpen(false);
    setEditingConnectionId(null);
    setConnectionName("");
    setBaseUrl("");
    setApiKey("");
  }

  function openNewConnection() {
    setEditingConnectionId(null);
    setConnectionName("");
    setBaseUrl("");
    setApiKey("");
    setConnectionFormOpen(true);
  }

  function editConnection(connection: Connection) {
    setEditingConnectionId(connection.id);
    setConnectionName(connection.name);
    setBaseUrl(connection.base_url);
    setApiKey("");
    setConnectionFormOpen(true);
  }

  async function saveConnection(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editingConnectionId) {
        const body: Record<string, string | boolean> = {
          name: connectionName,
          base_url: baseUrl,
        };
        if (apiKey.trim()) {
          body.api_key = apiKey;
          body.replace_key = true;
        }
        await apiFetch(`/api/user/connections/${editingConnectionId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        notify("success", "连接已更新");
      } else {
        const connection = await apiFetch<Connection>("/api/user/connections", {
          method: "POST",
          body: JSON.stringify({ name: connectionName, base_url: baseUrl, api_key: apiKey }),
        });
        setSelectedConnection(connection.id);
        notify("success", "连接已保存");
      }
      resetConnectionForm();
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "保存连接失败");
    }
  }

  async function testConnection(connectionId: string) {
    if (selectedConnection !== connectionId) {
      setSelectedConnection(connectionId);
      return;
    }
    try {
      setSyncing(true);
      const result = await apiFetch<{ models: string[] }>(`/api/user/connections/${connectionId}/test`, { method: "POST" });
      setAvailableModels(result.models);
      notify("success", `连接正常，发现 ${result.models.length} 个模型`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setSyncing(false);
    }
  }

  async function testDraftConnection() {
    try {
      setSyncing(true);
      const result = await apiFetch<{ models: string[] }>("/api/user/connections/test", {
        method: "POST",
        body: JSON.stringify({ base_url: baseUrl, api_key: apiKey }),
      });
      notify("success", `连接正常，发现 ${result.models.length} 个模型`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "连接测试失败");
    } finally {
      setSyncing(false);
    }
  }

  async function disableConnection(connectionId: string) {
    if (!window.confirm("停用后，该连接下的模型将无法执行新任务。确定停用吗？")) return;
    try {
      await apiFetch(`/api/user/connections/${connectionId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled: false }),
      });
      notify("success", "连接已停用");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "停用连接失败");
    }
  }

  async function setConnectionEnabled(connectionId: string, enabled: boolean) {
    try {
      await apiFetch(`/api/user/connections/${connectionId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      notify("success", enabled ? "连接已启用" : "连接已停用");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "更新连接状态失败");
    }
  }

  function resetModelForm() {
    setModelFormOpen(false);
    setEditingModelId(null);
    setModelName("");
    setModelDisplayName("");
    setModelSupportsVision(true);
  }

  function editModel(model: UserModel) {
    setEditingModelId(model.id);
    setModelName(model.name);
    setModelDisplayName(model.display_name);
    setModelSupportsVision(model.supports_vision);
    setModelFormOpen(true);
  }

  async function saveModel(event: React.FormEvent) {
    event.preventDefault();
    try {
      if (editingModelId) {
        await apiFetch(`/api/user/models/${editingModelId}`, {
          method: "PATCH",
          body: JSON.stringify({
            connection_id: selectedConnection,
            name: modelName,
            display_name: modelDisplayName || modelName,
            supports_vision: modelSupportsVision,
          }),
        });
        notify("success", "模型已更新");
      } else {
        await apiFetch("/api/user/models", {
          method: "POST",
          body: JSON.stringify({
            connection_id: selectedConnection,
            name: modelName,
            display_name: modelDisplayName || modelName,
            supports_vision: modelSupportsVision,
          }),
        });
        notify("success", "模型已添加");
      }
      resetModelForm();
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "保存模型失败");
    }
  }

  async function addDiscoveredModel(name: string) {
    try {
      await apiFetch("/api/user/models", {
        method: "POST",
        body: JSON.stringify({
          connection_id: selectedConnection,
          name,
          display_name: name,
          supports_vision: true,
        }),
      });
      notify("success", `${name} 已添加`);
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "添加模型失败");
    }
  }

  async function disableModel(modelId: string) {
    if (!window.confirm("停用后，该模型不能再执行新任务。确定停用吗？")) return;
    try {
      await apiFetch(`/api/user/models/${modelId}`, { method: "DELETE" });
      notify("success", "模型已停用");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "停用模型失败");
    }
  }

  async function setModelEnabled(modelId: string, enabled: boolean) {
    try {
      await apiFetch(`/api/user/models/${modelId}`, {
        method: "PATCH",
        body: JSON.stringify({ enabled }),
      });
      notify("success", enabled ? "模型已启用" : "模型已停用");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "更新模型状态失败");
    }
  }

  async function removeModel(model: UserModel) {
    if (!window.confirm(`删除 ${model.display_name}？删除后可重新添加同名模型。`)) return;
    try {
      await apiFetch(`/api/user/models/${model.id}`, { method: "DELETE" });
      notify("success", "模型已删除");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "删除模型失败");
    }
  }

  async function testModel(model: UserModel) {
    try {
      setSyncing(true);
      await apiFetch(`/api/user/models/${model.id}/test`, { method: "POST" });
      notify("success", `${model.display_name} 调用测试成功`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "模型调用测试失败");
    } finally {
      setSyncing(false);
    }
  }

  async function setDefault(mode: string, modelId: string) {
    try {
      await apiFetch(`/api/user/models/defaults/${mode}`, {
        method: "PUT",
        body: JSON.stringify({
          model_id: modelId,
          language: defaults[mode]?.language || (mode === "programming" || mode === "debug" ? "python" : ""),
        }),
      });
      setDefaults((current) => ({
        ...current,
        [mode]: {
          model_id: modelId,
          language: current[mode]?.language || (mode === "programming" || mode === "debug" ? "python" : ""),
        },
      }));
      notify("success", "题型默认模型已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "更新默认模型失败");
    }
  }

  async function setLanguage(mode: string, language: string) {
    const current = defaults[mode];
    if (!current?.model_id) return;
    try {
      await apiFetch(`/api/user/models/defaults/${mode}`, {
        method: "PUT",
        body: JSON.stringify({ model_id: current.model_id, language }),
      });
      setDefaults((value) => ({ ...value, [mode]: { ...current, language } }));
      notify("success", "输出语言已更新");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "更新语言失败");
    }
  }

  async function loadPrompt(mode: string) {
    try {
      setPromptMode(mode as (typeof modes)[number][0]);
      const versions = await apiFetch<{ content: string }[]>(`/api/user/prompts/${mode}`);
      setPrompt(versions[0]?.content ?? "");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "提示词加载失败");
    }
  }

  async function savePrompt(event: React.FormEvent) {
    event.preventDefault();
    try {
      await apiFetch(`/api/user/prompts/${promptMode}`, {
        method: "POST",
        body: JSON.stringify({ content: prompt }),
      });
      notify("success", "提示词已保存");
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "保存提示词失败");
    }
  }

  return (
    <main className="container settings-page">
      {toast && <Toast tone={toast.tone} message={toast.message} onDismiss={() => setToast(null)} />}
      <div className="app-page-heading">
        <div>
          <div className="eyebrow">CONFIGURATION</div>
          <h1>模型设置</h1>
          <p>先管理 API 连接，再同步模型，最后设置题型默认模型。</p>
        </div>
        <div className="settings-security"><span>●</span> 密钥加密保存</div>
      </div>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading">
          <div><span className="eyebrow">01 / CONNECTIONS</span><h2>API 连接管理</h2><p className="section-description">连接保存后，API Key 只在服务端加密保存。</p></div>
          <button className="button" type="button" onClick={openNewConnection}>新增连接</button>
        </div>
        {connectionFormOpen && (
          <form className="settings-form-panel form" onSubmit={saveConnection}>
            <div className="form-panel-heading">
              <div><strong>{editingConnectionId ? "编辑连接" : "新增连接"}</strong><span>API Key 不会在编辑时回显。</span></div>
              <button className="button ghost" type="button" onClick={resetConnectionForm}>取消</button>
            </div>
            <div className="form-grid">
              <label>连接名称<input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} placeholder="例如 OpenAI 主账号" required /></label>
              <label>API 地址<input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" required /></label>
              <label className="form-grid-wide">API 密钥<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={editingConnectionId ? "留空表示保留原密钥" : "输入供应商 API Key"} required={!editingConnectionId} /></label>
            </div>
            <div className="form-actions">
              <button className="button" type="submit">{editingConnectionId ? "更新连接" : "保存连接"}</button>
              {!editingConnectionId && <button className="button secondary" type="button" onClick={() => void testDraftConnection()} disabled={!baseUrl || !apiKey || syncing}>{syncing ? "测试中…" : "测试连接"}</button>}
              {editingConnectionId && <button className="button secondary" type="button" onClick={() => void (apiKey ? testDraftConnection() : testConnection(editingConnectionId))} disabled={syncing}>{syncing ? "测试中…" : "测试连接"}</button>}
            </div>
          </form>
        )}
        <div className="settings-table">
          <div className="settings-table-head"><span>连接</span><span>地址</span><span>状态</span><span>操作</span></div>
          {connections.map((connection) => (
            <div className="settings-table-row" key={connection.id}>
              <strong>{connection.name}</strong>
              <span>{connection.base_url}</span>
              <span className={connection.enabled ? "status-text status-success" : "status-text"}>{connection.enabled ? "已启用 · Key 已加密" : "已停用"}</span>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={() => editConnection(connection)}>编辑</button>
                <button className="button secondary" type="button" onClick={() => void testConnection(connection.id)} disabled={syncing}>{syncing && selectedConnection === connection.id ? "测试中…" : "测试并同步"}</button>
                {connection.enabled
                  ? <button className="button ghost" type="button" onClick={() => void disableConnection(connection.id)}>停用</button>
                  : <button className="button secondary" type="button" onClick={() => void setConnectionEnabled(connection.id, true)}>启用</button>}
              </div>
            </div>
          ))}
          {connections.length === 0 && <div className="empty-inline">还没有 API 连接，先新增一个连接。</div>}
        </div>
      </section>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading">
          <div><span className="eyebrow">02 / MODELS</span><h2>模型管理</h2><p className="section-description">选择连接后同步供应商模型，不需要手动填写模型 ID。模型测试会发送一次最小文本请求，可能产生少量费用。</p></div>
          <div className="form-actions">
            <select className="settings-inline-select" value={selectedConnection} onChange={(event) => setSelectedConnection(event.target.value)}>
              <option value="">选择连接</option>
              {connections.filter((connection) => connection.enabled).map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
            </select>
            <button className="button" type="button" onClick={() => selectedConnection && void testConnection(selectedConnection)} disabled={!selectedConnection || syncing}>{syncing ? "同步中…" : "同步模型"}</button>
          </div>
        </div>
        {selectedConnection && availableModels.length > 0 && (
          <div className="discovered-models">
            <div className="subsection-heading"><strong>发现的模型</strong><span>选择后添加到你的模型列表</span></div>
            <div className="discovered-model-grid">
              {availableModels.map((name) => (
                <div className="discovered-model" key={name}>
                  <span>{name}</span>
                  <button className="button secondary" type="button" onClick={() => void addDiscoveredModel(name)} disabled={importedModelNames.has(name)}>{importedModelNames.has(name) ? "已添加" : "添加"}</button>
                </div>
              ))}
            </div>
          </div>
        )}
        {selectedConnection && availableModels.length === 0 && <div className="empty-inline model-sync-empty">点击“同步模型”读取这个连接下的可用模型。</div>}
        <div className="settings-table model-table">
          <div className="settings-table-head"><span>模型</span><span>模型 ID</span><span>能力</span><span>操作</span></div>
          {selectedModels.map((model) => (
            <div className="settings-table-row" key={model.id}>
              <strong>{model.display_name}</strong>
              <span>{model.name}</span>
              <span className={model.enabled ? "status-text status-success" : "status-text"}>{model.enabled ? (model.supports_vision ? "可处理图片" : "仅文本") : "已停用"}</span>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={() => editModel(model)}>编辑</button>
                <button className="button secondary" type="button" onClick={() => void testModel(model)} disabled={syncing || !model.enabled}>测试</button>
                {model.enabled
                  ? <button className="button ghost" type="button" onClick={() => void disableModel(model.id)}>停用</button>
                  : <button className="button secondary" type="button" onClick={() => void setModelEnabled(model.id, true)}>启用</button>}
                <button className="button ghost" type="button" onClick={() => void removeModel(model)}>删除</button>
              </div>
            </div>
          ))}
          {selectedConnection && selectedModels.length === 0 && <div className="empty-inline">这个连接还没有添加模型。</div>}
        </div>
        {selectedConnection && <button className="text-button" type="button" onClick={() => setModelFormOpen((value) => !value)}>{modelFormOpen ? "收起手动添加" : "供应商未提供模型列表？手动添加"}</button>}
        {selectedConnection && modelFormOpen && (
          <form className="settings-form-panel form" onSubmit={saveModel}>
            <div className="form-panel-heading"><div><strong>{editingModelId ? "编辑模型" : "手动添加模型"}</strong><span>仅在供应商不支持自动同步时使用。</span></div><button className="button ghost" type="button" onClick={resetModelForm}>取消</button></div>
            <div className="form-grid">
              <label>模型 ID<input value={modelName} onChange={(event) => setModelName(event.target.value)} placeholder="例如 gpt-4o" required /></label>
              <label>显示名称<input value={modelDisplayName} onChange={(event) => setModelDisplayName(event.target.value)} placeholder="可选" /></label>
              <label className="checkbox-label"><input type="checkbox" checked={modelSupportsVision} onChange={(event) => setModelSupportsVision(event.target.checked)} />支持图片输入</label>
            </div>
            <button className="button" type="submit">{editingModelId ? "更新模型" : "添加模型"}</button>
          </form>
        )}
      </section>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading"><div><span className="eyebrow">03 / ROUTING</span><h2>题型默认模型</h2><p className="section-description">这里只展示已启用的模型。</p></div></div>
        <div className="routing-grid">
          {modes.map(([mode, label]) => (
            <div className="routing-row" key={mode}>
              <label>{label}<select value={defaults[mode]?.model_id || ""} onChange={(event) => event.target.value && void setDefault(mode, event.target.value)}><option value="">选择模型</option>{activeModels.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}</select></label>
              {(mode === "programming" || mode === "debug") && <label>输出语言<select value={defaults[mode]?.language || "python"} onChange={(event) => void setLanguage(mode, event.target.value)}><option value="python">Python</option><option value="java">Java</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="cpp">C++</option><option value="go">Go</option><option value="rust">Rust</option></select></label>}
            </div>
          ))}
        </div>
      </section>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading"><div><span className="eyebrow">04 / PROMPTS</span><h2>题型提示词</h2></div></div>
        <div className="form-actions">{modes.map(([mode, label]) => <button className={promptMode === mode ? "button" : "button secondary"} type="button" key={mode} onClick={() => void loadPrompt(mode)}>{label}</button>)}</div>
        <form className="form prompt-form" onSubmit={savePrompt}><label>{modes.find(([mode]) => mode === promptMode)?.[1]}提示词<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={10} required /></label><button className="button" type="submit">保存提示词</button></form>
      </section>
    </main>
  );
}
