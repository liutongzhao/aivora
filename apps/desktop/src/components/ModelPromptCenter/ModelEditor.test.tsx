// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelEditor } from './ModelEditor'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: { createModel: vi.fn(), updateModel: vi.fn(), updateConnection: vi.fn() },
}))

describe('ModelEditor', () => {
  it('explains the image capability requirement', () => {
    render(<ModelEditor model={null} connectionId="connection-1" onSaved={vi.fn()} onClose={vi.fn()} />)

    expect(screen.getByText(/请确认此模型可以识别图片/)).toBeTruthy()
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

  it('keeps the model ID read-only and updates the display and connection details', async () => {
    vi.mocked(userConfigService.updateModel).mockResolvedValueOnce({
      id: 'model-1', connection_id: 'connection-1', name: 'gpt-4o', display_name: 'GPT-4o 新名称', supports_vision: true, enabled: true,
    })
    vi.mocked(userConfigService.updateConnection).mockResolvedValueOnce({
      id: 'connection-1', name: '新连接', base_url: 'https://new.example.com', enabled: true,
    })
    const onSaved = vi.fn()
    render(<ModelEditor
      model={{ id: 'model-1', connection_id: 'connection-1', name: 'gpt-4o', display_name: 'GPT-4o', supports_vision: true, enabled: true }}
      connectionId="connection-1"
      connection={{ id: 'connection-1', name: '旧连接', base_url: 'https://old.example.com', enabled: true }}
      onSaved={onSaved}
      onClose={vi.fn()}
    />)

    const modelId = screen.getByLabelText('模型 ID') as HTMLInputElement
    expect(modelId.readOnly).toBe(true)
    expect(modelId.value).toBe('gpt-4o')
    fireEvent.change(screen.getByLabelText('显示名称'), { target: { value: 'GPT-4o 新名称' } })
    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: '新连接' } })
    fireEvent.change(screen.getByLabelText('API 地址'), { target: { value: 'https://new.example.com' } })
    fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'new-secret' } })
    fireEvent.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() => expect(userConfigService.updateModel).toHaveBeenCalledWith('model-1', { display_name: 'GPT-4o 新名称' }))
    expect(userConfigService.updateConnection).toHaveBeenCalledWith('connection-1', {
      name: '新连接', base_url: 'https://new.example.com', api_key: 'new-secret', replace_key: true,
    })
    expect(onSaved).toHaveBeenCalled()
  })
})
