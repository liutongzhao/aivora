// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAIProcessing } from './useAIProcessing'

const listeners = new Map<string, (...args: any[]) => void>()
const { fetchUsageSummary, processScreenshotSSE } = vi.hoisted(() => ({
  fetchUsageSummary: vi.fn(),
  processScreenshotSSE: vi.fn(),
}))

vi.mock('../services/sseService', () => ({
  sseService: {
    onProcessingStatusUpdate: (fn: (...args: any[]) => void) => listeners.set('status', fn),
    offProcessingStatusUpdate: () => listeners.delete('status'),
    onContentUpdate: (fn: (...args: any[]) => void) => listeners.set('content', fn),
    offContentUpdate: () => listeners.delete('content'),
    onFieldUpdate: (fn: (...args: any[]) => void) => listeners.set('field', fn),
    offFieldUpdate: () => listeners.delete('field'),
    onProcessingComplete: (fn: (...args: any[]) => void) => listeners.set('complete', fn),
    offProcessingComplete: () => listeners.delete('complete'),
    onFinalResult: (fn: (...args: any[]) => void) => listeners.set('final', fn),
    offFinalResult: () => listeners.delete('final'),
    onError: (fn: (...args: any[]) => void) => listeners.set('error', fn),
    offError: () => listeners.delete('error'),
    disconnect: vi.fn(),
    connectToStream: vi.fn().mockResolvedValue({ success: true }),
  }
}))

vi.mock('../services/usageEntitlement', async () => {
  const actual = await vi.importActual<typeof import('../services/usageEntitlement')>(
    '../services/usageEntitlement',
  )
  return {
    ...actual,
    fetchUsageSummary,
  }
})

vi.mock('../services/aiService', () => ({
  aiService: {
    processScreenshotSSE,
    getProcessingStatus: vi.fn(),
    cancelProcessing: vi.fn().mockResolvedValue({ success: true }),
  },
}))

describe('useAIProcessing SSE results', () => {
  beforeEach(() => {
    listeners.clear()
    fetchUsageSummary.mockReset()
    processScreenshotSSE.mockReset()
  })

  it('accumulates appended chunks and replaces a snapshot', async () => {
    const { result } = renderHook(() => useAIProcessing())
    await act(async () => { await listeners.get('content')?.('{"answer":', true) })
    await act(async () => { await listeners.get('content')?.('"B"}', true) })
    expect(result.current.result?.content).toBe('{"answer":"B"}')
    await act(async () => { await listeners.get('content')?.('replacement', false) })
    expect(result.current.result?.content).toBe('replacement')
  })

  it('keeps parsed choice fields instead of placing raw JSON in formatted code', async () => {
    const { result } = renderHook(() => useAIProcessing())
    const raw = '{"answer":"B","explanation":"理由"}'
    await act(async () => {
      await listeners.get('final')?.({
        questionType: 'single_choice',
        content: raw,
        parsed: { answer: 'B', explanation: '理由' }
      })
    })
    expect(result.current.result?.parsed?.answer).toBe('B')
    expect(result.current.result?.formatted?.code).not.toBe(raw)
  })

  it('stops processing and exposes an error when SSE reports a failure', async () => {
    const { result } = renderHook(() => useAIProcessing())

    await act(async () => {
      await listeners.get('error')?.('实时连接超时，请检查网络后重试')
    })

    expect(result.current.isProcessing).toBe(false)
    expect(result.current.error?.message).toBe('实时连接超时，请检查网络后重试')
  })

  it('refreshes usage after a completed task', async () => {
    fetchUsageSummary.mockResolvedValue({
      trialTotal: 5,
      trialUsed: 1,
      trialRemaining: 4,
      entitlementActive: false,
      entitlementExpiresAt: null,
      entitlementStatus: null,
    })
    const { result } = renderHook(() => useAIProcessing())

    await act(async () => {
      await listeners.get('final')?.({
        questionType: 'universal',
        content: '答案',
      })
    })

    expect(fetchUsageSummary).toHaveBeenCalledTimes(1)
    expect(result.current.isProcessing).toBe(false)
  })

  it('refreshes usage after an SSE error', async () => {
    fetchUsageSummary.mockResolvedValue({
      trialTotal: 5,
      trialUsed: 1,
      trialRemaining: 4,
      entitlementActive: false,
      entitlementExpiresAt: null,
      entitlementStatus: null,
    })
    const { result } = renderHook(() => useAIProcessing())

    await act(async () => {
      await listeners.get('error')?.('服务异常')
    })
    expect(fetchUsageSummary).toHaveBeenCalledTimes(1)
  })

  it('refreshes usage after cancellation', async () => {
    fetchUsageSummary.mockResolvedValue({
      trialTotal: 5,
      trialUsed: 1,
      trialRemaining: 4,
      entitlementActive: false,
      entitlementExpiresAt: null,
      entitlementStatus: null,
    })
    processScreenshotSSE.mockResolvedValue({
      success: true,
      task_id: 'task-1',
      stream_token: 'stream-token',
    })
    const { result } = renderHook(() => useAIProcessing())

    await act(async () => {
      await result.current.processScreenshot('data:image/png;base64,test')
    })

    await act(async () => {
      await result.current.cancelProcessing()
    })
    expect(fetchUsageSummary).toHaveBeenCalledTimes(2)
  })

  it('does not submit a task when usage cannot be checked', async () => {
    fetchUsageSummary.mockRejectedValue(new Error('offline'))
    const { result } = renderHook(() => useAIProcessing())

    await act(async () => {
      await expect(
        result.current.processScreenshot('data:image/png;base64,test'),
      ).rejects.toMatchObject({ code: 'USAGE_CHECK_FAILED' })
    })

    expect(processScreenshotSSE).not.toHaveBeenCalled()
    expect(result.current.error).toMatchObject({
      code: 'USAGE_CHECK_FAILED',
    })
  })
})
