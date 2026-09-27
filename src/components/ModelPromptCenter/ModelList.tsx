import { useMemo, useState } from 'react'
import type { Connection, UserModel } from '../../types/userConfig'
import { userConfigService } from '../../services/userConfigService'
import { ModelEditor } from './ModelEditor'
import type { ModelListProps } from './modelPromptTypes'

export function ModelList({ connections, models, onRefresh }: ModelListProps) {
  const enabledConnections = useMemo(() => connections.filter((connection) => connection.enabled), [connections])
  const [selectedConnection, setSelectedConnection] = useState(enabledConnections[0]?.id ?? '')
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? '')
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([])
  const [editingModel, setEditingModel] = useState<UserModel | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  const selectedModels = models.filter((model) => model.connection_id === selectedConnection)
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? selectedModels[0] ?? null
  const importedNames = new Set(selectedModels.map((model) => model.name))

  async function syncModels() {
    if (!selectedConnection) return
    setBusy(true)
    try {
      setDiscoveredModels(await userConfigService.syncConnection(selectedConnection))
      setNotice('模型列表已同步')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模型同步失败')
    } finally {
      setBusy(false)
    }
  }

  async function addDiscoveredModel(name: string) {
    if (!selectedConnection) return
    setBusy(true)
    try {
      await userConfigService.createModel({
        connection_id: selectedConnection,
        name,
        display_name: name,
        supports_vision: true,
      })
      setDiscoveredModels((current) => current.filter((item) => item !== name))
      await onRefresh?.()
      setNotice(`${name} 已添加`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '添加模型失败')
    } finally {
      setBusy(false)
    }
  }

  async function testModel() {
    if (!selectedModel) return
    setBusy(true)
    try {
      await userConfigService.testModel(selectedModel.id)
      setNotice('模型调用测试成功')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模型测试失败')
    } finally {
      setBusy(false)
    }
  }

  async function disableModel() {
    if (!selectedModel) return
    setBusy(true)
    try {
      await userConfigService.disableModel(selectedModel.id)
      await onRefresh?.()
      setNotice('模型已停用')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '模型停用失败')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="model-workspace">
      <div className="model-toolbar">
        <label className="model-connection-select">
          连接
          <select value={selectedConnection} onChange={(event) => setSelectedConnection(event.target.value)}>
            {enabledConnections.map((connection) => <option key={connection.id} value={connection.id}>{connection.name}</option>)}
          </select>
        </label>
        <div className="model-toolbar-actions">
          <button type="button" className="client-button client-button-secondary" onClick={() => void syncModels()} disabled={busy || !selectedConnection}>
            {busy ? '处理中...' : '同步模型'}
          </button>
          <button type="button" className="client-button client-button-primary" onClick={() => { setEditingModel(null); setEditorOpen(true) }} disabled={!selectedConnection}>
            添加模型
          </button>
        </div>
      </div>

      {notice && <div className="model-inline-notice" role="status">{notice}</div>}

      <div className="model-workspace-grid">
        <div className="model-list-pane">
          <div className="model-pane-heading"><span>我的模型</span><span>{selectedModels.length}</span></div>
          {selectedModels.map((model) => (
            <button
              type="button"
              key={model.id}
              className={`model-list-row ${selectedModel?.id === model.id ? 'is-selected' : ''}`}
              onClick={() => setSelectedModelId(model.id)}
            >
              <span>
                <strong>{model.display_name}</strong>
                <small>{model.name}</small>
              </span>
              <span className={model.enabled ? 'model-state is-enabled' : 'model-state'}>{model.enabled ? '启用' : '停用'}</span>
            </button>
          ))}
          {selectedModels.length === 0 && <div className="model-empty">暂无模型</div>}
          {discoveredModels.length > 0 && (
            <div className="discovered-models">
              <div className="model-pane-heading"><span>发现的模型</span><span>{discoveredModels.length}</span></div>
              {discoveredModels.map((name) => (
                <div className="discovered-model-row" key={name}>
                  <span>{name}</span>
                  <button type="button" className="client-icon-text-button" aria-label={`添加 ${name}`} onClick={() => void addDiscoveredModel(name)} disabled={importedNames.has(name) || busy}>
                    {importedNames.has(name) ? '已添加' : '添加'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="model-detail-pane">
          {selectedModel ? (
            <>
              <div className="model-detail-heading">
                <div>
                  <p className="client-eyebrow">MODEL</p>
                  <h3>{selectedModel.display_name}</h3>
                </div>
                <span className={selectedModel.enabled ? 'model-state is-enabled' : 'model-state'}>{selectedModel.enabled ? '已启用' : '已停用'}</span>
              </div>
              <dl className="model-detail-list">
                <div><dt>模型 ID</dt><dd>{selectedModel.name}</dd></div>
                <div><dt>图片输入</dt><dd>{selectedModel.supports_vision ? '支持' : '不支持'}</dd></div>
                <div><dt>连接</dt><dd>{connections.find((connection) => connection.id === selectedModel.connection_id)?.name ?? '未知连接'}</dd></div>
              </dl>
              <div className="model-detail-actions">
                <button type="button" className="client-button client-button-secondary" aria-label="测试模型" onClick={() => void testModel()} disabled={busy || !selectedModel.enabled}>测试</button>
                <button type="button" className="client-button client-button-secondary" onClick={() => { setEditingModel(selectedModel); setEditorOpen(true) }}>编辑</button>
                <button type="button" className="client-button client-button-danger" aria-label="停用模型" onClick={() => void disableModel()} disabled={busy || !selectedModel.enabled}>停用</button>
              </div>
            </>
          ) : <div className="model-empty">选择一个模型查看详情</div>}
        </div>
      </div>

      {editorOpen && selectedConnection && (
        <ModelEditor
          model={editingModel}
          connectionId={selectedConnection}
          onSaved={async () => { await onRefresh?.() }}
          onClose={() => setEditorOpen(false)}
        />
      )}
    </section>
  )
}
