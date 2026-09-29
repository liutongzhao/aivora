import { apiFetch, ApiRequestError } from './apiClient'
import type {
  AIProcessResult,
  ProcessingOptions,
  ProcessingStatus,
  ProcessScreenshotRequest,
  TaskCreatedResponse,
  TaskMode,
  TaskResponse,
} from '../types/api'

export type {
  AIProcessResult,
  ProcessingOptions,
  ProcessingStatus,
  TaskMode,
}

export class AIService {
  async processScreenshotSSE(
    image: string | string[],
    mode: TaskMode = 'programming',
    options?: { language?: string; clientRequestId?: string },
  ): Promise<{
    success: boolean
    task_id?: string
    stream_token?: string
    error?: { code: string; message: string }
  }> {
    try {
      const request: ProcessScreenshotRequest = {
        mode,
        ...(options?.language ? { language: options.language } : {}),
        ...(options?.clientRequestId
          ? { client_request_id: options.clientRequestId }
          : {}),
        ...(Array.isArray(image) ? { images: image } : { image }),
      }
      const response = await apiFetch<TaskCreatedResponse>(
        '/api/ai/process-screenshot',
        {
          method: 'POST',
          body: JSON.stringify(request),
        },
      )

      return {
        success: response.success,
        task_id: response.task_id,
        stream_token: response.stream_token,
      }
    } catch (error) {
      return {
        success: false,
        error: this.toError(error, 'SSE处理请求失败'),
      }
    }
  }

  async getProcessingStatus(
    requestId: string,
  ): Promise<{
    success: boolean
    status?: ProcessingStatus
    error?: { code: string; message: string }
  }> {
    try {
      const response = await apiFetch<TaskResponse>(`/api/ai/tasks/${requestId}`)
      return {
        success: true,
        status: {
          requestId: response.id,
          status: this.toClientStatus(response.status),
          stage: response.stage,
          progress: response.progress,
          message: response.error_message || response.stage || '处理中',
          result: response.result || undefined,
          error: response.error_message
            ? {
                code: response.error_code || undefined,
                message: response.error_message,
              }
            : undefined,
        },
      }
    } catch (error) {
      return {
        success: false,
        error: this.toError(error, '获取状态失败'),
      }
    }
  }

  async cancelProcessing(
    requestId: string,
  ): Promise<{ success: boolean; error?: { code: string; message: string } }> {
    try {
      await apiFetch<{ success: boolean }>(`/api/ai/tasks/${requestId}`, {
        method: 'DELETE',
      })
      return { success: true }
    } catch (error) {
      if (error instanceof ApiRequestError && [400, 404].includes(error.status || 0)) {
        return { success: true }
      }
      return {
        success: false,
        error: this.toError(error, '取消请求失败'),
      }
    }
  }

  private toClientStatus(
    status: TaskResponse['status'],
  ): ProcessingStatus['status'] {
    if (status === 'completed') return 'completed'
    if (status === 'failed' || status === 'expired') return 'error'
    if (status === 'cancelled') return 'cancelled'
    return status === 'queued' ? 'queued' : 'processing'
  }

  private toError(
    error: unknown,
    fallback: string,
  ): { code: string; message: string } {
    if (error instanceof ApiRequestError) {
      return { code: error.code, message: error.message }
    }
    if (error instanceof Error) {
      return { code: 'UNKNOWN_ERROR', message: error.message }
    }
    return { code: 'UNKNOWN_ERROR', message: fallback }
  }
}

export const aiService = new AIService()
