import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch, getApiBaseUrl } from './apiClient'

describe('apiFetch', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
    window.electronAPI = {
      webAuthStatus: vi.fn().mockResolvedValue({
        authenticated: true,
        sessionId: 'session-test',
      }),
    }
  })

  it('adds the desktop session and version headers to JSON requests', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true }), { status: 200 }),
      ),
    )

    await apiFetch('/api/test', {
      method: 'POST',
      body: JSON.stringify({ value: 1 }),
    })

    expect(fetch).toHaveBeenCalledWith(
      `${getApiBaseUrl()}/api/test`,
      expect.objectContaining({
        credentials: 'include',
        headers: expect.any(Headers),
      }),
    )
    const headers = (vi.mocked(fetch).mock.calls[0][1] as RequestInit)
      .headers as Headers
    expect(headers.get('X-Session-Id')).toBe('session-test')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Client-Type')).toBe('electron')
  })

  it('normalizes backend detail errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            detail: { code: 'SESSION_REQUIRED', message: '请先登录' },
          }),
          { status: 401 },
        ),
      ),
    )

    await expect(apiFetch('/api/session_status')).rejects.toMatchObject({
      code: 'SESSION_REQUIRED',
      message: '请先登录',
      status: 401,
    })
  })

  it('uses the Electron API bridge instead of a renderer cross-origin request', async () => {
    const webAuthStatus = vi.fn().mockResolvedValue({
      authenticated: true,
      sessionId: 'session-test',
    })
    const apiRequest = vi.fn().mockResolvedValue({
      status: 200,
      body: JSON.stringify({ ok: true }),
    })
    window.electronAPI = {
      webAuthStatus,
      apiRequest,
    }
    const rendererFetch = vi.fn()
    vi.stubGlobal('fetch', rendererFetch)

    await expect(apiFetch('/api/test')).resolves.toEqual({ ok: true })

    expect(apiRequest).toHaveBeenCalledWith(expect.objectContaining({
      path: '/api/test',
      method: 'GET',
    }))
    expect(webAuthStatus).not.toHaveBeenCalled()
    expect(rendererFetch).not.toHaveBeenCalled()
  })
})
