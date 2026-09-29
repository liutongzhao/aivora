// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useAIProcessing } from './useAIProcessing'

const listeners = new Map<string, (...args: any[]) => void>()

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
    disconnect: vi.fn()
  }
}))

describe('useAIProcessing SSE results', () => {
  beforeEach(() => listeners.clear())

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
})
