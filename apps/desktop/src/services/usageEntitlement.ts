import { apiFetch } from './apiClient'

export interface UsageSummary {
  trialTotal: number
  trialUsed: number
  trialRemaining: number
  entitlementActive: boolean
  entitlementExpiresAt: string | null
  entitlementStatus: string | null
}

export type UsageAvailabilityReason =
  | 'entitlement'
  | 'trial'
  | 'entitlement_expired'
  | 'trial_exhausted'

export interface UsageAvailability {
  allowed: boolean
  reason: UsageAvailabilityReason
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>('/api/account/usage')
}

export function getUsageAvailability(usage: UsageSummary): UsageAvailability {
  if (usage.entitlementActive) {
    return { allowed: true, reason: 'entitlement' }
  }

  if (usage.trialRemaining > 0) {
    return { allowed: true, reason: 'trial' }
  }

  if (usage.entitlementStatus === 'expired' || usage.entitlementStatus === 'active') {
    return { allowed: false, reason: 'entitlement_expired' }
  }

  return { allowed: false, reason: 'trial_exhausted' }
}

export function getUsageMessage(usage: UsageSummary): string {
  const availability = getUsageAvailability(usage)

  switch (availability.reason) {
    case 'entitlement':
      return usage.entitlementExpiresAt
        ? `会员有效期至 ${new Date(usage.entitlementExpiresAt).toLocaleDateString('zh-CN')}`
        : '会员授权有效'
    case 'trial':
      return `免费体验剩余 ${usage.trialRemaining} 次`
    case 'entitlement_expired':
      return '授权已过期，请激活新的授权码后继续使用'
    case 'trial_exhausted':
      return '免费体验次数已用完，请激活授权码后继续使用'
  }
}

export function getUsageErrorMessage(code?: string, fallback?: string): string {
  switch (code) {
    case 'TRIAL_EXHAUSTED':
      return '免费体验次数已用完，请激活授权码后继续使用'
    case 'ENTITLEMENT_EXPIRED':
      return '授权已过期，请激活新的授权码后继续使用'
    case 'EMAIL_NOT_VERIFIED':
      return '请先完成邮箱验证后再使用'
    case 'AUTH_REQUIRED':
    case 'UNAUTHORIZED':
      return '登录状态已失效，请重新登录'
    default:
      return fallback || '当前账号暂时无法使用，请检查账号权益'
  }
}
