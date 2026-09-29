// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelPromptCenter } from './ModelPromptCenter'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    listConnections: vi.fn(),
    listModels: vi.fn(),
    listPromptVersions: vi.fn(),
  },
}))

describe('ModelPromptCenter', () => {
  it('loads enabled connections and models for the model workspace', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValue([
      { id: 'connection-1', name: 'OpenAI', base_url: 'https://api.example.com', enabled: true },
      { id: 'connection-2', name: '停用连接', base_url: 'https://disabled.example.com', enabled: false },
    ])
    vi.mocked(userConfigService.listModels).mockResolvedValue([
      {
        id: 'model-1',
        connection_id: 'connection-1',
        name: 'gpt-4o',
        display_name: 'GPT-4o',
        supports_vision: true,
        enabled: true,
      },
    ])

    render(<ModelPromptCenter />)

    expect(await screen.findByRole('tab', { name: '模型' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '停用连接' })).toBeNull()
    expect(screen.getAllByText('GPT-4o')).toHaveLength(2)
    await waitFor(() => expect(userConfigService.listModels).toHaveBeenCalled())
  })

  it('refreshes connections when returning and guards a prompt draft on tab changes', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValueOnce([])
      .mockResolvedValue([{ id: 'new', name: '新连接', base_url: 'https://example.com', enabled: true }])
    vi.mocked(userConfigService.listModels).mockResolvedValue([])
    vi.mocked(userConfigService.listPromptVersions).mockResolvedValue([])
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const onDirtyChange = vi.fn()
    const { rerender } = render(<ModelPromptCenter visible onDirtyChange={onDirtyChange} />)
    await screen.findByText('暂无模型')
    rerender(<ModelPromptCenter visible={false} onDirtyChange={onDirtyChange} />)
    rerender(<ModelPromptCenter visible onDirtyChange={onDirtyChange} />)
    expect(await screen.findByRole('option', { name: '新连接' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: '提示词' }))
    const editor = await screen.findByRole('textbox', { name: '提示词内容' })
    fireEvent.change(editor, { target: { value: '草稿' } })
    await waitFor(() => expect(onDirtyChange).toHaveBeenCalledWith(true))
    fireEvent.click(screen.getByRole('tab', { name: '模型' }))
    expect(confirm).toHaveBeenCalled()
    expect(screen.getByRole('tab', { name: '提示词' }).getAttribute('aria-selected')).toBe('true')
    confirm.mockRestore()
  })

  it('offers login recovery when the session expires', async () => {
    vi.mocked(userConfigService.listConnections).mockRejectedValueOnce(Object.assign(new Error('会话已过期'), { status: 401 }))
    vi.mocked(userConfigService.listModels).mockResolvedValue([])
    const webAuthLogin = vi.fn().mockResolvedValue({ success: true })
    Object.assign(window, { electronAPI: { webAuthLogin } })
    render(<ModelPromptCenter />)
    expect((await screen.findByRole('alert')).textContent).toContain('会话已过期')
    fireEvent.click(screen.getByRole('button', { name: '重新登录' }))
    expect(webAuthLogin).toHaveBeenCalled()
  })
})
