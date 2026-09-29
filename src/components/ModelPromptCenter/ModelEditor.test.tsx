// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelEditor } from './ModelEditor'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: { createModel: vi.fn() },
}))

describe('ModelEditor', () => {
  it('explains image routing and the current API protocol', () => {
    render(<ModelEditor model={null} connectionId="connection-1" onSaved={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText('Chat Completions')).toBeTruthy()
    expect(screen.getByText(/勾选后可用于截图题型/)).toBeTruthy()
  })

  it('shows a save failure and retains the form', async () => {
    vi.mocked(userConfigService.createModel).mockRejectedValueOnce(new Error('服务暂不可用'))
    const onClose = vi.fn()
    render(<ModelEditor model={null} connectionId="connection-1" onSaved={vi.fn()} onClose={onClose} />)
    fireEvent.change(screen.getByLabelText('模型 ID'), { target: { value: 'example' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))
    expect((await screen.findByRole('alert')).textContent).toContain('服务暂不可用')
    expect((screen.getByLabelText('模型 ID') as HTMLInputElement).value).toBe('example')
    expect(onClose).not.toHaveBeenCalled()
  })
})
