// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ConfigPage from './ConfigPage'

describe('ConfigPage visual structure', () => {
  beforeEach(() => {
    Object.assign(window, {
      electronAPI: {
        webAuthStatus: vi.fn().mockResolvedValue({ user: { username: '测试用户' } }),
        getShortcutBindings: vi.fn().mockResolvedValue({}),
        getClientTheme: vi.fn().mockResolvedValue({ theme: 'dark' }),
        onShortcutTestResult: vi.fn().mockReturnValue(() => {}),
        remoteControl: { onState: vi.fn().mockReturnValue(() => {}) },
      },
    })
  })

  it('uses a compact page heading and shared primary control style', async () => {
    const { container } = render(<ConfigPage />)
    await waitFor(() => expect(screen.getByRole('heading', { name: '模型与提示词' })).toBeTruthy())
    expect(container.querySelector('.client-page-heading')).toBeTruthy()
    expect(container.querySelector('.client-button-primary')).toBeTruthy()
    expect(screen.queryByText(/使用前可简单看一下/)).toBeNull()
  })
})
