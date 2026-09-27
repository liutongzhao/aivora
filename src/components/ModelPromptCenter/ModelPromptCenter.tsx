import { useEffect, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { Connection, UserModel } from '../../types/userConfig'
import { ModelList } from './ModelList'
import { ModelRoutingPanel } from './ModelRoutingPanel'
import { PromptEditor } from './PromptEditor'

const tabs = [
  ['models', '模型'],
  ['routing', '题型分配'],
  ['prompts', '提示词'],
] as const

export function ModelPromptCenter() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number][0]>('models')
  const [connections, setConnections] = useState<Connection[]>([])
  const [models, setModels] = useState<UserModel[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '模型配置加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  return (
    <section className="model-prompt-center" aria-label="模型与提示词">
      <h2 className="model-prompt-title">模型</h2>
      <div className="model-prompt-tabs" role="tablist" aria-label="模型配置">
        {tabs.map(([key, label]) => (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === key}
            className={activeTab === key ? 'is-active' : ''}
            key={key}
            onClick={() => setActiveTab(key)}
          >
            {label}
          </button>
        ))}
      </div>
      {loading && <div className="model-empty">加载中...</div>}
      {error && <div className="model-inline-notice is-error" role="alert">{error}</div>}
      {!loading && !error && activeTab === 'models' && (
        <ModelList connections={connections} models={models} onRefresh={refresh} />
      )}
      {!loading && !error && activeTab === 'routing' && <ModelRoutingPanel />}
      {!loading && !error && activeTab === 'prompts' && <PromptEditor />}
    </section>
  )
}

export default ModelPromptCenter
