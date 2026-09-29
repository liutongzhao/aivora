import { useEffect, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { Connection, UserModel } from '../../types/userConfig'
import { ModelList } from './ModelList'
import { ModelRoutingPanel } from './ModelRoutingPanel'
import { PromptEditor } from './PromptEditor'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

const tabs = [
  ['models', '模型'],
  ['routing', '题型分配'],
  ['prompts', '提示词'],
] as const

export function ModelPromptCenter({ visible = true, onDirtyChange, onNotify }: {
  visible?: boolean
  onDirtyChange?: (dirty: boolean) => void
  onNotify?: (message: string, variant?: ClientToastVariant) => void
}) {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>('models')
  const [connections, setConnections] = useState<Connection[]>([])
  const [models, setModels] = useState<UserModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sessionExpired, setSessionExpired] = useState(false)
  const [promptDirty, setPromptDirty] = useState(false)

  async function refresh() {
    setLoading(true)
    try {
      const [nextConnections, nextModels] = await Promise.all([
        userConfigService.listConnections(),
        userConfigService.listModels(),
      ])
      setConnections(nextConnections)
      setModels(nextModels)
      setError(null)
      setSessionExpired(false)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '模型配置加载失败'
      setError(message)
      onNotify?.(message, 'error')
      setSessionExpired(typeof reason === 'object' && reason !== null && 'status' in reason && reason.status === 401)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (visible) void refresh() }, [visible])

  function changeTab(nextTab: typeof activeTab) {
    if (nextTab === activeTab) return
    if (activeTab === 'prompts' && promptDirty && !window.confirm('提示词尚未保存，确定放弃修改吗？')) return
    setPromptDirty(false)
    onDirtyChange?.(false)
    setActiveTab(nextTab)
  }

  function handlePromptDirty(dirty: boolean) {
    setPromptDirty(dirty)
    onDirtyChange?.(dirty)
  }

  return (
    <section className="model-prompt-center" aria-label="模型与提示词">
      <div className="model-prompt-tabs" role="tablist" aria-label="模型配置">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={activeTab === key ? 'is-active' : ''}
            key={key}
            onClick={() => changeTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && <div className="model-empty">加载中...</div>}
      {error && !onNotify && <div className="model-inline-notice is-error" role="alert">
        {error}
        {sessionExpired && <button type="button" className="client-button client-button-secondary" onClick={() => void window.electronAPI?.webAuthLogin?.()}>重新登录</button>}
      </div>}
      {!loading && !error && activeTab === 'models' && (
        <ModelList connections={connections} models={models} onRefresh={refresh} onNotify={onNotify} />
      )}
      {!loading && !error && activeTab === 'routing' && <ModelRoutingPanel onNotify={onNotify} />}
      {!loading && !error && activeTab === 'prompts' && <PromptEditor onDirtyChange={handlePromptDirty} onNotify={onNotify} />}
    </section>
  )
}

export default ModelPromptCenter
