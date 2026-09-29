// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { ConnectionSettings } from './ConnectionSettings'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    listConnections: vi.fn(),
    createConnection: vi.fn(),
    updateConnection: vi.fn(),
    disableConnection: vi.fn(),
    testNewConnection: vi.fn(),
    syncConnection: vi.fn(),
  },
}))

describe('ConnectionSettings', () => {
  it('loads connections without rendering API keys', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValue([
      { id: 'connection-1', name: 'OpenAI', base_url: 'https://api.example.com', enabled: true, key_configured: true },
    ])

    render(<ConnectionSettings />)

    expect(await screen.findByText('OpenAI')).toBeTruthy()
    expect(screen.getByText('密钥已配置')).toBeTruthy()
    expect(screen.queryByText('secret-api-key')).toBeNull()
  })

  it('validates and creates a connection through the service', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValue([])
    vi.mocked(userConfigService.createConnection).mockResolvedValue({
      id: 'connection-1',
      name: 'OpenAI',
      base_url: 'https://api.example.com',
      enabled: true,
    })

    render(<ConnectionSettings />)
    fireEvent.click(await screen.findByRole('button', { name: '新增连接' }))
    fireEvent.click(screen.getByRole('button', { name: '保存连接' }))
    expect(userConfigService.createConnection).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText('连接名称'), { target: { value: 'OpenAI' } })
    fireEvent.change(screen.getByLabelText('API 地址'), { target: { value: 'https://api.example.com' } })
    fireEvent.change(screen.getByLabelText('API 密钥'), { target: { value: 'secret-api-key' } })
    fireEvent.click(screen.getByRole('button', { name: '保存连接' }))

    await waitFor(() => expect(userConfigService.createConnection).toHaveBeenCalledWith({
      name: 'OpenAI',
      base_url: 'https://api.example.com',
      api_key: 'secret-api-key',
    }))
  })

  it('switches editor fields when choosing another connection and can disable one', async () => {
    vi.mocked(userConfigService.listConnections).mockResolvedValue([
      { id: 'a', name: '第一连接', base_url: 'https://a.example.com', enabled: true },
      { id: 'b', name: '第二连接', base_url: 'https://b.example.com', enabled: true },
    ])
    vi.mocked(userConfigService.disableConnection).mockResolvedValue({ success: true })
    render(<ConnectionSettings />)
    await screen.findByText('第一连接')
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[0])
    expect((screen.getByLabelText('连接名称') as HTMLInputElement).value).toBe('第一连接')
    fireEvent.click(screen.getAllByRole('button', { name: '编辑' })[1])
    expect((screen.getByLabelText('连接名称') as HTMLInputElement).value).toBe('第二连接')
    fireEvent.click(screen.getAllByRole('button', { name: '停用连接' })[1])
    await waitFor(() => expect(userConfigService.disableConnection).toHaveBeenCalledWith('b'))
  })
})
