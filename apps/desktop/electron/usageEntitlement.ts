import { buildRequestHeaders, fetchWithNetworkRetry } from './apiRequest'

export interface UsageSummary {
  trialTotal: number
  trialUsed: number
  trialRemaining: number
  entitlementActive: boolean
  entitlementExpiresAt: string | null
  entitlementStatus: string | null
  accountStatus?: string | null
}

export type UsageAccessReason =
  | 'entitlement'
  | 'trial'
  | 'entitlement_expired'
  | 'trial_exhausted'
  | 'account_ineligible'
  | 'usage_check_failed'
  | 'auth_required'

export interface UsageAccess {
  allowed: boolean
  reason: UsageAccessReason
  message?: string
}

type UsageFetcher = (path: string) => Promise<UsageSummary>

function getApiBaseUrl(): string {
  try {
    // Keep tests and unpackaged diagnostics usable when runtime config is absent.
    // Production builds still read the same bundled config file.
    const configData = require('./runtimeConfig').default
    return configData.api?.baseUrl || 'http://127.0.0.1:18000'
  } catch {
    return 'http://127.0.0.1:18000'
  }
}

export function getUsageAccess(usage: UsageSummary): UsageAccess {
  if (usage.accountStatus && usage.accountStatus !== 'active') {
    return {
      allowed: false,
      reason: 'account_ineligible',
      message: '账号已被停用，请联系管理员',
    }
  }

  if (usage.entitlementActive) {
    return { allowed: true, reason: 'entitlement' }
  }
  if (usage.trialRemaining > 0) {
    return { allowed: true, reason: 'trial' }
  }
  if (usage.entitlementStatus === 'expired' || usage.entitlementStatus === 'active') {
    return {
      allowed: false,
      reason: 'entitlement_expired',
      message: '授权已过期，请激活新的授权码后继续使用',
    }
  }
  return {
    allowed: false,
    reason: 'trial_exhausted',
    message: '免费体验次数已用完，请激活授权码后继续使用',
  }
}

export async function fetchUsageAccess(
  fetcher: UsageFetcher = fetchUsageSummary,
): Promise<UsageAccess> {
  try {
    const usage = await fetcher('/api/account/usage')
    return getUsageAccess(usage)
  } catch (error) {
    const code = error instanceof Error && 'code' in error
      ? String((error as Error & { code?: unknown }).code)
      : ''
    const message = error instanceof Error ? error.message : ''
    if (code === 'AUTH_REQUIRED' || code === 'HTTP_401' || message === 'AUTH_REQUIRED') {
      return {
        allowed: false,
        reason: 'auth_required',
        message: '请先登录后再使用',
      }
    }
    return {
      allowed: false,
      reason: 'usage_check_failed',
      message: '暂时无法确认账号使用权限，请检查网络后重试',
    }
  }
}

export async function fetchUsageSummary(path: string): Promise<UsageSummary> {
  const { simpleAuthManager } = require('./SimpleAuthManager') as typeof import('./SimpleAuthManager')
  const sessionId = simpleAuthManager.getToken()
  if (!sessionId) {
    throw new Error('AUTH_REQUIRED')
  }
  const headers = buildRequestHeaders(
    { 'X-Session-Id': sessionId, 'Content-Type': 'application/json' },
    {
      'X-Client-Type': 'electron',
      'X-Client-Platform': process.platform,
    },
  )
  const response = await fetchWithNetworkRetry(
    fetch,
    `${getApiBaseUrl()}${path}`,
    { headers },
  )
  if (!response.ok) {
    throw Object.assign(new Error(`HTTP_${response.status}`), {
      code: `HTTP_${response.status}`,
      status: response.status,
    })
  }
  return response.json() as Promise<UsageSummary>
}
