export type TaskMode =
  | 'programming'
  | 'debug'
  | 'single_choice'
  | 'multiple_choice'
  | 'universal'

export type BackendTaskStatus =
  | 'created'
  | 'queued'
  | 'processing'
  | 'streaming'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'expired'

export interface ProcessingOptions {
  forceQuestionType?: Exclude<TaskMode, 'debug'>
  preferredLanguage?: string
  urgencyLevel?: 'normal' | 'fast'
}

export interface ParsedAnswer {
  question_type?: string
  question?: string
  options?: Record<string, string> | string[]
  answer?: string
  answers?: string[]
  explanation?: string
  warnings?: string[] | string
  raw?: string
  code?: string
  thoughts?: string[]
  timeComplexity?: string
  spaceComplexity?: string
  time_complexity?: string
  space_complexity?: string
  analysis?: string
  reasoning?: string
}

export interface AIProcessResult {
  questionType?: TaskMode
  content?: string
  rawContent?: string
  confidence?: number
  model?: string
  language?: string
  processingTime?: number
  creditsUsed?: number
  mode?: string
  type?: string
  stage?: string
  isFormatted?: boolean
  formatted?: {
    code: string
    thoughts: string[]
    timeComplexity: string
    spaceComplexity: string
  }
  parsed?: ParsedAnswer
  parseWarning?: string
  timestamp?: number
}

export type ProcessScreenshotRequest = {
  mode: TaskMode
  language?: string
  client_request_id?: string
} & (
  | { image: string; images?: never }
  | { images: string[]; image?: never }
)

export interface TaskCreatedResponse {
  success: boolean
  task_id: string
  stream_token: string
}

export interface TaskResponse {
  id: string
  mode: TaskMode
  status: BackendTaskStatus
  stage: string
  progress: number
  error_code: string | null
  error_message: string | null
  created_at: string
  completed_at: string | null
  result: AIProcessResult | null
}

export interface ProcessingStatus {
  requestId: string
  status: 'queued' | 'processing' | 'completed' | 'error' | 'cancelled'
  stage: string
  progress: number
  message: string
  estimatedTime?: number
  result?: AIProcessResult
  error?: {
    code?: string
    message: string
  } | null
}

export type TaskSSEEvent =
  | {
      type: 'connected'
      task_id: string
    }
  | {
      type: 'progress'
      task_id: string
      stage?: string
      progress?: number
      message?: string
      streamingStarted?: boolean
      partialContent?: string | null
      isComplete?: boolean
    }
  | {
      type: 'content'
      task_id?: string
      content?: string
      append?: boolean
    }
  | {
      type: 'code_delta' | 'explanation_delta'
      task_id?: string
      field?: string
      delta?: string
    }
  | {
      type: 'answer_set'
      task_id?: string
      field?: string
      value?: string | string[]
    }
  | {
      type: 'completed'
      task_id: string
      stage?: string
      data?: {
        result?: AIProcessResult
      }
      result?: AIProcessResult
      questionType?: TaskMode
      content?: string
      rawContent?: string
      parsed?: ParsedAnswer
      parseWarning?: string | null
    }
  | {
      type: 'error'
      task_id?: string
      stage?: string
      message?: string
      data?: {
        code?: string
        message?: string
      }
    }
  | {
      type: 'cancelled'
      task_id?: string
      stage?: string
      message?: string
      data?: {
        message?: string
      }
    }

export interface NormalizedTaskSSEEvent {
  type: TaskSSEEvent['type']
  task_id?: string
  stage?: string
  progress?: number
  message?: string
  content?: string
  append?: boolean
  partialContent?: string | null
  streamingStarted?: boolean
  isComplete?: boolean
  questionType?: TaskMode
  rawContent?: string
  parsed?: ParsedAnswer
  parseWarning?: string | null
  result?: AIProcessResult
  data?: {
    code?: string
    message?: string
    result?: AIProcessResult
    [key: string]: unknown
  }
  field?: string
  delta?: string
  value?: string | string[]
}

export type ApiError = {
  code: string
  message: string
  status?: number
}
