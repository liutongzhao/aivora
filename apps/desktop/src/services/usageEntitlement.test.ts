import { describe, expect, it } from 'vitest'
import {
  getUsageAvailability,
  getUsageMessage,
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

describe('usage entitlement', () => {
  it('allows an account with an active entitlement', () => {
    const usage = {
      ...baseUsage,
      trialRemaining: 0,
      entitlementActive: true,
      entitlementExpiresAt: '2027-01-01T00:00:00Z',
      entitlementStatus: 'active',
    }

    expect(getUsageAvailability(usage)).toEqual({
      allowed: true,
      reason: 'entitlement',
    })
  })

  it('allows an account with remaining trial uses', () => {
    expect(getUsageAvailability(baseUsage)).toEqual({
      allowed: true,
      reason: 'trial',
    })
    expect(getUsageMessage(baseUsage)).toBe('免费体验剩余 5 次')
  })

  it('blocks exhausted and expired accounts with actionable messages', () => {
    expect(getUsageAvailability({ ...baseUsage, trialRemaining: 0 })).toEqual({
      allowed: false,
      reason: 'trial_exhausted',
    })
    expect(getUsageMessage({ ...baseUsage, trialRemaining: 0 })).toBe(
      '免费体验次数已用完，请激活授权码后继续使用',
    )

    expect(
      getUsageAvailability({
        ...baseUsage,
        trialRemaining: 0,
        entitlementStatus: 'active',
      }),
    ).toEqual({
      allowed: false,
      reason: 'entitlement_expired',
    })
    expect(
      getUsageMessage({
        ...baseUsage,
        trialRemaining: 0,
        entitlementStatus: 'expired',
      }),
    ).toBe('授权已过期，请激活新的授权码后继续使用')
  })
})
