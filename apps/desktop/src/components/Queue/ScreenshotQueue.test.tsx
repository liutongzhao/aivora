// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ScreenshotQueue from './ScreenshotQueue'

describe('ScreenshotQueue', () => {
  it('renders a concise empty state when no screenshots are queued', () => {
    render(
      <ScreenshotQueue
        isLoading={false}
        screenshots={[]}
        onDeleteScreenshot={() => {}}
      />
    )

    expect(screen.getByText('还没有截图')).toBeTruthy()
    expect(screen.getByText('使用截图按钮开始')).toBeTruthy()
  })
})
