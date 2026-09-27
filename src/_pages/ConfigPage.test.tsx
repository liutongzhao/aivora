// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigPage from './ConfigPage'

describe('ConfigPage overview', () => {
  beforeEach(() => {
    Object.assign(window, {
      electronAPI: {
        webAuthStatus: vi.fn().mockResolvedValue({
          user: { username: '测试用户' },
          version: { current: '1.0.0', latest: '1.0.0', needsUpdate: false }
        }),
        getShortcutBindings: vi.fn().mockResolvedValue({}),
        getClientTheme: vi.fn().mockResolvedValue({ theme: 'dark' }),
        onShortcutTestResult: vi.fn().mockReturnValue(() => {}),
        remoteControl: {
          onState: vi.fn().mockReturnValue(() => {})
        },
        windowControl: vi.fn(),
        openExamClient: vi.fn(),
        setClientTheme: vi.fn(),
        webAuthLogout: vi.fn().mockResolvedValue({ success: true })
      }
    })
  })

  it('keeps the overview focused on core actions without tutorial copy', async () => {
    render(<ConfigPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '测试用户' })).toBeTruthy()
    })
    expect(screen.getByRole('button', { name: /开始使用/ })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '手机远程控制' })).toBeTruthy()
    expect(screen.queryByText(/使用前可简单看一下常见快捷键/)).toBeNull()
    expect(screen.queryByRole('button', { name: '使用视频教程' })).toBeNull()
  })
})
