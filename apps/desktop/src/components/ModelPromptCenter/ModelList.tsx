import { useEffect, useRef, useState } from 'react'
import type { UserModel } from '../../types/userConfig'
import { userConfigService } from '../../services/userConfigService'
import type { ModelListProps } from './modelPromptTypes'
import { ModelEditor } from './ModelEditor'

export function ModelList({ connections, models, trialModel, onRefresh, onNotify }: ModelListProps) {
  const [selectedModelId, setSelectedModelId] = useState(models[0]?.id ?? '')
  const [setupOpen, setSetupOpen] = useState(false)
  const [setupName, setSetupName] = useState('')
  const [setupUrl, setSetupUrl] = useState('')
  const [setupKey, setSetupKey] = useState('')
  const [setupModels, setSetupModels] = useState<string[]>([])
  const [setupModel, setSetupModel] = useState('')
  const [busy, setBusy] = useState(false)
  const [editingModel, setEditingModel] = useState<UserModel | null>(null)
  const selectedModel = models.find((model) => model.id === selectedModelId) ?? models[0] ?? null
  const discoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!models.some((model) => model.id === selectedModelId)) setSelectedModelId(models[0]?.id ?? '')
  }, [models, selectedModelId])

  async function discoverModels() {
    if (!setupUrl.trim() || !setupKey.trim()) return
    setBusy(true)
    try {
      const result = await userConfigService.testNewConnection({ base_url: setupUrl.trim(), api_key: setupKey.trim() })
      setSetupModels(result.models)
      setSetupModel(result.models[0] ?? '')
      onNotify?.(`已发现 ${result.models.length} 个模型，请选择一个模型保存`, 'success')
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : '获取模型失败，请检查地址和 API Key', 'error')
    } finally { setBusy(false) }
  }

  useEffect(() => {
    if (!setupOpen || !setupUrl.trim() || setupKey.trim().length < 8) return
    if (discoverTimer.current) clearTimeout(discoverTimer.current)
    discoverTimer.current = setTimeout(() => void discoverModels(), 500)
    return () => { if (discoverTimer.current) clearTimeout(discoverTimer.current) }
  }, [setupOpen, setupUrl, setupKey])

  async function saveSetupModel() {
    if (!setupName.trim() || !setupUrl.trim() || !setupKey.trim() || !setupModel) return
    setBusy(true)
    try {
      await userConfigService.setupModel({ connection_name: setupName.trim(), base_url: setupUrl.trim(), api_key: setupKey.trim(), model_name: setupModel, display_name: setupModel })
      setSetupOpen(false)
      setSetupName(''); setSetupUrl(''); setSetupKey(''); setSetupModels([]); setSetupModel('')
      await onRefresh?.()
      onNotify?.('模型已添加；题型默认模型未改变', 'success')
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : '模型保存失败', 'error')
    } finally { setBusy(false) }
  }

  async function testModel(target = selectedModel) {
    if (!target) return
    setBusy(true)
    try { await userConfigService.testModel(target.id); onNotify?.('模型调用测试成功', 'success') }
    catch (error) { onNotify?.(error instanceof Error ? error.message : '模型测试失败', 'error') }
    finally { setBusy(false) }
  }

  async function testTrialModel() {
    setBusy(true)
    try { await userConfigService.testTrialModel(); onNotify?.('内置模型调用测试成功，未消耗次数', 'success') }
    catch (error) { onNotify?.(error instanceof Error ? error.message : '内置模型测试失败', 'error') }
    finally { setBusy(false) }
  }

  async function toggleModel(target = selectedModel) {
    if (!target) return
    setBusy(true)
    try {
      if (target.enabled) await userConfigService.disableModel(target.id)
      else await userConfigService.updateModel(target.id, { enabled: true })
      await onRefresh?.()
      onNotify?.(target.enabled ? '模型已停用' : '模型已启用', 'success')
    } catch (error) { onNotify?.(error instanceof Error ? error.message : '模型状态更新失败', 'error') }
    finally { setBusy(false) }
  }

  async function deleteModel(model: UserModel) {
    if (!window.confirm(`删除模型「${model.display_name}」？删除后需要重新添加才能使用。`)) return
    setBusy(true)
    try {
      await userConfigService.disableModel(model.id)
      await onRefresh?.()
      onNotify?.('模型已删除', 'success')
    } catch (error) { onNotify?.(error instanceof Error ? error.message : '模型删除失败', 'error') }
    finally { setBusy(false) }
  }

  return (
    <section className="model-workspace" aria-label="模型列表">
      <div className="model-toolbar">
        <div><h2>模型</h2><p className="model-toolbar-hint">按模型维护，可直接查看和管理当前可用模型。</p></div>
        <button type="button" className="client-button client-button-primary" onClick={() => setSetupOpen(true)}>添加模型</button>
      </div>
      <div className="model-table-wrap"><table className="model-table"><thead><tr><th>模型</th><th>模型 ID</th><th>连接</th><th>状态</th><th>操作</th></tr></thead><tbody>
        {trialModel?.enabled && <tr className="model-table-trial"><td><strong>{trialModel.display_name}</strong><small>系统内置</small></td><td>{trialModel.model_name}</td><td>系统内置</td><td><span className="model-state is-enabled">剩余 {trialModel.trial_remaining} 次</span></td><td><div className="model-table-actions"><button type="button" className="client-button client-button-secondary" onClick={() => void testTrialModel()} disabled={busy}>测试</button><span className="model-table-muted">不可编辑</span></div></td></tr>}
        {models.map((model) => <tr key={model.id}><td><strong>{model.display_name}</strong><small>需支持图片识别</small></td><td>{model.name}</td><td>{connections.find((connection) => connection.id === model.connection_id)?.name ?? '未知连接'}</td><td><span className={model.enabled ? 'model-state is-enabled' : 'model-state'}>{model.enabled ? '已启用' : '已停用'}</span></td><td><div className="model-table-actions"><button type="button" className="client-button client-button-secondary" onClick={() => void testModel(model)} disabled={busy || !model.enabled}>测试</button><button type="button" className="client-button client-button-secondary" onClick={() => setEditingModel(model)}>编辑</button><button type="button" className="client-button client-button-secondary" onClick={() => void toggleModel(model)} disabled={busy}>{model.enabled ? '停用' : '启用'}</button><button type="button" className="client-button client-button-danger" onClick={() => void deleteModel(model)} disabled={busy}>删除</button></div></td></tr>)}
        {models.length === 0 && !trialModel?.enabled && <tr><td colSpan={5} className="model-table-empty">还没有模型，请添加一个模型。</td></tr>}
      </tbody></table></div>
      {setupOpen && <div className="connection-editor" role="dialog" aria-label="添加模型">
        <div className="connection-panel-heading"><div><h2>添加模型</h2><p>输入连接信息，获取模型后选择一个添加。</p></div><button type="button" className="client-button client-button-secondary" onClick={() => setSetupOpen(false)}>取消</button></div>
        <div className="connection-editor-grid"><label>连接名称<input aria-label="连接名称" value={setupName} onChange={(event) => setSetupName(event.target.value)} /></label><label>API 地址<input aria-label="API 地址" type="url" value={setupUrl} onChange={(event) => setSetupUrl(event.target.value)} /></label><label className="connection-editor-wide">API 密钥<div className="model-key-control"><input aria-label="API 密钥" type="password" value={setupKey} onChange={(event) => { setSetupKey(event.target.value); setSetupModels([]); setSetupModel('') }} /><button type="button" className="client-button client-button-secondary" onClick={() => void discoverModels()} disabled={busy || !setupUrl || setupKey.length < 8}>{busy ? '获取中...' : '获取模型'}</button></div></label></div>
        <p className="model-inline-notice">请确认所选模型可以识别图片。</p>
        <div className="model-editor-actions model-save-actions">{setupModels.length > 0 && <label className="model-select-field">选择模型<select className="model-select" aria-label="选择模型" value={setupModel} onChange={(event) => setSetupModel(event.target.value)}>{setupModels.map((name) => <option key={name} value={name}>{name}</option>)}</select></label>}<button type="button" className="client-button client-button-primary" onClick={() => void saveSetupModel()} disabled={busy || !setupName || !setupModel}>保存模型</button></div>
      </div>}
      {editingModel && <ModelEditor model={editingModel} connectionId={editingModel.connection_id} connection={connections.find((item) => item.id === editingModel.connection_id)} onSaved={async () => { await onRefresh?.(); setEditingModel(null) }} onClose={() => setEditingModel(null)} onNotify={onNotify} />}
    </section>
  )
}
