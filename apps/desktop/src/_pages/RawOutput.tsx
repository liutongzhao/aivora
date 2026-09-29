import React, { useState, useEffect, useRef } from 'react'
import { useQueryClient } from "@tanstack/react-query"
import { Button } from '../components/ui/button'
import SolutionCommands from '../components/Solutions/SolutionCommands'
import ScreenshotQueue from '../components/Queue/ScreenshotQueue'
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"
import { useToast } from "../contexts/toast"

interface RawOutputData {
  type: 'programming' | 'multiple_choice' | 'single_choice' | 'debug'
  content: string
  timestamp: string
  model?: string
  language?: string
}

interface RawOutputProps {
  setView: (view: "queue" | "solutions" | "raw-output") => void
  credits: number
  onReturn?: () => void
}

export const RawOutput: React.FC<RawOutputProps> = ({ setView, credits, onReturn }) => {
  const queryClient = useQueryClient()
  const { showToast } = useToast()
  const [rawOutputData, setRawOutputData] = useState<RawOutputData | null>(null)
  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const [isResetting, setIsResetting] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // 🆕 从React Query cache读取原始输出数据
    const loadRawOutputFromCache = () => {
      try {
        console.log('🔍 [EVENT-DRIVEN] 从React Query cache读取原始输出数据...')
        const rawData = queryClient.getQueryData(["raw_output"]) as RawOutputData | null
        if (rawData) {
          console.log('✅ [EVENT-DRIVEN] 获取到原始输出数据:', {
            type: rawData.type,
            contentLength: rawData.content?.length,
            timestamp: rawData.timestamp,
            model: rawData.model
          })
          setRawOutputData(rawData)
        } else {
          console.log('⚠️ [EVENT-DRIVEN] 没有找到原始输出数据')
          setRawOutputData(null)
        }
      } catch (error) {
        console.error('❌ [EVENT-DRIVEN] 读取原始输出数据失败:', error)
        setRawOutputData(null)
      }
    }

    // 立即加载数据
    loadRawOutputFromCache()

    // 🚀 事件驱动：监听React Query cache变化，替代轮询
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      // 只监听raw_output相关的缓存变化
      if (event.query.queryKey[0] === 'raw_output') {
        console.log('🔔 [EVENT-DRIVEN] 检测到raw_output缓存变化，更新数据')
        loadRawOutputFromCache()
      }
    })

    console.log('✅ [EVENT-DRIVEN] RawOutput事件监听已启动，移除定时轮询')

    return () => {
      // 清理事件订阅
      unsubscribe()
      console.log('🔌 [EVENT-DRIVEN] RawOutput事件监听已清理')
    }
  }, [queryClient])

  useEffect(() => {
    // 🔧 宽度减少时，高度增加2倍
    let updateTimeout: NodeJS.Timeout | null = null
    let lastWidth = 0

    const updateDimensions = () => {
      if (contentRef.current) {
        const currentWidth = contentRef.current.clientWidth
        let contentHeight = contentRef.current.scrollHeight
        
        // 宽度减少时，高度增加2倍
        if (currentWidth < lastWidth) {
          contentHeight = contentHeight * 2
        }
        lastWidth = currentWidth
        
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
        
        if (updateTimeout) {
          clearTimeout(updateTimeout)
        }
        
        updateTimeout = setTimeout(() => {
          window.electronAPI.updateContentDimensions({
            height: contentHeight
          })
        }, 500)
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      updateDimensions()
    })
    
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
      lastWidth = contentRef.current.clientWidth
    }
    
    setTimeout(updateDimensions, 100)

    // 🆕 Set up event listeners - 与 Solutions 页面相同
    const cleanupFunctions = [
      // 重置视图事件
      window.electronAPI.onResetView(() => {
        console.log('🔄 RawOutput: 接收到重置视图事件')
        // Set resetting state first
        setIsResetting(true)

        // Remove queries - 清理缓存
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["problem_statement"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset raw output data
        setRawOutputData(null)

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),

      // 处理错误事件
      window.electronAPI.onSolutionError((error: string) => {
        showToast("处理失败", error, "error")
        console.error("Processing error:", error)
      }),

      // 处理无截图事件
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "无截图",
          "没有截图需要处理",
          "neutral"
        )
      }),

      // 原始输出更新事件（已存在）
      window.electronAPI.onRawOutputUpdate((data: RawOutputData) => {
        console.log('📊 RawOutput页面接收到原始输出数据:', data)
        setRawOutputData(data)
      }),

      // 🆕 水平滚动事件处理
      window.electronAPI.onScrollCodeHorizontal((data: { direction: string }) => {
        console.log('🔄 RawOutput收到水平滚动事件:', data)
        
        if (!data || !data.direction) {
          console.error('❌ RawOutput滚动数据无效:', data)
          return
        }
        
        // 查找代码容器并滚动 - 更精确的选择器
        const codeContainers = document.querySelectorAll('pre, code, [class*="syntax-highlighter"], [class*="SyntaxHighlighter"]')
        console.log('📦 RawOutput找到代码容器数量:', codeContainers.length)
        console.log('📦 RawOutput代码容器详情:', Array.from(codeContainers).map(c => ({
          tagName: c.tagName,
          className: c.className,
          scrollWidth: c.scrollWidth,
          clientWidth: c.clientWidth,
          canScroll: c.scrollWidth > c.clientWidth
        })))
        
        codeContainers.forEach((container) => {
          if (container instanceof HTMLElement && container.scrollWidth > container.clientWidth) {
            const scrollAmount = 100
            const currentScroll = container.scrollLeft
            
            if (data.direction === 'left') {
              container.scrollLeft = Math.max(0, currentScroll - scrollAmount)
              console.log(`⬅️ RawOutput左滚动: ${currentScroll} -> ${container.scrollLeft}`)
            } else if (data.direction === 'right') {
              const maxScroll = container.scrollWidth - container.clientWidth
              container.scrollLeft = Math.min(maxScroll, currentScroll + scrollAmount)
              console.log(`➡️ RawOutput右滚动: ${currentScroll} -> ${container.scrollLeft}`)
            }
          }
        })
      }),

      window.electronAPI.onScrollCodeVertical((data: { direction: string }) => {
        console.log('🔄 RawOutput收到垂直滚动事件:', data)

        if (!data || !data.direction) {
          console.error('❌ RawOutput垂直滚动数据无效:', data)
          return
        }

        const scrollAmount = 150
        const containers = document.querySelectorAll('pre, code, [class*="syntax"], [class*="highlight"], .overflow-y-auto, .overflow-y-scroll, [style*="overflow"], .prose')

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
            console.log('✅ RawOutput垂直滚动成功', {
              tagName: container.tagName,
              className: container.className,
              before,
              after: container.scrollTop
            })
          }
        })

        if (!handled) {
          console.log('ℹ️ RawOutput垂直滚动未找到可滚动的代码区域')
        }
      }),
    ]

    return () => {
      // 清理ResizeObserver
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight, queryClient, showToast])

  const handleTooltipVisibilityChange = (visible: boolean, height?: number) => {
    setIsTooltipVisible(visible)
    if (height !== undefined) {
      setTooltipHeight(height)
    }
  }


  // 如果正在重置，显示空状态
  if (isResetting) {
    return <div ref={contentRef} className="relative" />
  }

  return (
    <div ref={contentRef} className="relative">
      <div className="space-y-3 px-4 py-3">
        
        {/* Navbar of commands - 使用与 Solutions 页面相同的结构 */}
        <div className="top-area pointer-events-none">
          <SolutionCommands
            onTooltipVisibilityChange={handleTooltipVisibilityChange}
            isProcessing={false}
            extraScreenshots={[]}
            credits={credits}
          />
        </div>

        {/* Main Content - 与 Solutions 页面完全相同的结构 */}
        <div className="w-full text-sm text-black opacity-controlled-bg rounded-md pointer-events-none main-content">
          <div className="rounded-lg overflow-hidden">
            <div className="px-4 py-3 space-y-4 max-w-full">
              
              {/* 原始输出标题 */}
              <div className="space-y-2">
                <h2 className="text-[13px] font-medium text-white tracking-wide">
                  原始输出
                </h2>
              </div>

              {/* 原始内容显示 */}
              {rawOutputData ? (
                <div className="space-y-3">
                  <div className="relative">
                    <div 
                      className="raw-output-content"
                      style={{
                        backgroundColor: "var(--raw-code-bg)",
                        border: "1px solid var(--border-color)",
                        borderRadius: "8px",
                        padding: "1rem",
                        fontFamily: "Consolas, 'Courier New', monospace",
                        fontSize: "14px",
                        lineHeight: "1.4",
                        color: "var(--text-color)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-word",
                        overflowWrap: "break-word",
                        maxWidth: "100%",
                        // 🔧 动态高度，宽度变窄时自动增高
                        minHeight: "200px", // 最小高度
                        overflowX: "visible",
                        boxSizing: "border-box",
                        width: "100%"
                      }}
                    >
                      {rawOutputData.content}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="text-center py-8 bg-white/5 rounded-lg">
                    <div className="text-4xl mb-4">📄</div>
                    <h3 className="text-lg font-medium text-gray-300 mb-2">暂无原始输出数据</h3>
                    <p className="text-sm text-gray-400">
                      请先执行编程题或调试查询，然后按 Ctrl+L 查看原始输出<br/>
                      <span className="text-xs text-gray-500">注：单选题和多选题不提供原始输出</span><br/>
                      <span className="text-xs text-blue-400 mt-2 block">按 Ctrl+L 返回正常界面</span>
                    </p>
                  </div>
                </div>
              )}


            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default RawOutput
