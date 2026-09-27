// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ClientSidebar } from './ClientSidebar'
import { ClientTitleBar } from './ClientTitleBar'

describe('ClientTitleBar', () => {
  it('renders the product name and native window controls', () => {
    const windowControl = vi.fn()
    Object.assign(window, {
      electronAPI: {
        windowControl
      }
    })

    render(<ClientTitleBar />)

    expect(screen.getByText('Aivora')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '最小化' }))
    fireEvent.click(screen.getByRole('button', { name: '最大化或还原' }))
    fireEvent.click(screen.getByRole('button', { name: '关闭' }))

    expect(windowControl).toHaveBeenNthCalledWith(1, 'minimize')
    expect(windowControl).toHaveBeenNthCalledWith(2, 'toggle-maximize')
    expect(windowControl).toHaveBeenNthCalledWith(3, 'close')
  })
})

describe('ClientSidebar', () => {
  it('renders navigation labels and reports the selected section', () => {
    const onSelect = vi.fn()

    render(<ClientSidebar activeSection="overview" onSelect={onSelect} />)

    expect(screen.getByRole('navigation', { name: '设置导航' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '概览' }).getAttribute('aria-current')).toBe('page')
    expect(screen.getByRole('button', { name: '快捷键' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '外观与系统' })).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: '快捷键' }))
    expect(onSelect).toHaveBeenCalledWith('shortcuts')
  })
})
