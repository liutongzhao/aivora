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
  it('shows the protocol and image capability in model details', () => {
    render(<ModelList connections={[connection]} models={[model]} />)

    expect(screen.getByText('Chat Completions')).toBeTruthy()
    expect(screen.getByText('图片输入')).toBeTruthy()
  })

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
      supports_vision: false,
    }))
  })

  it('uses model actions from the selected model details', async () => {
    render(<ModelList connections={[connection]} models={[model]} />)

    fireEvent.click(screen.getByRole('button', { name: '测试模型' }))
    await waitFor(() => expect(userConfigService.testModel).toHaveBeenCalledWith('model-1'))

    fireEvent.click(screen.getByRole('button', { name: '停用模型' }))
    await waitFor(() => expect(userConfigService.disableModel).toHaveBeenCalledWith('model-1'))
  })

  it('only shows and acts on models of the selected connection', async () => {
    const other = { ...model, id: 'model-2', connection_id: 'connection-2', display_name: '另一个模型' }
    render(<ModelList connections={[connection, { ...connection, id: 'connection-2', name: '第二连接' }]} models={[model, other]} />)
    fireEvent.change(screen.getByRole('combobox', { name: '连接' }), { target: { value: 'connection-2' } })
    expect(screen.getByRole('heading', { name: '另一个模型' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '测试模型' }))
    await waitFor(() => expect(userConfigService.testModel).toHaveBeenCalledWith('model-2'))
  })
})
