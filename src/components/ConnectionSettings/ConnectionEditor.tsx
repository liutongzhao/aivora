import { useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { Connection } from '../../types/userConfig'

interface ConnectionEditorProps {
  connection?: Connection | null
  onSaved: () => Promise<void> | void
  onClose: () => void
}

export function ConnectionEditor({ connection, onSaved, onClose }: ConnectionEditorProps) {
  const [name, setName] = useState(connection?.name ?? '')
  const [baseUrl, setBaseUrl] = useState(connection?.base_url ?? '')
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    if (!name.trim() || !baseUrl.trim() || (!connection && !apiKey.trim())) return
    setSaving(true)
    setError(null)
    try {
      if (connection) {
        await userConfigService.updateConnection(connection.id, {
          name: name.trim(),
          base_url: baseUrl.trim(),
          ...(apiKey.trim() ? { api_key: apiKey.trim(), replace_key: true } : {}),
        })
      } else {
        await userConfigService.createConnection({
          name: name.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
        })
      }
      await onSaved()
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '连接保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="connection-editor" role="dialog" aria-label={connection ? '编辑连接' : '新增连接'}>
      {error && <div className="model-inline-notice is-error" role="alert">{error}</div>}
      <div className="connection-editor-grid">
        <label>连接名称<input aria-label="连接名称" value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>API 地址<input aria-label="API 地址" type="url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} /></label>
        <label className="connection-editor-wide">API 密钥<input aria-label="API 密钥" type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder={connection ? '留空表示保留原密钥' : ''} /></label>
      </div>
      <div className="model-editor-actions">
        <button type="button" className="client-button client-button-secondary" onClick={onClose}>取消</button>
        <button type="button" className="client-button client-button-primary" onClick={() => void save()} disabled={saving || !name.trim() || !baseUrl.trim() || (!connection && !apiKey.trim())}>
          {saving ? '保存中...' : '保存连接'}
        </button>
      </div>
    </div>
  )
}
