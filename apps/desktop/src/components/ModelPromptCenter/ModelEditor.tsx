import { useEffect, useState } from 'react'
import type { Connection, UserModel } from '../../types/userConfig'
import { userConfigService } from '../../services/userConfigService'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

interface ModelEditorProps {
  model: UserModel | null
  connectionId: string
  connection?: Connection
  onSaved: () => Promise<void> | void
  onClose: () => void
  onNotify?: (message: string, variant?: ClientToastVariant) => void
}

export function ModelEditor({ model, connectionId, connection, onSaved, onClose, onNotify }: ModelEditorProps) {
  const [name, setName] = useState(model?.name ?? '')
  const [displayName, setDisplayName] = useState(model?.display_name ?? '')
  const [connectionName, setConnectionName] = useState(connection?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(model?.name ?? '')
    setDisplayName(model?.display_name ?? '')
    setConnectionName(connection?.name ?? '')
    setBaseUrl(connection?.base_url ?? '')
    setApiKey('')
  }, [model, connection])

  async function save() {
    if (!name.trim() || !connectionId || (model && (!connectionName.trim() || !baseUrl.trim()))) return
    setSaving(true)
    setError(null)
    try {
      if (model) {
        await userConfigService.updateModel(model.id, { display_name: displayName.trim() || name.trim() })
        await userConfigService.updateConnection(connectionId, {
          name: connectionName.trim(),
          base_url: baseUrl.trim(),
          ...(apiKey.trim() ? { api_key: apiKey.trim(), replace_key: true } : {}),
        })
      } else {
        await userConfigService.createModel({
          connection_id: connectionId,
          name: name.trim(),
          display_name: displayName.trim() || name.trim(),
        })
      }
      await onSaved()
      onClose()
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '模型保存失败'
      setError(message)
      onNotify?.(message, 'error')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="model-editor" role="dialog" aria-label={model ? '编辑模型' : '添加模型'}>
      {error && !onNotify && <div className="model-inline-notice is-error" role="alert">{error}</div>}
      <div className="model-editor-grid">
        <label>模型 ID<input value={name} onChange={(event) => setName(event.target.value)} readOnly={Boolean(model)} aria-readonly={model ? 'true' : undefined} /></label>
        <label>
          显示名称
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
      </div>
      {model && <div className="model-editor-grid"><label>连接名称<input value={connectionName} onChange={(event) => setConnectionName(event.target.value)} /></label><label>API 地址<input type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label><label className="connection-editor-wide">API 密钥<input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="••••••••••（留空表示保留原密钥）" /></label></div>}
      <p className="model-inline-notice">请确认此模型可以识别图片。Aivora 不会自动保证供应商模型的图片能力。</p>
      <div className="model-editor-actions">
        <button type="button" className="client-button client-button-secondary" onClick={onClose}>取消</button>
        <button type="button" className="client-button client-button-primary" onClick={() => void save()} disabled={saving || !name.trim() || (Boolean(model) && (!connectionName.trim() || !baseUrl.trim()))}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
