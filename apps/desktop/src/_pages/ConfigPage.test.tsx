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
      apiRequest: vi.fn().mockImplementation(({ path }: { path: string }) => ({
        status: 200,
        body: JSON.stringify(
          path === '/api/account/usage'
            ? {
                trialTotal: 5,
                trialUsed: 0,
                trialRemaining: 5,
                entitlementActive: false,
                entitlementExpiresAt: null,
                entitlementStatus: null
              }
            : []
        )
      })),
        checkForUpdates: vi.fn().mockResolvedValue({ success: true, updateInfo: null }),
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

    await waitFor(() => expect(screen.getByRole('tab', { name: '模型' })).toBeTruthy())
    expect(screen.queryByRole('heading', { name: '模型与提示词' })).toBeNull()
    expect(screen.getByRole('tab', { name: '题型分配' })).toBeTruthy()
    expect(screen.getByRole('tab', { name: '提示词' })).toBeTruthy()
  })

  it('opens the shortcuts page from the sidebar', () => {
    render(<ConfigPage />)
    fireEvent.click(screen.getByRole('button', { name: '快捷键' }))
    expect(screen.getByRole('main').getAttribute('data-active-section')).toBe('shortcuts')
  })

  it('checks updates through the Electron updater', async () => {
    render(<ConfigPage />)
    const checkForUpdates = window.electronAPI.checkForUpdates as ReturnType<typeof vi.fn>

    fireEvent.click(await screen.findByRole('button', { name: '检测更新' }))

    await waitFor(() => expect(checkForUpdates).toHaveBeenCalledTimes(1))
  })

  it('disables starting the exam client when the account has no usage available', async () => {
    const apiRequest = vi.fn().mockImplementation(({ path }: { path: string }) => ({
      status: 200,
      body: JSON.stringify(
        path === '/api/account/usage'
          ? {
              trialTotal: 5,
              trialUsed: 5,
              trialRemaining: 0,
              entitlementActive: false,
              entitlementExpiresAt: null,
              entitlementStatus: null
            }
          : []
      )
    }))
    window.electronAPI.apiRequest = apiRequest

    render(<ConfigPage />)

    const startButton = await screen.findByRole('button', { name: '开始使用' })
    await waitFor(() => expect((startButton as HTMLButtonElement).disabled).toBe(true))
    expect(screen.getByText('免费体验次数已用完，请激活授权码后继续使用')).toBeTruthy()
    expect(window.electronAPI.openExamClient).not.toHaveBeenCalled()
  })
})
