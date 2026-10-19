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
type TrialModelInfo = { enabled: boolean; display_name: string; model_name: string; trial_total: number; trial_used: number; trial_remaining: number };

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
  const [defaults, setDefaults] = useState<Record<string, { model_id: string | null; use_trial_model?: boolean; language: string }>>({});
  const [promptMode, setPromptMode] = useState<(typeof modes)[number][0]>("programming");
  const [prompt, setPrompt] = useState("");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [trialModel, setTrialModel] = useState<TrialModelInfo | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [setupName, setSetupName] = useState("");
  const [setupUrl, setSetupUrl] = useState("");
  const [setupKey, setSetupKey] = useState("");
  const [setupModels, setSetupModels] = useState<string[]>([]);
  const [setupModel, setSetupModel] = useState("");
  const [setupBusy, setSetupBusy] = useState(false);

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
    const [nextConnections, nextModels, nextDefaults, nextTrialModel] = await Promise.all([
      apiFetch<Connection[]>("/api/user/connections"),
      apiFetch<UserModel[]>("/api/user/models"),
      apiFetch<{ mode: string; model_id: string | null; use_trial_model?: boolean; language: string }[]>("/api/user/models/defaults"),
      apiFetch<TrialModelInfo>("/api/user/trial-model").catch(() => null),
    ]);
    setConnections(nextConnections);
    setModels(nextModels);
    setDefaults(Object.fromEntries(nextDefaults.map((item) => [item.mode, { model_id: item.model_id, use_trial_model: item.use_trial_model, language: item.language }])));
    setTrialModel(nextTrialModel);
    setSelectedConnection((current) => (
      nextConnections.some((connection) => connection.id === current && connection.enabled)
        ? current
        : nextConnections.find((connection) => connection.enabled)?.id ?? ""
    ));
  }

  async function discoverSetupModels() {
    setSetupBusy(true);
    try {
      const result = await apiFetch<{ models: string[] }>("/api/user/connections/test", {
        method: "POST",
        body: JSON.stringify({ base_url: setupUrl, api_key: setupKey }),
      });
      setSetupModels(result.models);
      setSetupModel(result.models[0] ?? "");
      notify("success", `已发现 ${result.models.length} 个模型，请选择一个模型保存`);
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "获取模型失败，请检查地址和 API Key");
    } finally {
      setSetupBusy(false);
    }
  }

  async function saveSetupModel(event: React.FormEvent) {
    event.preventDefault();
    if (!setupModel) return;
    setSetupBusy(true);
    try {
      await apiFetch("/api/user/models/setup", {
        method: "POST",
        body: JSON.stringify({
          connection_name: setupName,
          base_url: setupUrl,
          api_key: setupKey,
          model_name: setupModel,
          display_name: setupModel,
        }),
      });
      notify("success", "模型已添加；题型默认模型未改变");
      setSetupOpen(false);
      setSetupModels([]);
      setSetupModel("");
      setSetupKey("");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "模型保存失败");
    } finally {
      setSetupBusy(false);
    }
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

  async function deleteConnection(connection: Connection) {
    if (!window.confirm(`删除连接「${connection.name}」？该连接下的模型也会被删除。`)) return;
    try {
      await apiFetch(`/api/user/connections/${connection.id}`, { method: "DELETE" });
      notify("success", "连接已删除");
      await refresh();
    } catch (error) {
      notify("error", error instanceof Error ? error.message : "删除连接失败");
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

  async function testBuiltinModel() {
    try {
      setSyncing(true);
      await apiFetch("/api/user/trial-model/test", { method: "POST" });
      notify("success", "内置模型调用测试成功，未消耗次数");
    } catch (error) { notify("error", error instanceof Error ? error.message : "内置模型测试失败"); }
    finally { setSyncing(false); }
  }

  async function setDefault(mode: string, modelId: string) {
    try {
      const payload = modelId === "__trial__"
        ? {
            use_trial_model: true,
            language: defaults[mode]?.language || (mode === "programming" || mode === "debug" ? "python" : ""),
          }
        : {
            model_id: modelId || null,
            use_trial_model: false,
            language: defaults[mode]?.language || (mode === "programming" || mode === "debug" ? "python" : ""),
          };
      await apiFetch(`/api/user/models/defaults/${mode}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      setDefaults((current) => ({
        ...current,
        [mode]: {
          model_id: modelId === "__trial__" ? null : modelId,
          use_trial_model: modelId === "__trial__",
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
    if (!current?.model_id && !current?.use_trial_model) return;
    try {
      await apiFetch(`/api/user/models/defaults/${mode}`, {
        method: "PUT",
      body: JSON.stringify({ model_id: current.model_id, use_trial_model: current.use_trial_model, language }),
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
          <h1>模型设置</h1>
        </div>
        <div className="settings-security"><span>●</span> 密钥加密保存</div>
      </div>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading">
          <div><h2>我的模型</h2><p className="section-description">添加模型只会增加可用选项，不会自动改变题型默认模型。</p></div>
          <button className="button" type="button" onClick={() => setSetupOpen(true)}>添加模型</button>
        </div>
        <div className="settings-table model-table">
          <div className="settings-table-head"><span>模型</span><span>连接</span><span>状态</span><span>操作</span></div>
          {trialModel?.enabled && <div className="settings-table-row"><strong>{trialModel.display_name}<small className="table-subline">系统内置 · 免费体验</small></strong><span>{trialModel.model_name}</span><span className="status-text status-success">剩余 {trialModel.trial_remaining} 次</span><span><button className="button secondary" type="button" onClick={() => void testBuiltinModel()} disabled={syncing}>测试</button><small className="table-subline">不可编辑</small></span></div>}
          {models.map((model) => (
            <div className="settings-table-row" key={model.id}>
              <strong>{model.display_name}</strong>
              <span>{connections.find((connection) => connection.id === model.connection_id)?.name ?? "未知连接"}<small className="table-subline">{model.name}</small></span>
              <span className={model.enabled ? "status-text status-success" : "status-text"}>{model.enabled ? "已启用" : "已停用"}</span>
              <div className="form-actions">
                <button className="button secondary" type="button" onClick={() => void testModel(model)} disabled={syncing || !model.enabled}>测试</button>
                {model.enabled
                  ? <button className="button ghost" type="button" onClick={() => void disableModel(model.id)}>停用</button>
                  : <button className="button secondary" type="button" onClick={() => void setModelEnabled(model.id, true)}>启用</button>}
                <button className="button ghost" type="button" onClick={() => void removeModel(model)}>删除</button>
              </div>
            </div>
          ))}
          {models.length === 0 && <div className="empty-inline">还没有模型。添加一个支持图片识别的模型后即可在题型配置中使用。</div>}
        </div>
        <p className="settings-warning">请添加可以识别图片的模型。Aivora 不会自动保证供应商模型具备图片识别能力；如果模型无法读取截图，任务将无法正常处理。</p>
        {setupOpen && <form className="settings-form-panel form" onSubmit={saveSetupModel}>
          <div className="form-panel-heading"><div><strong>添加模型</strong><span>输入连接信息后获取模型列表，再选择一个模型保存。</span></div><button className="button ghost" type="button" onClick={() => setSetupOpen(false)}>取消</button></div>
          <div className="form-grid">
            <label>连接名称<input value={setupName} onChange={(event) => setSetupName(event.target.value)} placeholder="例如我的 OpenAI" required /></label>
            <label>API 地址<input type="url" value={setupUrl} onChange={(event) => setSetupUrl(event.target.value)} placeholder="https://api.example.com/v1" required /></label>
            <label className="form-grid-wide">API 密钥<input type="password" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} required /></label>
          </div>
          <div className="form-actions"><button className="button secondary" type="button" onClick={() => void discoverSetupModels()} disabled={setupBusy || !setupUrl || !setupKey}>{setupBusy ? "获取中…" : "获取模型"}</button>{setupModels.length > 0 && <label className="setup-model-select">选择模型<select value={setupModel} onChange={(event) => setSetupModel(event.target.value)} required><option value="">请选择</option>{setupModels.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}<button className="button" type="submit" disabled={setupBusy || !setupName || !setupModel}>{setupBusy ? "保存中…" : "保存模型"}</button></div>
        </form>}
      </section>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading"><div><h2>题型默认模型</h2><p className="section-description">系统内置模型可直接使用；当前剩余 {trialModel?.trial_remaining ?? 0} 次体验。</p></div></div>
        <div className="routing-grid">
          {modes.map(([mode, label]) => (
            <div className="routing-row" key={mode}>
              <label>{label}<select value={defaults[mode]?.use_trial_model ? "__trial__" : defaults[mode]?.model_id || ""} onChange={(event) => event.target.value && void setDefault(mode, event.target.value)}><option value="">选择模型</option>{trialModel?.enabled && <option value="__trial__">{trialModel.display_name}（内置，剩余 {trialModel.trial_remaining} 次）</option>}{activeModels.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}</select></label>
              {(mode === "programming" || mode === "debug") && <label>输出语言<select value={defaults[mode]?.language || "python"} onChange={(event) => void setLanguage(mode, event.target.value)}><option value="python">Python</option><option value="java">Java</option><option value="javascript">JavaScript</option><option value="typescript">TypeScript</option><option value="cpp">C++</option><option value="go">Go</option><option value="rust">Rust</option></select></label>}
            </div>
          ))}
        </div>
      </section>

      <section className="card settings-card settings-card-wide">
        <div className="section-heading"><div><h2>题型提示词</h2></div></div>
        <div className="form-actions">{modes.map(([mode, label]) => <button className={promptMode === mode ? "button" : "button secondary"} type="button" key={mode} onClick={() => void loadPrompt(mode)}>{label}</button>)}</div>
        <form className="form prompt-form" onSubmit={savePrompt}><label>{modes.find(([mode]) => mode === promptMode)?.[1]}提示词<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={10} required /></label><button className="button" type="submit">保存提示词</button></form>
      </section>
    </main>
  );
}
