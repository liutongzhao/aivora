// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
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
    expect(screen.getByText('客户端服务正常')).toBeTruthy()
    expect(screen.queryByText(/使用前可简单看一下常见快捷键/)).toBeNull()
    expect(screen.queryByRole('button', { name: '使用视频教程' })).toBeNull()
    expect(screen.getByRole('main').querySelector('header[data-client-page="overview"]')?.textContent).not.toContain('退出登录')
    fireEvent.click(screen.getByRole('button', { name: '连接' }))
    expect(screen.getByRole('button', { name: '检测更新' })).toBeTruthy()
  })

  it('opens the shortcuts page from workbench actions', () => {
    render(<ConfigPage />)
    fireEvent.click(screen.getByRole('button', { name: '快捷键管理' }))
    expect(screen.getByRole('main').getAttribute('data-active-section')).toBe('shortcuts')
  })
})
