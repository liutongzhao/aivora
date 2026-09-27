// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelList } from './ModelList'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    syncConnection: vi.fn(),
    createModel: vi.fn(),
    updateModel: vi.fn(),
    testModel: vi.fn(),
    disableModel: vi.fn(),
  },
}))

const connection = { id: 'connection-1', name: 'OpenAI', base_url: 'https://api.example.com', enabled: true }
const model = {
  id: 'model-1',
  connection_id: 'connection-1',
  name: 'gpt-4o',
  display_name: 'GPT-4o',
  supports_vision: true,
  enabled: true,
}

describe('ModelList', () => {
  beforeEach(() => {
    vi.mocked(userConfigService.syncConnection).mockResolvedValue(['gpt-4o', 'new-model'])
    vi.mocked(userConfigService.createModel).mockResolvedValue(model)
    vi.mocked(userConfigService.updateModel).mockResolvedValue(model)
    vi.mocked(userConfigService.testModel).mockResolvedValue({ success: true })
    vi.mocked(userConfigService.disableModel).mockResolvedValue({ success: true })
  })

  it('shows discovered models as pending until the user adds one', async () => {
    render(<ModelList connections={[connection]} models={[model]} />)

    fireEvent.click(screen.getByRole('button', { name: '同步模型' }))

    expect(await screen.findByText('new-model')).toBeTruthy()
    expect(userConfigService.createModel).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: '添加 new-model' }))
    await waitFor(() => expect(userConfigService.createModel).toHaveBeenCalledWith({
      connection_id: 'connection-1',
      name: 'new-model',
      display_name: 'new-model',
      supports_vision: true,
    }))
  })

  it('uses model actions from the selected model details', async () => {
    render(<ModelList connections={[connection]} models={[model]} />)

    fireEvent.click(screen.getByRole('button', { name: '测试模型' }))
    await waitFor(() => expect(userConfigService.testModel).toHaveBeenCalledWith('model-1'))

    fireEvent.click(screen.getByRole('button', { name: '停用模型' }))
    await waitFor(() => expect(userConfigService.disableModel).toHaveBeenCalledWith('model-1'))
  })
})
