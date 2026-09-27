import { getVersionHeaders } from '../utils/version'
import { config } from '../utils/config'
import type { ApiError } from '../types/api'

export class ApiRequestError extends Error {
  readonly code: string
  readonly status?: number

  constructor(error: ApiError) {
    super(error.message)
    this.name = 'ApiRequestError'
    this.code = error.code
    this.status = error.status
  }
}

export function getApiBaseUrl(): string {
  return config.api.baseUrl.replace(/\/$/, '')
}

async function getSessionId(): Promise<string | null> {
  try {
    const status = await window.electronAPI?.webAuthStatus?.()
    return status?.authenticated && status.sessionId ? status.sessionId : null
  } catch {
    return null
  }
}

async function parseError(response: Response): Promise<ApiError> {
  const payload = await response.json().catch(() => null)
  const detail = payload?.detail
  const message =
    (typeof detail === 'string' ? detail : detail?.message) ||
    payload?.error?.message ||
    payload?.message ||
    `请求失败（HTTP ${response.status}）`

  return {
    code:
      (typeof detail === 'object' ? detail?.code : undefined) ||
      payload?.error?.code ||
      `HTTP_${response.status}`,
    message,
    status: response.status,
  }
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const sessionId = await getSessionId()
  const headers = new Headers(init.headers)

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  if (sessionId) {
    headers.set('X-Session-Id', sessionId)
  }
  for (const [key, value] of Object.entries(getVersionHeaders())) {
    headers.set(key, value)
  }

  const response = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  })

  if (!response.ok) {
    throw new ApiRequestError(await parseError(response))
  }

  if (response.status === 204) {
    return undefined as T
  }

  return response.json() as Promise<T>
}
