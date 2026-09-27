import React from "react"
import ScreenshotItem from "./ScreenshotItem"

interface Screenshot {
  path: string
  preview: string
}

interface ScreenshotQueueProps {
  isLoading: boolean
  screenshots: Screenshot[]
  onDeleteScreenshot: (index: number) => void
}
const ScreenshotQueue: React.FC<ScreenshotQueueProps> = ({
  isLoading,
  screenshots,
  onDeleteScreenshot
}) => {
  if (screenshots.length === 0) {
    return (
      <div className="client-queue-empty" role="status">
        <p>还没有截图</p>
        <span>使用截图按钮开始</span>
      </div>
    )
  }

  const displayScreenshots = screenshots.slice(0, 5)

  return (
    <div className="flex flex-wrap gap-2">
      {displayScreenshots.map((screenshot, index) => (
        <ScreenshotItem
          key={screenshot.path}
          isLoading={isLoading}
          screenshot={screenshot}
          index={index}
          onDelete={onDeleteScreenshot}
        />
      ))}
    </div>
  )
}

export default ScreenshotQueue
