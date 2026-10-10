import { describe, expect, it, vi } from 'vitest'
import {
  fetchUsageAccess,
  getUsageAccess,
  type UsageSummary,
} from './usageEntitlement'

const baseUsage: UsageSummary = {
  trialTotal: 5,
  trialUsed: 0,
  trialRemaining: 5,
  entitlementActive: false,
  entitlementExpiresAt: null,
  entitlementStatus: null,
}

describe('electron usage entitlement', () => {
  it('allows an active entitlement even when trial uses are exhausted', () => {
    expect(getUsageAccess({
      ...baseUsage,
      trialRemaining: 0,
      entitlementActive: true,
      entitlementStatus: 'active',
    })).toEqual({ allowed: true, reason: 'entitlement' })
  })

  it('blocks exhausted trial uses with an actionable message', () => {
    expect(getUsageAccess({ ...baseUsage, trialRemaining: 0 })).toEqual({
      allowed: false,
      reason: 'trial_exhausted',
      message: '免费体验次数已用完，请激活授权码后继续使用',
    })
  })

  it('blocks expired authorization before screenshot capture', () => {
    expect(getUsageAccess({
      ...baseUsage,
      trialRemaining: 0,
      entitlementStatus: 'expired',
    })).toEqual({
      allowed: false,
      reason: 'entitlement_expired',
      message: '授权已过期，请激活新的授权码后继续使用',
    })
  })

  it('blocks an inactive account before screenshot capture', () => {
    expect(getUsageAccess({
      ...baseUsage,
      accountStatus: 'disabled',
    })).toEqual({
      allowed: false,
      reason: 'account_ineligible',
      message: '账号已被停用，请联系管理员',
    })
  })

  it('fails closed when the usage request cannot be completed', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(fetchUsageAccess(fetcher)).resolves.toEqual({
      allowed: false,
      reason: 'usage_check_failed',
      message: '暂时无法确认账号使用权限，请检查网络后重试',
    })
    expect(fetcher).toHaveBeenCalledWith('/api/account/usage')
  })

  it('returns a login prompt when the session is missing or expired', async () => {
    await expect(
      fetchUsageAccess(vi.fn().mockRejectedValue(new Error('AUTH_REQUIRED'))),
    ).resolves.toEqual({
      allowed: false,
      reason: 'auth_required',
      message: '请先登录后再使用',
    })

    await expect(
      fetchUsageAccess(
        vi.fn().mockRejectedValue(
          Object.assign(new Error('HTTP_401'), { code: 'HTTP_401' }),
        ),
      ),
    ).resolves.toEqual({
      allowed: false,
      reason: 'auth_required',
      message: '请先登录后再使用',
    })
  })
})
