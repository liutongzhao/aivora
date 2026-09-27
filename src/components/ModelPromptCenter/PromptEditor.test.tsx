// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { PromptEditor } from './PromptEditor'
import { userConfigService } from '../../services/userConfigService'

vi.mock('../../services/userConfigService', () => ({
  userConfigService: {
    listPromptVersions: vi.fn(),
    savePrompt: vi.fn(),
  },
}))

describe('PromptEditor', () => {
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
})
