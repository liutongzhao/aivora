// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigPage from './ConfigPage'

describe('ConfigPage', () => {
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

  it('opens directly on the dense model configuration page', async () => {
    render(<ConfigPage />)

    await waitFor(() => {
      expect(screen.getByRole('heading', { name: '模型与提示词' })).toBeTruthy()
    })
    expect(screen.getByRole('tab', { name: '题型分配' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '提示词' })).toBeTruthy()
  })

  it('opens the shortcuts page from the sidebar', () => {
    render(<ConfigPage />)
    fireEvent.click(screen.getByRole('button', { name: '快捷键' }))
    expect(screen.getByRole('main').getAttribute('data-active-section')).toBe('shortcuts')
  })
})
