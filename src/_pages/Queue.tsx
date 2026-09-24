import React, { useState, useEffect, useRef } from "react"
import { useQuery } from "@tanstack/react-query"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import QueueCommands from "../components/Queue/QueueCommands"

import { useToast } from "../contexts/toast"
import { Screenshot } from "../types/screenshots"

async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const existing = await window.electronAPI.getScreenshots()
    return existing
  } catch (error) {
    console.error("Error loading screenshots:", error)
    throw error
  }
}

interface QueueProps {
  setView: (view: "queue" | "solutions" | "debug" | "raw-output") => void
  credits: number
}

const Queue: React.FC<QueueProps> = ({
  setView,
  credits
}) => {
  const { showToast } = useToast()

  const contentRef = useRef<HTMLDivElement>(null)
  const [showScreenshotPreviews, setShowScreenshotPreviews] = useState(true)

  const {
    data: screenshots = [],
    isLoading,
    refetch
  } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  })

  const handleDeleteScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch() // Refetch screenshots instead of managing state directly
      } else {
        console.error("Failed to delete screenshot:", response.error)
        showToast("Error", "Failed to delete the screenshot file", "error")
      }
    } catch (error) {
      console.error("Error deleting screenshot:", error)
    }
  }

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        const contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    // Initialize resize observer
    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    // Set up event listeners with debounced refetch to avoid multiple concurrent requests
    let refetchTimeout: NodeJS.Timeout | null = null
    const debouncedRefetch = () => {
      if (refetchTimeout) {
        clearTimeout(refetchTimeout)
      }
      refetchTimeout = setTimeout(() => {
        console.log('🔄 [QUEUE] Executing debounced refetch')
        refetch()
        refetchTimeout = null
      }, 100) // 100ms debounce
    }

    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => {
        console.log('📷 [QUEUE] Screenshot taken - requesting refresh')
        setShowScreenshotPreviews(true)
        debouncedRefetch()
      }),
      window.electronAPI.onResetView(() => {
        console.log('🔄 [QUEUE] Reset view triggered - requesting refresh')
        setShowScreenshotPreviews(true)
        debouncedRefetch()
      }),
      // 🆕 强制刷新队列事件 - 确保完全重置
      window.electronAPI.onForceRefreshQueue ? window.electronAPI.onForceRefreshQueue(() => {
        console.log('🔄 [QUEUE] Force refresh queue triggered - complete reset')
        setShowScreenshotPreviews(true)
        debouncedRefetch()
      }) : (() => console.log('❌ [QUEUE] onForceRefreshQueue method not available')),
      // 🆕 截图清空事件 - 立即刷新显示
      window.electronAPI.onScreenshotsCleared ? window.electronAPI.onScreenshotsCleared(() => {
        console.log('🧹 [QUEUE] Screenshots cleared - immediate refresh')
        debouncedRefetch()
      }) : (() => console.log('❌ [QUEUE] onScreenshotsCleared method not available')),
      window.electronAPI.onDeleteLastScreenshot(async () => {
        if (screenshots.length > 0) {
          const lastScreenshot = screenshots[screenshots.length - 1];
          await handleDeleteScreenshot(screenshots.length - 1);
          // Toast removed as requested
        } else {
          showToast("No Screenshots", "There are no screenshots to delete", "neutral");
        }
      }),
      window.electronAPI.onSolutionError((error: string) => {
        const message = error || 'AI处理失败'
        showToast(
          "错误",
          message,
          "error"
        )
        setView("queue")
        setShowScreenshotPreviews(true)
        console.error("Processing error:", message)
        window.electronAPI.triggerReset?.().catch((resetError) => {
          console.error('自动重置失败:', resetError)
        })
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "No Screenshots",
          "There are no screenshots to process.",
          "neutral"
        )
      }),
      window.electronAPI.onSolutionStart(() => {
        setShowScreenshotPreviews(false)
      }),

      // 🆕 水平滚动事件处理
      window.electronAPI.onScrollCodeHorizontal((data: { direction: string }) => {
        console.log('🔄 Queue收到水平滚动事件:', data)
        
        if (!data || !data.direction) {
          console.error('❌ Queue滚动数据无效:', data)
          return
        }
        
        // 查找代码容器并滚动 - 更精确的选择器
        const codeContainers = document.querySelectorAll('pre, code, [class*="syntax-highlighter"], [class*="SyntaxHighlighter"]')
        console.log('📦 Queue找到代码容器数量:', codeContainers.length)
        
        codeContainers.forEach((container) => {
          if (container instanceof HTMLElement && container.scrollWidth > container.clientWidth) {
            const scrollAmount = 100
            const currentScroll = container.scrollLeft
            
            if (data.direction === 'left') {
              container.scrollLeft = Math.max(0, currentScroll - scrollAmount)
              console.log(`⬅️ Queue左滚动: ${currentScroll} -> ${container.scrollLeft}`)
            } else if (data.direction === 'right') {
              const maxScroll = container.scrollWidth - container.clientWidth
              container.scrollLeft = Math.min(maxScroll, currentScroll + scrollAmount)
              console.log(`➡️ Queue右滚动: ${currentScroll} -> ${container.scrollLeft}`)
            }
          }
        })
      }),

      window.electronAPI.onScrollCodeVertical((data: { direction: string }) => {
        console.log('🔄 Queue收到垂直滚动事件:', data)

        if (!data || !data.direction) {
          console.error('❌ Queue垂直滚动数据无效:', data)
          return
        }

        const scrollAmount = 150
        const containers = document.querySelectorAll('[class*="overflow"], .prose, .solution-output, pre, code')

        let handled = false
        containers.forEach((container) => {
          if (!(container instanceof HTMLElement)) return
          if (container.scrollHeight <= container.clientHeight) return

          const before = container.scrollTop
          if (data.direction === 'up') {
            container.scrollTop = Math.max(0, before - scrollAmount)
          } else {
            const max = container.scrollHeight - container.clientHeight
            container.scrollTop = Math.min(max, before + scrollAmount)
          }

          if (container.scrollTop !== before) {
            handled = true
            console.log('✅ Queue垂直滚动成功', {
              tagName: container.tagName,
              className: container.className,
              before,
              after: container.scrollTop
            })
          }
        })

        if (!handled) {
          console.log('ℹ️ Queue垂直滚动未找到可滚动的代码区域')
        }

      }),
      // Removed out of credits handler - unlimited credits in this version
    ]

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.filter(Boolean).forEach((cleanup) => cleanup())
    }
  }, [screenshots, showScreenshotPreviews, showToast, setView])

  return (
    <div ref={contentRef} className="w-full">
      <div className="w-full lg:w-1/2 opacity-controlled-bg rounded-xl border border-white/10 shadow-lg px-4 py-3 transition-colors">
        <div className="space-y-3 w-full">
          {showScreenshotPreviews && screenshots.length > 0 && (
            <ScreenshotQueue
              isLoading={false}
              screenshots={screenshots}
              onDeleteScreenshot={handleDeleteScreenshot}
            />
          )}

          <QueueCommands
            screenshotCount={screenshots.length}
            credits={credits}
          />
        </div>
      </div>
    </div>
  )
}

export default Queue
