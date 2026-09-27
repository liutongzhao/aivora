// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { WindowSettings } from './WindowSettings'

describe('WindowSettings', () => {
  it('loads and updates theme and opacity controls', async () => {
    const setClientTheme = vi.fn().mockResolvedValue({ success: true })
    const setOpacity = vi.fn().mockResolvedValue({ success: true, opacity: 0.8 })
    Object.assign(window, {
      electronAPI: {
        getClientTheme: vi.fn().mockResolvedValue({ theme: 'dark' }),
        setClientTheme,
        getOpacity: vi.fn().mockResolvedValue({ opacity: 1 }),
        setOpacity,
      },
    })

    render(<WindowSettings />)
    expect(await screen.findByLabelText('窗口透明度')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('窗口透明度'), { target: { value: '0.8' } })
    await waitFor(() => expect(setOpacity).toHaveBeenCalledWith(0.8))
    fireEvent.click(screen.getByRole('button', { name: '浅色' }))
    await waitFor(() => expect(setClientTheme).toHaveBeenCalledWith('light'))
  })
})
