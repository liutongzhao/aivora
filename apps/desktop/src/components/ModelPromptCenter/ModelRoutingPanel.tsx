import { useEffect, useMemo, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { PromptMode, QuestionModelDefault, UserModel, TrialModelInfo } from '../../types/userConfig'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

const modes: Array<[PromptMode, string]> = [
  ['programming', '编程题'],
  ['single_choice', '单选题'],
  ['multiple_choice', '多选题'],
  ['universal', '通用题'],
  ['debug', '调试题'],
]

const languages = ['python', 'typescript', 'javascript', 'java', 'cpp', 'go', 'rust']

export function ModelRoutingPanel({ onNotify }: { onNotify?: (message: string, variant?: ClientToastVariant) => void }) {
  const [models, setModels] = useState<UserModel[]>([])
  const [defaults, setDefaults] = useState<Record<string, QuestionModelDefault>>({})
  const [enabledConnectionIds, setEnabledConnectionIds] = useState<Set<string>>(new Set())
  const [trialModel, setTrialModel] = useState<TrialModelInfo | null>(null)

  useEffect(() => {
    Promise.all([
      userConfigService.listConnections(),
      userConfigService.listModels(),
      userConfigService.listDefaults(),
      userConfigService.getTrialModel(),
    ]).then(([connections, nextModels, nextDefaults, nextTrial]) => {
      setEnabledConnectionIds(new Set(connections.filter((connection) => connection.enabled).map((connection) => connection.id)))
      setModels(nextModels)
      setDefaults(Object.fromEntries(nextDefaults.map((item) => [item.mode, item])))
      setTrialModel(nextTrial)
    }).catch((error) => onNotify?.(error instanceof Error ? error.message : '题型配置加载失败', 'error'))
  }, [])

  const selectableModels = useMemo(
    () => models.filter((model) => model.enabled && enabledConnectionIds.has(model.connection_id)),
    [enabledConnectionIds, models],
  )

  async function updateDefault(mode: PromptMode, modelId: string, language: string) {
    const useTrial = modelId === '__trial__'
    if (!useTrial && !selectableModels.some((model) => model.id === modelId)) {
      onNotify?.('请选择可用模型，并确认该模型可以识别图片', 'warning')
      return
    }
    try {
      const updated = await userConfigService.setModelDefault(mode, useTrial ? null : modelId, language, useTrial)
      setDefaults((current) => ({ ...current, [mode]: updated }))
      onNotify?.(`${modes.find(([key]) => key === mode)?.[1]}已保存`, 'success')
    } catch (error) {
      onNotify?.(error instanceof Error ? error.message : '题型配置保存失败', 'error')
    }
  }

  return (
    <section className="routing-panel">
      <div className="routing-header">
        <div><h2>题型分配</h2><p>为不同题型指定默认模型与输出语言。</p></div>
      </div>
      {trialModel?.enabled && <div className="routing-trial-status" role="status"><strong>{trialModel.display_name}</strong><span>内置模型，剩余 {trialModel.trial_remaining} 次</span></div>}
      <div className="routing-table-head" aria-hidden="true">
        <span>题型</span><span>可用模型</span><span>输出语言</span><span>提示</span>
      </div>
      <div className="routing-list">
        {modes.map(([mode, label]) => {
          const current = defaults[mode]
          const invalid = Boolean(current?.model_id && !selectableModels.some((model) => model.id === current.model_id))
          const language = current?.language || 'python'
          return (
            <div className="routing-row" data-testid={`routing-${mode}`} key={mode}>
              <div className="routing-mode"><strong>{label}</strong><span>{mode.replace('_', ' ')}</span></div>
              <label className="routing-field"><span>模型</span><select
                  aria-label={`${label}模型`}
                  value={invalid ? '' : current?.use_trial_model ? '__trial__' : current?.model_id || ''}
                  onChange={(event) => void updateDefault(mode, event.target.value, language)}
                >
                  <option value="">{invalid ? '当前模型不可用，请重新选择' : '选择模型'}</option>
                  {trialModel?.enabled && <option value="__trial__">{trialModel.display_name}（内置，剩余 {trialModel.trial_remaining} 次）</option>}
                  {selectableModels.map((model) => <option key={model.id} value={model.id}>{model.display_name}</option>)}
                </select></label>
              {(mode === 'programming' || mode === 'debug') && (
                <label className="routing-field"><span>语言</span><select
                    aria-label={`${label}输出语言`}
                    value={language}
                    onChange={(event) => (current?.model_id || current?.use_trial_model) && void updateDefault(mode, current.use_trial_model ? '__trial__' : current.model_id!, event.target.value)}
                  >
                    {languages.map((item) => <option key={item} value={item}>{item}</option>)}
                  </select></label>
              )}
              {mode !== 'programming' && mode !== 'debug' && <span className="routing-empty">不适用</span>}
              <span className="routing-capability">需支持图片</span>
            </div>
          )
        })}
      </div>
    </section>
  )
}
