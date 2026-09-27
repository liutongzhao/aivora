import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from './apiClient'
import { userConfigService } from './userConfigService'

vi.mock('./apiClient', () => ({
  apiFetch: vi.fn(),
}))

describe('userConfigService', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
  })

  it('loads connections and syncs discovered models through user endpoints', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([{ id: 'connection-1', name: 'OpenAI', base_url: 'https://api.example.com', enabled: true }])
      .mockResolvedValueOnce({ success: true, models: ['gpt-4o'] })

    await expect(userConfigService.listConnections()).resolves.toHaveLength(1)
    await expect(userConfigService.syncConnection('connection-1')).resolves.toEqual(['gpt-4o'])

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/user/connections')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/user/connections/connection-1/test', { method: 'POST' })
  })

  it('loads defaults and prompt versions from typed endpoints', async () => {
    vi.mocked(apiFetch)
      .mockResolvedValueOnce([{ mode: 'programming', model_id: 'model-1', language: 'python' }])
      .mockResolvedValueOnce([{ id: 'prompt-1', mode: 'programming', version: 2, content: 'solve', enabled: true }])

    await userConfigService.listDefaults()
    await userConfigService.listPromptVersions('programming')

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/user/models/defaults')
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/user/prompts/programming')
  })

  it('saves a prompt and assigns a model with the expected payloads', async () => {
    vi.mocked(apiFetch).mockResolvedValue({})

    await userConfigService.savePrompt('single_choice', 'choose the answer')
    await userConfigService.setModelDefault('programming', 'model-1', 'typescript')

    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/user/prompts/single_choice', {
      method: 'POST',
      body: JSON.stringify({ content: 'choose the answer' }),
    })
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/user/models/defaults/programming', {
      method: 'PUT',
      body: JSON.stringify({ model_id: 'model-1', language: 'typescript' }),
    })
  })
})
