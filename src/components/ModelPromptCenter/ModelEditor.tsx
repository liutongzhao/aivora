import { useEffect, useState } from 'react'
import type { UserModel } from '../../types/userConfig'
import { userConfigService } from '../../services/userConfigService'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

interface ModelEditorProps {
  model: UserModel | null
  connectionId: string
  onSaved: () => Promise<void> | void
  onClose: () => void
  onNotify?: (message: string, variant?: ClientToastVariant) => void
}

export function ModelEditor({ model, connectionId, onSaved, onClose, onNotify }: ModelEditorProps) {
  const [name, setName] = useState(model?.name ?? '')
  const [displayName, setDisplayName] = useState(model?.display_name ?? '')
  const [supportsVision, setSupportsVision] = useState(model?.supports_vision ?? false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setName(model?.name ?? '')
    setDisplayName(model?.display_name ?? '')
    setSupportsVision(model?.supports_vision ?? false)
  }, [model])

  async function save() {
    if (!name.trim() || !connectionId) return
    setSaving(true)
    setError(null)
    try {
      if (model) {
        await userConfigService.updateModel(model.id, {
          connection_id: connectionId,
          name: name.trim(),
          display_name: displayName.trim() || name.trim(),
          supports_vision: supportsVision,
        })
      } else {
        await userConfigService.createModel({
          connection_id: connectionId,
          name: name.trim(),
          display_name: displayName.trim() || name.trim(),
          supports_vision: supportsVision,
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
        <label>
          模型 ID
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          显示名称
          <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
        </label>
      </div>
      <label className="model-editor-checkbox">
        <input type="checkbox" checked={supportsVision} onChange={(event) => setSupportsVision(event.target.checked)} />
        <span><strong>支持图片输入</strong><small>勾选后可用于截图题型；这是能力声明，不会改变模型本身能力。</small></span>
      </label>
      <div className="model-protocol-row"><span>接口协议</span><strong>Chat Completions</strong></div>
      <div className="model-editor-actions">
        <button type="button" className="client-button client-button-secondary" onClick={onClose}>取消</button>
        <button type="button" className="client-button client-button-primary" onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
