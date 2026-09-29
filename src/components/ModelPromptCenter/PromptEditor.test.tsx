// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PromptEditor } from './PromptEditor'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    listPromptVersions: vi.fn(),
    savePrompt: vi.fn(),
  },
}))

describe('PromptEditor', () => {
  beforeEach(() => vi.clearAllMocks())
  it('loads the newest prompt, saves a new version, and guards unsaved mode changes', async () => {
    vi.mocked(userConfigService.listPromptVersions).mockImplementation(async (mode) => [{
      id: `${mode}-latest`,
      mode,
      version: 2,
      content: `${mode} prompt`,
      enabled: true,
    }])
    vi.mocked(userConfigService.savePrompt).mockResolvedValue({
      id: 'prompt-3',
      mode: 'programming',
      version: 3,
      content: 'updated prompt',
      enabled: true,
    })

    render(<PromptEditor />)

    const editor = await screen.findByRole('textbox', { name: '提示词内容' })
    expect((editor as HTMLTextAreaElement).value).toBe('programming prompt')
    fireEvent.change(editor, { target: { value: 'updated prompt' } })
    fireEvent.click(screen.getByRole('button', { name: '保存提示词' }))
    await waitFor(() => expect(userConfigService.savePrompt).toHaveBeenCalledWith('programming', 'updated prompt'))
    expect(screen.getByText('已保存 v3')).toBeTruthy()

    fireEvent.change(editor, { target: { value: 'unsaved prompt' } })
    fireEvent.click(screen.getByRole('tab', { name: '单选题' }))
    expect(screen.getByRole('dialog', { name: '未保存修改' })).toBeTruthy()
    expect(screen.getByRole('button', { name: '放弃修改' })).toBeTruthy()
  })

  it('protects a new unsaved prompt and restores an earlier version as a new save', async () => {
    vi.mocked(userConfigService.listPromptVersions).mockResolvedValueOnce([])
    vi.mocked(userConfigService.savePrompt).mockResolvedValueOnce({
      id: 'prompt-3', mode: 'programming', version: 3, content: 'old text', enabled: true,
    })
    const { unmount } = render(<PromptEditor />)
    const editor = await screen.findByRole('textbox', { name: '提示词内容' }) as HTMLTextAreaElement
    await waitFor(() => expect(editor.disabled).toBe(false))
    fireEvent.change(editor, { target: { value: 'first draft' } })
    fireEvent.click(screen.getByRole('tab', { name: '单选题' }))
    expect(screen.getByRole('dialog', { name: '未保存修改' })).toBeTruthy()
    unmount()

    vi.mocked(userConfigService.listPromptVersions).mockResolvedValueOnce([
      { id: 'prompt-2', mode: 'programming', version: 2, content: 'current text', enabled: true },
      { id: 'prompt-1', mode: 'programming', version: 1, content: 'old text', enabled: true },
    ])
    render(<PromptEditor />)
    await screen.findByText('当前版本 v2')
    fireEvent.click(screen.getByRole('button', { name: '恢复 v1' }))
    expect((screen.getByRole('textbox', { name: '提示词内容' }) as HTMLTextAreaElement).value).toBe('old text')
    fireEvent.click(screen.getByRole('button', { name: '保存提示词' }))
    await waitFor(() => expect(userConfigService.savePrompt).toHaveBeenCalledWith('programming', 'old text'))
  })

  it('shows a save error without discarding the draft', async () => {
    vi.mocked(userConfigService.listPromptVersions).mockResolvedValueOnce([])
    vi.mocked(userConfigService.savePrompt).mockRejectedValueOnce(new Error('保存失败，请重试'))
    render(<PromptEditor />)
    const editor = await screen.findByRole('textbox', { name: '提示词内容' }) as HTMLTextAreaElement
    await waitFor(() => expect(editor.disabled).toBe(false))
    fireEvent.change(editor, { target: { value: 'draft' } })
    fireEvent.click(screen.getByRole('button', { name: '保存提示词' }))
    expect((await screen.findByRole('alert')).textContent).toContain('保存失败，请重试')
    expect(editor.value).toBe('draft')
  })
})
