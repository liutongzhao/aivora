// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ToastContext } from '../../contexts/toast'
import QueueCommands from './QueueCommands'

describe('QueueCommands', () => {
  it('exposes the core screenshot, process, and reset actions', () => {
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

    expect(screen.getByRole('button', { name: '截图' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '局部截图' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '处理截图' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '重置队列' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '截图' }))
    fireEvent.click(screen.getByRole('button', { name: '处理截图' }))
    fireEvent.click(screen.getByRole('button', { name: '重置队列' }))

    expect(triggerScreenshot).toHaveBeenCalledTimes(1)
    expect(triggerProcessScreenshots).toHaveBeenCalledTimes(1)
    expect(triggerReset).toHaveBeenCalledTimes(1)
  })
})
