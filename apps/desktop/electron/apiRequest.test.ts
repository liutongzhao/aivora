import { describe, expect, it, vi } from 'vitest'
import { buildRequestHeaders, fetchWithNetworkRetry } from './apiRequest'

describe('fetchWithNetworkRetry', () => {
  it('retries transient connection failures before returning a response', async () => {
    const response = new Response('{}', { status: 200 })
    const fetcher = vi.fn()
      .mockRejectedValueOnce(new TypeError('fetch failed'))
      .mockResolvedValueOnce(response)

    await expect(fetchWithNetworkRetry(fetcher, 'http://example.test/api/test', {}, 2, 0))
      .resolves.toBe(response)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('does not retry an HTTP error response', async () => {
    const response = new Response('{}', { status: 401 })
    const fetcher = vi.fn().mockResolvedValue(response)

    await expect(fetchWithNetworkRetry(fetcher, 'http://example.test/api/test', {}, 3, 0))
      .resolves.toBe(response)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })
})

describe('buildRequestHeaders', () => {
  it('preserves session headers supplied as a Headers instance', () => {
    const input = new Headers({ 'X-Session-Id': 'session-test' })

    const headers = buildRequestHeaders(input, {
      'X-Client-Version': '0.1.0',
      'X-Client-Type': 'electron',
    })

    expect(headers.get('X-Session-Id')).toBe('session-test')
    expect(headers.get('X-Client-Version')).toBe('0.1.0')
  })
})
