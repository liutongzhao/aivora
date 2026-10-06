import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AIService } from './aiService'

describe('AIService', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.electronAPI = {
      webAuthStatus: vi.fn().mockResolvedValue({
        authenticated: true,
        sessionId: 'session-test',
      }),
    }
  })

  it('sends multiple screenshots as an images array', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            task_id: 'task-1',
            stream_token: 'stream-1',
          }),
          { status: 200 },
        ),
      ),
    )

    const result = await new AIService().processScreenshotSSE(
      ['image-a', 'image-b'],
      'programming',
    )

    expect(result.task_id).toBe('task-1')
    const request = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    )
    expect(request).toEqual({
      mode: 'programming',
      images: ['image-a', 'image-b'],
    })
    expect(request.image).toBeUndefined()
  })

  it('sends debug screenshots and the configured language', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            success: true,
            task_id: 'debug-task',
            stream_token: 'debug-stream',
          }),
          { status: 200 },
        ),
      ),
    )

    await new AIService().processScreenshotSSE(
      ['debug-image-a', 'debug-image-b'],
      'debug',
      { language: 'java' },
    )

    const request = JSON.parse(
      String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body),
    )
    expect(request).toEqual({
      mode: 'debug',
      language: 'java',
      images: ['debug-image-a', 'debug-image-b'],
    })
  })

  it('maps terminal backend statuses to the renderer status contract', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            id: 'task-1',
            mode: 'programming',
            status: 'failed',
            stage: 'error',
            progress: 40,
            error_code: 'MODEL_FAILED',
            error_message: '模型调用失败',
            created_at: '2026-09-27T00:00:00Z',
            completed_at: null,
            result: null,
          }),
          { status: 200 },
        ),
      ),
    )

    const response = await new AIService().getProcessingStatus('task-1')

    expect(response.status?.status).toBe('error')
    expect(response.status?.error).toEqual({
      code: 'MODEL_FAILED',
      message: '模型调用失败',
    })
  })
})
