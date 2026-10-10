import { apiFetch } from './apiClient'

export interface UsageSummary {
  trialTotal: number
  trialUsed: number
  trialRemaining: number
  entitlementActive: boolean
  entitlementExpiresAt: string | null
  entitlementStatus: string | null
  accountStatus?: string | null
}

export type UsageAvailabilityReason =
  | 'entitlement'
  | 'trial'
  | 'entitlement_expired'
  | 'trial_exhausted'
  | 'account_ineligible'
  | 'usage_check_failed'
  | 'auth_required'

export interface UsageAvailability {
  allowed: boolean
  reason: UsageAvailabilityReason
}

export async function fetchUsageSummary(): Promise<UsageSummary> {
  return apiFetch<UsageSummary>('/api/account/usage')
}

export function getUsageAvailability(usage: UsageSummary): UsageAvailability {
  if (usage.accountStatus && usage.accountStatus !== 'active') {
    return { allowed: false, reason: 'account_ineligible' }
  }

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
    case 'account_ineligible':
      return '账号已被停用，请联系管理员'
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
    case 'SESSION_REQUIRED':
      return '登录状态已失效，请重新登录'
    case 'ACCOUNT_NOT_ELIGIBLE':
      return '账号已被停用，请联系管理员'
    case 'USAGE_CHECK_FAILED':
      return '暂时无法确认账号使用权限，请检查网络后重试'
    default:
      return fallback || '当前账号暂时无法使用，请检查账号权益'
  }
}
