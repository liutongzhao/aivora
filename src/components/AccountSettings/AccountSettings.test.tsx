// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { AccountSettings } from './AccountSettings'

describe('AccountSettings', () => {
  it('shows account and version actions with logout state', async () => {
    const logout = vi.fn().mockResolvedValue({ success: true })
    Object.assign(window, {
      electronAPI: {
        webAuthLogout: logout,
      },
    })
    render(<AccountSettings user={{ username: '测试用户', email: 'test@example.com' }} version={{ current: '1.0.0', latest: '1.0.0', needsUpdate: false }} />)
    expect(screen.getByText('测试用户')).toBeTruthy()
    expect(screen.getByText('1.0.0')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '退出登录' }))
    await waitFor(() => expect(logout).toHaveBeenCalled())
  })
})
