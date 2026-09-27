// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ModelPromptCenter } from './ModelPromptCenter'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    listConnections: vi.fn(),
    listModels: vi.fn(),
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

    expect(await screen.findByRole('heading', { name: '模型' })).toBeTruthy()
    expect(screen.getByRole('option', { name: 'OpenAI' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: '停用连接' })).toBeNull()
    expect(screen.getAllByText('GPT-4o')).toHaveLength(2)
    await waitFor(() => expect(userConfigService.listModels).toHaveBeenCalled())
  })
})
