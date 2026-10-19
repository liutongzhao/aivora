import { useEffect, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { Connection } from '../../types/userConfig'
import { ConnectionEditor } from './ConnectionEditor'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

export function ConnectionSettings({ onNotify, onConfigChanged }: { onNotify?: (message: string, variant?: ClientToastVariant) => void; onConfigChanged?: () => Promise<void> | void }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [editing, setEditing] = useState<Connection | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupName, setSetupName] = useState('')
  const [setupUrl, setSetupUrl] = useState('')
  const [setupKey, setSetupKey] = useState('')
  const [setupModels, setSetupModels] = useState<string[]>([])
  const [setupModel, setSetupModel] = useState('')
  const [setupBusy, setSetupBusy] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      setConnections(await userConfigService.listConnections())
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '连接加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function discoverModels() {
    setSetupBusy(true)
    try {
      const result = await userConfigService.testNewConnection({ base_url: setupUrl.trim(), api_key: setupKey.trim() })
      setSetupModels(result.models)
      setSetupModel(result.models[0] ?? '')
      onNotify?.(`已发现 ${result.models.length} 个模型，请选择一个模型保存`, 'success')
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '获取模型失败，请检查地址和 API Key', 'error')
    } finally {
      setSetupBusy(false)
    }
  }

  async function saveModel() {
    if (!setupName.trim() || !setupUrl.trim() || !setupKey.trim() || !setupModel) return
    setSetupBusy(true)
    try {
      await userConfigService.setupModel({
        connection_name: setupName.trim(),
        base_url: setupUrl.trim(),
        api_key: setupKey.trim(),
        model_name: setupModel,
        display_name: setupModel,
      })
      setSetupOpen(false)
      setSetupModels([])
      setSetupModel('')
      setSetupKey('')
      await refresh()
      await onConfigChanged?.()
      onNotify?.('模型已添加；题型默认模型未改变', 'success')
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '模型保存失败', 'error')
    } finally {
      setSetupBusy(false)
    }
  }

  async function testConnection(connection: Connection) {
    try {
      const models = await userConfigService.syncConnection(connection.id)
      onNotify?.(`连接正常，发现 ${models.length} 个模型`, 'success')
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '连接测试失败', 'error')
    }
  }

  async function toggleConnection(connection: Connection) {
    try {
      if (connection.enabled) {
        await userConfigService.disableConnection(connection.id)
      } else {
        await userConfigService.updateConnection(connection.id, { enabled: true })
      }
      await refresh()
      await onConfigChanged?.()
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '连接状态更新失败', 'error')
    }
  }

  async function deleteConnection(connection: Connection) {
    if (!window.confirm(`删除连接「${connection.name}」？该连接下的模型也会被删除。`)) return
    try {
      await userConfigService.deleteConnection(connection.id)
      onNotify?.('连接已删除', 'success')
      await refresh()
      await onConfigChanged?.()
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '删除连接失败', 'error')
    }
  }

  return (
    <section className="connection-settings-panel">
      <div className="connection-panel-heading">
        <div><h2>模型连接</h2><p>输入 URL 和 API Key 获取模型。请确认所选模型可以识别图片。</p></div>
        <button type="button" className="client-button client-button-primary" onClick={() => setSetupOpen(true)}>添加模型</button>
      </div>
      {setupOpen && <div className="connection-editor" role="dialog" aria-label="添加模型">
        <div className="connection-editor-grid">
          <label>连接名称<input aria-label="连接名称" value={setupName} onChange={(event) => setSetupName(event.target.value)} /></label>
          <label>API 地址<input aria-label="API 地址" type="url" value={setupUrl} onChange={(event) => setSetupUrl(event.target.value)} /></label>
          <label className="connection-editor-wide">API 密钥<input aria-label="API 密钥" type="password" value={setupKey} onChange={(event) => setSetupKey(event.target.value)} /></label>
        </div>
        <p className="model-inline-notice">请添加可以识别图片的模型。Aivora 不会自动保证供应商模型具备图片识别能力，识别不了截图的模型无法使用。</p>
        {setupModels.length > 0 && <label>选择模型<select aria-label="选择模型" value={setupModel} onChange={(event) => setSetupModel(event.target.value)}><option value="">请选择</option>{setupModels.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}
        <div className="model-editor-actions">
          <button type="button" className="client-button client-button-secondary" onClick={() => setSetupOpen(false)}>取消</button>
          <button type="button" className="client-button client-button-secondary" onClick={() => void discoverModels()} disabled={setupBusy || !setupUrl || !setupKey}>{setupBusy ? '获取中...' : '获取模型'}</button>
          <button type="button" className="client-button client-button-primary" onClick={() => void saveModel()} disabled={setupBusy || !setupName || !setupModel}>{setupBusy ? '保存中...' : '保存模型'}</button>
        </div>
      </div>}
      {loading && <div className="model-empty">加载中...</div>}
      {!loading && connections.length === 0 && <div className="model-empty">暂无连接，请先添加模型。</div>}
      {!loading && connections.map((connection) => (
        <div className="connection-row" key={connection.id}>
          <div><strong>{connection.name}</strong><small>{connection.base_url}</small></div>
          <span className={connection.enabled ? 'model-state is-enabled' : 'model-state'}>
            {connection.enabled ? '已启用' : '已停用'} · <span>{connection.key_configured === false ? '未配置密钥' : '密钥已配置'}</span>
          </span>
          <div className="connection-row-actions">
            <button type="button" className="client-button client-button-secondary" onClick={() => void testConnection(connection)}>测试连接</button>
            <button type="button" className="client-button client-button-secondary" onClick={() => setEditing(connection)}>编辑</button>
            <button type="button" className="client-button client-button-secondary" aria-label={connection.enabled ? '停用连接' : '启用连接'} onClick={() => void toggleConnection(connection)}>{connection.enabled ? '停用' : '启用'}</button>
            <button type="button" className="client-button client-button-secondary" aria-label={`删除连接 ${connection.name}`} onClick={() => void deleteConnection(connection)}>删除</button>
          </div>
        </div>
      ))}
      {editing !== undefined && <ConnectionEditor key={editing?.id ?? 'new'} connection={editing} onSaved={async () => { await refresh(); await onConfigChanged?.() }} onClose={() => setEditing(undefined)} onNotify={onNotify} />}
    </section>
  )
}
