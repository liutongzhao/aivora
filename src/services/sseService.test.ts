import { describe, expect, it, vi } from 'vitest'
import { SSEService } from './sseService'

class FakeEventSource extends EventTarget {
  static instances: FakeEventSource[] = []
  onmessage: ((event: MessageEvent) => void) | null = null
  onerror: ((event: Event) => void) | null = null
  onopen: ((event: Event) => void) | null = null

  constructor(readonly url: string) {
    super()
    FakeEventSource.instances.push(this)
  }

  close() {}

  send(data: Record<string, unknown>) {
    const event = new MessageEvent('message', { data: JSON.stringify(data) })
    this.onmessage?.(event)
    this.dispatchEvent(event)
  }
}

describe('SSEService', () => {
  it('delivers progress and completion for a second task after the first disconnects', async () => {
    FakeEventSource.instances = []
    vi.stubGlobal('EventSource', FakeEventSource)
    try {
      const service = new SSEService()
      const statuses: Array<{ requestId: string; status: string; progress: number }> = []
      service.onProcessingStatusUpdate(status => {
        statuses.push({
          requestId: status.requestId,
          status: status.status,
          progress: status.progress,
        })
      })

      for (const taskId of ['first', 'second']) {
        const connection = service.connectToStream(taskId, 'token')
        const source = FakeEventSource.instances.at(-1)!
        source.send({ type: 'connected', task_id: taskId })
        expect((await connection).success).toBe(true)
        source.send({ type: 'progress', task_id: taskId, stage: 'loading_images', progress: 10 })
        source.send({
          type: 'completed',
          task_id: taskId,
          data: { result: { questionType: 'single_choice', content: 'A' } },
        })
      }

      expect(statuses).toEqual([
        { requestId: 'first', status: 'processing', progress: 10 },
        { requestId: 'first', status: 'completed', progress: 100 },
        { requestId: 'second', status: 'processing', progress: 10 },
        { requestId: 'second', status: 'completed', progress: 100 },
      ])
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
