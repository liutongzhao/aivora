// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastContext } from '../../contexts/toast'
import QueueCommands from './QueueCommands'

describe('QueueCommands', () => {
  it('shows shortcut hints without exposing mouse operation buttons', () => {
    const triggerScreenshot = vi.fn().mockResolvedValue({ success: true })
    const triggerProcessScreenshots = vi.fn().mockResolvedValue({ success: true })
    const triggerReset = vi.fn().mockResolvedValue({ success: true })
    Object.assign(window, {
      electronAPI: {
        triggerScreenshot,
        triggerProcessScreenshots,
        triggerReset
      }
    })

    render(
      <ToastContext.Provider value={{ showToast: vi.fn() }}>
        <QueueCommands screenshotCount={1} credits={10} />
      </ToastContext.Provider>
    )

    expect(screen.getAllByText('截图').length).toBeGreaterThan(0)
    expect(screen.getByText('单选')).toBeTruthy()
    expect(screen.getByText('编程')).toBeTruthy()
    expect(screen.getByText('通用')).toBeTruthy()
    expect(screen.queryByRole('button')).toBeNull()
    expect(triggerScreenshot).not.toHaveBeenCalled()
    expect(triggerProcessScreenshots).not.toHaveBeenCalled()
    expect(triggerReset).not.toHaveBeenCalled()
  })
})
