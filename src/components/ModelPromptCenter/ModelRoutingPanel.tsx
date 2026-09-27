import { useEffect, useMemo, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { PromptMode, QuestionModelDefault, UserModel } from '../../types/userConfig'

const modes: Array<[PromptMode, string]> = [
  ['programming', '编程题'],
  ['single_choice', '单选题'],
  ['multiple_choice', '多选题'],
  ['universal', '通用题'],
  ['debug', '调试题'],
]

const languages = ['python', 'typescript', 'javascript', 'java', 'cpp', 'go', 'rust']

export function ModelRoutingPanel() {
  const [models, setModels] = useState<UserModel[]>([])
  const [defaults, setDefaults] = useState<Record<string, QuestionModelDefault>>({})
  const [enabledConnectionIds, setEnabledConnectionIds] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    Promise.all([
      userConfigService.listConnections(),
      userConfigService.listModels(),
      userConfigService.listDefaults(),
    ]).then(([connections, nextModels, nextDefaults]) => {
      setEnabledConnectionIds(new Set(connections.filter((connection) => connection.enabled).map((connection) => connection.id)))
      setModels(nextModels)
      setDefaults(Object.fromEntries(nextDefaults.map((item) => [item.mode, item])))
    }).catch((error) => setNotice(error instanceof Error ? error.message : '题型配置加载失败'))
  }, [])

  const selectableModels = useMemo(
    () => models.filter((model) => model.enabled && model.supports_vision && enabledConnectionIds.has(model.connection_id)),
    [enabledConnectionIds, models],
  )

  async function updateDefault(mode: PromptMode, modelId: string, language: string) {
    try {
      const updated = await userConfigService.setModelDefault(mode, modelId, language)
      setDefaults((current) => ({ ...current, [mode]: updated }))
      setNotice(`${modes.find(([key]) => key === mode)?.[1]}已保存`)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '题型配置保存失败')
    }
  }

  return (
    <section className="routing-panel">
      <div className="routing-header"><div><h2>题型分配</h2><p>为不同题型选择默认模型。</p></div>{notice && <span role="status">{notice}</span>}</div>
      <div className="routing-list">
        {modes.map(([mode, label]) => {
          const current = defaults[mode]
          const language = current?.language || 'python'
          return (
            <div className="routing-row" data-testid={`routing-${mode}`} key={mode}>
              <strong>{label}</strong>
              <select
                aria-label={`${label}模型`}
                value={current?.model_id || ''}
                onChange={(event) => void updateDefault(mode, event.target.value, language)}
              >
                <option value="">选择模型</option>
                {selectableModels.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}
              </select>
              {(mode === 'programming' || mode === 'debug') && (
                <select
                  aria-label={`${label}输出语言`}
                  value={language}
                  onChange={(event) => current?.model_id && void updateDefault(mode, current.model_id, event.target.value)}
                >
                  {languages.map((item) => <option key={item} value={item}>{item}</option>)}
                </select>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
