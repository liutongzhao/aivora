import { useEffect, useState } from 'react'
import type { UserModel } from '../../types/userConfig'
import { userConfigService } from '../../services/userConfigService'

interface ModelEditorProps {
  model: UserModel | null
  connectionId: string
  onSaved: () => Promise<void> | void
  onClose: () => void
}

export function ModelEditor({ model, connectionId, onSaved, onClose }: ModelEditorProps) {
  const [name, setName] = useState(model?.name ?? '')
  const [displayName, setDisplayName] = useState(model?.display_name ?? '')
  const [supportsVision, setSupportsVision] = useState(model?.supports_vision ?? true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    setName(model?.name ?? '')
    setDisplayName(model?.display_name ?? '')
    setSupportsVision(model?.supports_vision ?? true)
  }, [model])

  async function save() {
    if (!name.trim() || !connectionId) return
    setSaving(true)
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
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="model-editor" role="dialog" aria-label={model ? '编辑模型' : '添加模型'}>
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
        支持图片输入
      </label>
      <div className="model-editor-actions">
        <button type="button" className="client-button client-button-secondary" onClick={onClose}>取消</button>
        <button type="button" className="client-button client-button-primary" onClick={() => void save()} disabled={saving || !name.trim()}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </div>
  )
}
