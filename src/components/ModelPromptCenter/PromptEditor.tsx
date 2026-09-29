import { useEffect, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { PromptMode, PromptVersion } from '../../types/userConfig'

const modes: Array<[PromptMode, string]> = [
  ['programming', '编程题'],
  ['single_choice', '单选题'],
  ['multiple_choice', '多选题'],
  ['universal', '通用题'],
  ['debug', '调试题'],
]

export function PromptEditor({ onDirtyChange }: { onDirtyChange?: (dirty: boolean) => void }) {
  const [mode, setMode] = useState<PromptMode>('programming')
  const [prompt, setPrompt] = useState('')
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [savedVersion, setSavedVersion] = useState<number | null>(null)
  const [savedContent, setSavedContent] = useState('')
  const [pendingMode, setPendingMode] = useState<PromptMode | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load(modeToLoad: PromptMode) {
    setLoading(true)
    try {
      const nextVersions = await userConfigService.listPromptVersions(modeToLoad)
      setVersions(nextVersions)
      setPrompt(nextVersions[0]?.content ?? '')
      setSavedContent(nextVersions[0]?.content ?? '')
      setSavedVersion(nextVersions[0]?.version ?? null)
      setError(null)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load(mode) }, [mode])

  const currentVersion = versions[0]?.version
  const dirty = prompt !== savedContent
  useEffect(() => { onDirtyChange?.(dirty) }, [dirty, onDirtyChange])

  function selectMode(nextMode: PromptMode) {
    if (nextMode === mode) return
    if (dirty) {
      setPendingMode(nextMode)
      return
    }
    setMode(nextMode)
  }

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const saved = await userConfigService.savePrompt(mode, prompt)
      setVersions((current) => [saved, ...current])
      setSavedVersion(saved.version)
      setSavedContent(saved.content)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '提示词保存失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="prompt-editor-panel">
      <div className="prompt-mode-tabs" role="tablist" aria-label="提示词题型">
        {modes.map(([key, label]) => <button type="button" role="tab" key={key} onClick={() => selectMode(key)} aria-selected={mode === key}>{label}</button>)}
      </div>
      <div className="prompt-editor-toolbar">
        <div><h2>提示词</h2><span>{currentVersion ? `当前版本 v${currentVersion}` : '尚未保存'}</span></div>
        <button type="button" className="client-button client-button-primary" aria-label="保存提示词" onClick={() => void save()} disabled={loading || saving}>{saving ? '保存中...' : '保存'}</button>
      </div>
      {error && <div className="model-inline-notice is-error" role="alert">{error}</div>}
      <textarea aria-label="提示词内容" value={prompt} onChange={(event) => setPrompt(event.target.value)} rows={14} disabled={loading || saving} />
      {savedVersion !== null && <span className="prompt-saved-state">已保存 v{savedVersion}</span>}
      {versions.length > 1 && <div className="prompt-version-list" aria-label="历史版本">
        {versions.slice(1).map((version) => (
          <button type="button" className="client-button client-button-secondary" key={version.id} onClick={() => setPrompt(version.content)} disabled={saving}>
            恢复 v{version.version}
          </button>
        ))}
      </div>}
      {pendingMode && (
        <div className="prompt-unsaved-dialog" role="dialog" aria-label="未保存修改">
          <strong>未保存修改</strong>
          <p>切换题型前要处理当前内容。</p>
          <div>
            <button type="button" className="client-button client-button-secondary" onClick={() => setPendingMode(null)}>继续编辑</button>
            <button type="button" className="client-button client-button-danger" aria-label="放弃修改" onClick={() => { const next = pendingMode; setPendingMode(null); setMode(next) }}>放弃修改</button>
          </div>
        </div>
      )}
    </section>
  )
}
