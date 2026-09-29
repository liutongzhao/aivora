// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelRoutingPanel } from './ModelRoutingPanel'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    listConnections: vi.fn(),
    listModels: vi.fn(),
    listDefaults: vi.fn(),
    setModelDefault: vi.fn(),
  },
}))

describe('ModelRoutingPanel', () => {
  it('renders question modes and saves a valid model selection', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValue([
      { id: 'connection-1', name: 'OpenAI', base_url: 'https://api.example.com', enabled: true },
    ])
    vi.mocked(userConfigService.listModels).mockResolvedValue([
      { id: 'model-1', connection_id: 'connection-1', name: 'gpt-4o', display_name: 'GPT-4o', supports_vision: true, enabled: true },
      { id: 'model-2', connection_id: 'connection-1', name: 'text-only', display_name: 'Text Only', supports_vision: false, enabled: true },
    ])
    vi.mocked(userConfigService.listDefaults).mockResolvedValue([])
    vi.mocked(userConfigService.setModelDefault).mockResolvedValue({ mode: 'programming', model_id: 'model-1', language: 'typescript' })

    render(<ModelRoutingPanel />)

    expect(await screen.findByText('编程题')).toBeTruthy()
    expect(screen.getByText('单选题')).toBeTruthy()
    expect(screen.getByText('调试题')).toBeTruthy()
    expect(screen.getByText('可用模型')).toBeTruthy()
    expect(screen.getByText('图片输入')).toBeTruthy()
    expect(screen.getAllByRole('option', { name: 'GPT-4o' }).length).toBeGreaterThan(0)
    expect(screen.queryByRole('option', { name: 'Text Only' })).toBeNull()

    const programmingRow = screen.getByTestId('routing-programming')
    fireEvent.change(programmingRow.querySelector('select')!, { target: { value: 'model-1' } })
    await waitFor(() => expect(userConfigService.setModelDefault).toHaveBeenCalledWith('programming', 'model-1', 'python'))
  })

  it('marks an invalid existing assignment and does not save an empty choice', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValue([
      { id: 'connection-1', name: '停用连接', base_url: 'https://example.com', enabled: false },
    ])
    vi.mocked(userConfigService.listModels).mockResolvedValue([
      { id: 'model-1', connection_id: 'connection-1', name: 'old', display_name: '旧模型', supports_vision: true, enabled: true },
    ])
    vi.mocked(userConfigService.listDefaults).mockResolvedValue([
      { mode: 'programming', model_id: 'model-1', language: 'python' },
    ])
    render(<ModelRoutingPanel />)
    expect((await screen.findByTestId('routing-programming')).textContent).toContain('当前模型不可用')
    fireEvent.change(screen.getByRole('combobox', { name: '编程题模型' }), { target: { value: '' } })
    expect(userConfigService.setModelDefault).not.toHaveBeenCalled()
  })
})
