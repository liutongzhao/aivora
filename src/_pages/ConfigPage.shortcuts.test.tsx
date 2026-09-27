// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { defaultShortcutBindings } from '../../shared/shortcuts'
import ConfigPage from './ConfigPage'

describe('ConfigPage shortcut management', () => {
  const updateShortcutBinding = vi.fn()
  const getShortcutBindings = vi.fn()

  beforeEach(() => {
    updateShortcutBinding.mockResolvedValue({
      success: true,
      bindings: defaultShortcutBindings
    })
    getShortcutBindings.mockResolvedValue(defaultShortcutBindings)
    Object.assign(window, {
      electronAPI: {
        webAuthStatus: vi.fn().mockResolvedValue({ user: { username: '测试用户' } }),
        getShortcutBindings,
        updateShortcutBinding,
        getClientTheme: vi.fn().mockResolvedValue({ theme: 'dark' }),
        onShortcutTestResult: vi.fn().mockReturnValue(() => {}),
        remoteControl: { onState: vi.fn().mockReturnValue(() => {}) }
      }
    })
  })

  it('shows common shortcuts and keeps advanced shortcuts collapsed by default', async () => {
    render(<ConfigPage />)

    await waitFor(() => expect(screen.getByText('截图')).toBeTruthy())
    expect(screen.getByText('局部截图')).toBeTruthy()
    expect(screen.queryByText('窗口左移')).toBeNull()
    expect(screen.getByRole('button', { name: /答题窗口调整等快捷键/ })).toBeTruthy()
    expect(screen.getByRole('button', { name: '恢复默认快捷键' })).toBeTruthy()
  })

  it('shows a conflict beside the active shortcut row and skips saving', async () => {
    render(<ConfigPage />)

    await waitFor(() => expect(screen.getByText('截图')).toBeTruthy())
    const changeButtons = screen.getAllByRole('button', { name: '更改' })
    fireEvent.click(changeButtons[0])
    fireEvent.keyDown(window, { key: 'S', ctrlKey: true, shiftKey: true })

    expect(await screen.findByText(/快捷键冲突/)).toBeTruthy()
    expect(updateShortcutBinding).not.toHaveBeenCalled()
  })
})
