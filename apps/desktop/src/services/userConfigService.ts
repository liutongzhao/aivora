import { apiFetch } from './apiClient'
import type {
  Connection,
  ConnectionMutation,
  ConnectionTestResult,
  ModelMutation,
  PromptMode,
  PromptVersion,
  QuestionModelDefault,
  UserModel,
  ModelSetupResult,
  TrialModelInfo,
} from '../types/userConfig'

const userPath = (path: string) => `/api/user${path}`

export const userConfigService = {
  listConnections(): Promise<Connection[]> {
    return apiFetch<Connection[]>(userPath('/connections'))
  },

  createConnection(payload: Required<Pick<ConnectionMutation, 'name' | 'base_url' | 'api_key'>>): Promise<Connection> {
    return apiFetch<Connection>(userPath('/connections'), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateConnection(connectionId: string, payload: ConnectionMutation): Promise<Connection> {
    return apiFetch<Connection>(userPath(`/connections/${connectionId}`), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  deleteConnection(connectionId: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(userPath(`/connections/${connectionId}`), {
      method: 'DELETE',
    })
  },

  disableConnection(connectionId: string): Promise<Connection> {
    return this.updateConnection(connectionId, { enabled: false })
  },

  testNewConnection(payload: { base_url: string; api_key: string }): Promise<ConnectionTestResult> {
    return apiFetch<ConnectionTestResult>(userPath('/connections/test'), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  setupModel(payload: { connection_name: string; base_url: string; api_key: string; model_name: string; display_name?: string }): Promise<ModelSetupResult> {
    return apiFetch<ModelSetupResult>(userPath('/models/setup'), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  syncConnection(connectionId: string): Promise<string[]> {
    return apiFetch<ConnectionTestResult>(userPath(`/connections/${connectionId}/test`), {
      method: 'POST',
    }).then((result) => result.models)
  },

  listModels(): Promise<UserModel[]> {
    return apiFetch<UserModel[]>(userPath('/models'))
  },

  createModel(payload: Required<Pick<ModelMutation, 'connection_id' | 'name' | 'display_name'>> & Pick<ModelMutation, 'supports_vision'>): Promise<UserModel> {
    return apiFetch<UserModel>(userPath('/models'), {
      method: 'POST',
      body: JSON.stringify(payload),
    })
  },

  updateModel(modelId: string, payload: ModelMutation): Promise<UserModel> {
    return apiFetch<UserModel>(userPath(`/models/${modelId}`), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    })
  },

  testModel(modelId: string): Promise<{ success: boolean; message?: string }> {
    return apiFetch<{ success: boolean; message?: string }>(userPath(`/models/${modelId}/test`), {
      method: 'POST',
    })
  },

  disableModel(modelId: string): Promise<{ success: boolean }> {
    return apiFetch<{ success: boolean }>(userPath(`/models/${modelId}`), {
      method: 'DELETE',
    })
  },

  listDefaults(): Promise<QuestionModelDefault[]> {
    return apiFetch<QuestionModelDefault[]>(userPath('/models/defaults'))
  },

  getTrialModel(): Promise<TrialModelInfo> {
    return apiFetch<TrialModelInfo>(userPath('/trial-model'))
  },

  testTrialModel(): Promise<{ success: boolean; message?: string }> {
    return apiFetch<{ success: boolean; message?: string }>(userPath('/trial-model/test'), { method: 'POST' })
  },

  setModelDefault(mode: PromptMode, modelId: string | null, language = 'python', useTrialModel = false): Promise<QuestionModelDefault> {
    const payload = useTrialModel
      ? { use_trial_model: true, language }
      : { model_id: modelId, use_trial_model: false, language }
    return apiFetch<QuestionModelDefault>(userPath(`/models/defaults/${mode}`), {
      method: 'PUT',
      body: JSON.stringify(payload),
    })
  },

  listPromptVersions(mode: PromptMode): Promise<PromptVersion[]> {
    return apiFetch<PromptVersion[]>(userPath(`/prompts/${mode}`))
  },

  savePrompt(mode: PromptMode, content: string): Promise<PromptVersion> {
    return apiFetch<PromptVersion>(userPath(`/prompts/${mode}`), {
      method: 'POST',
      body: JSON.stringify({ content }),
    })
  },
}
