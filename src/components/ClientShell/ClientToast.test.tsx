// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ClientToast } from './ClientToast'

describe('ClientToast', () => {
  it('renders a transient status outside the page content flow', () => {
    const { container } = render(<ClientToast variant="success" message="保存成功" />)

    expect(screen.getByRole('status').textContent).toContain('保存成功')
    expect(container.querySelector('.client-status-toast-viewport')).toBeTruthy()
    expect(container.querySelector('.client-status-toast.is-success')).toBeTruthy()
  })
})
