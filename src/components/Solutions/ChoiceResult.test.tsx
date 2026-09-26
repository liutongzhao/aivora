// @vitest-environment jsdom
import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ChoiceResult } from './ChoiceResult'

describe('ChoiceResult', () => {
  it('prioritizes the answer and explanation while keeping raw output collapsed', () => {
    render(<ChoiceResult result={{
      questionType: 'single_choice',
      content: '{"answer":"B","explanation":"理由"}',
      parsed: { answer: 'B', explanation: '理由', question: '题干', options: { A: '错', B: '对' } }
    }} />)
    expect(screen.getByText('B')).toBeTruthy()
    expect(screen.getByText('理由')).toBeTruthy()
    const questionToggle = screen.getByRole('button', { name: '查看题目与选项' })
    fireEvent.click(questionToggle)
    expect(questionToggle.closest('details')?.open).toBe(true)
    expect(screen.getByText('原始输出').closest('details')?.open).toBe(false)
  })

  it('shows a readable fallback and warning for malformed model output', () => {
    render(<ChoiceResult result={{
      questionType: 'multiple_choice',
      content: '无法确认选项',
      parsed: { answer: '无法确认选项', raw: '无法确认选项' },
      parseWarning: '模型返回的内容不是合法 JSON'
    }} />)
    expect(screen.getByText('待核对')).toBeTruthy()
    expect(screen.getByText('无法确认选项').closest('details')?.open).toBe(false)
    expect(screen.getByText(/模型返回的内容不是合法 JSON/)).toBeTruthy()
  })

  it('joins multiple-choice answers and shows recognition warnings', () => {
    render(<ChoiceResult result={{
      questionType: 'multiple_choice',
      content: '{"answers":["A","C"]}',
      parsed: { answers: ['A', 'C'], explanation: '逐项判断', warnings: ['第二张图不清晰'] }
    }} />)
    expect(screen.getByText('A、C')).toBeTruthy()
    expect(screen.getByText('逐项判断')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('第二张图不清晰')
  })
})
