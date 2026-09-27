export type PromptMode =
  | 'programming'
  | 'single_choice'
  | 'multiple_choice'
  | 'universal'
  | 'debug'

export interface Connection {
  id: string
  name: string
  base_url: string
  enabled: boolean
  key_configured?: boolean
}

export interface UserModel {
  id: string
  connection_id: string
  name: string
  display_name: string
  supports_vision: boolean
  enabled: boolean
}

export interface QuestionModelDefault {
  mode: PromptMode
  model_id: string
  language: string
}

export interface PromptVersion {
  id: string
  user_id?: string
  mode: PromptMode
  version: number
  content: string
  enabled: boolean
  created_at?: string
}

export interface ConnectionTestResult {
  success: boolean
  models: string[]
  message?: string
}

export interface ModelMutation {
  connection_id?: string
  name?: string
  display_name?: string
  supports_vision?: boolean
  enabled?: boolean
}

export interface ConnectionMutation {
  name?: string
  base_url?: string
  api_key?: string
  enabled?: boolean
  replace_key?: boolean
}
