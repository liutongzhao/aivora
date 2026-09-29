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

  it('uses tab content without a redundant page heading', async () => {
    const { container } = render(<ConfigPage />)
    await waitFor(() => expect(screen.getByRole('tab', { name: '模型' })).toBeTruthy())
    expect(container.querySelector('.client-page-heading')).toBeNull()
    expect(container.querySelector('.client-button-primary')).toBeTruthy()
    expect(screen.queryByText(/使用前可简单看一下/)).toBeNull()
  })
})
