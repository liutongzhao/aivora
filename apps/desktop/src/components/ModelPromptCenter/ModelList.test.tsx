// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ModelList } from './ModelList'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    testNewConnection: vi.fn(), setupModel: vi.fn(), testModel: vi.fn(), disableModel: vi.fn(), updateModel: vi.fn(),
  },
}))

const connection = { id: 'connection-1', name: 'OpenAI', base_url: 'https://api.example.com', enabled: true }
const model = { id: 'model-1', connection_id: 'connection-1', name: 'gpt-4o', display_name: 'GPT-4o', supports_vision: true, enabled: true }

describe('ModelList', () => {
  beforeEach(() => {
    vi.mocked(userConfigService.testNewConnection).mockResolvedValue({ success: true, models: ['gpt-4o', 'new-model'] })
    vi.mocked(userConfigService.setupModel).mockResolvedValue({ connection, model })
    vi.mocked(userConfigService.testModel).mockResolvedValue({ success: true })
    vi.mocked(userConfigService.disableModel).mockResolvedValue({ success: true })
  })

  it('puts the built-in model before user models and shows its remaining count', () => {
    render(<ModelList connections={[connection]} models={[model]} trialModel={{ enabled: true, display_name: '内置模型', model_name: 'gpt-6-sol', trial_total: 20, trial_used: 2, trial_remaining: 18 }} />)
    expect(screen.getByText('内置模型')).toBeTruthy()
    expect(screen.getByText('剩余 18 次')).toBeTruthy()
    expect(screen.getByText('GPT-4o')).toBeTruthy()
  })

  it('adds one selected model from a connection flow', async () => {
    render(<ModelList connections={[connection]} models={[]} onRefresh={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: '添加模型' }))
    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: 'OpenAI' } })
    fireEvent.change(screen.getByLabelText('API 地址'), { target: { value: connection.base_url } })
    fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'secret-api-key' } })
    fireEvent.click(screen.getByRole('button', { name: '获取模型' }))
    expect(await screen.findByRole('option', { name: 'new-model' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '保存模型' }))
    await waitFor(() => expect(userConfigService.setupModel).toHaveBeenCalled())
  })

  it('automatically discovers models after the connection fields are complete', async () => {
    render(<ModelList connections={[connection]} models={[]} />)
    fireEvent.click(screen.getByRole('button', { name: '添加模型' }))
    fireEvent.change(screen.getByLabelText('API 地址'), { target: { value: connection.base_url } })
    fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'secret-api-key' } })
    expect(await screen.findByRole('option', { name: 'new-model' })).toBeTruthy()
    expect(userConfigService.testNewConnection).toHaveBeenCalled()
  })
})
