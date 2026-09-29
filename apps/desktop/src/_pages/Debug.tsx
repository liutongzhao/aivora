// Debug.tsx
import { useQuery, useQueryClient } from "@tanstack/react-query"
import React, { useEffect, useRef, useState } from "react"
import ScreenshotQueue from "../components/Queue/ScreenshotQueue"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import { Screenshot } from "../types/screenshots"
import { ComplexitySection, ContentSection, SolutionSection } from "./Solutions"
import { useToast } from "../contexts/toast"
import { useLanguageConfig } from "../hooks/useLanguageConfig"
import { isMacOS, COMMAND_KEY } from "../utils/platform"


async function fetchScreenshots(): Promise<Screenshot[]> {
  try {
    const existing = await window.electronAPI.getScreenshots()
    console.log("Raw screenshot data in Debug - type:", typeof existing, "Array:", Array.isArray(existing), "Count:", existing?.length)
    return (Array.isArray(existing) ? existing : []).map((p) => ({
      id: p.path,
      path: p.path,
      preview: p.preview,
      timestamp: Date.now()
    }))
  } catch (error) {
    console.error("Error loading screenshots:", error)
    throw error
  }
}

// 🆕 解析调试内容的函数
function parseDebugContent(fullContent: string) {
  let code = ''
  let thoughts: string[] = []
  let timeComplexity = "基于调试分析"
  let spaceComplexity = "基于调试分析"
  let analysis = fullContent

  // 提取代码实现部分
  const codeImplMatch = fullContent.match(/\*\*代码实现：?\*\*[\s\S]*?```(?:\w+)?\s*([\s\S]*?)```/i)
  if (codeImplMatch) {
    code = codeImplMatch[1].trim()
  } else {
    // 后备方案：提取第一个代码块
    const codeMatch = fullContent.match(/```(?:\w+)?\s*([\s\S]*?)```/)
    if (codeMatch) {
      code = codeMatch[1].trim()
    } else {
      code = '// 调试模式 - 请查看下方的完整分析'
    }
  }

  // 只处理必要的Unicode转义序列，保持代码中的转义字符原样
  if (code && typeof code === 'string') {
    code = code
      .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .trim()
  }

  // 提取思路
  const thoughtsMatch = fullContent.match(/\*\*(?:解题思路|思路|分析思路)：?\*\*\s*([\s\S]*?)(?:\*\*|$)/i)
  if (thoughtsMatch) {
    const thoughtsText = thoughtsMatch[1].trim()
    thoughts = thoughtsText.split(/[-•]\s*/).filter(thought => thought.trim().length > 0).map(thought => thought.trim())
  }
  
  if (thoughts.length === 0) {
    thoughts = ["基于截图的调试分析"]
  }

  // 提取复杂度（去掉详细解释，只保留O(...)部分）
  const timeComplexityMatch = fullContent.match(/时间复杂度[：:]\s*(O\([^)]+\))/i)
  if (timeComplexityMatch) {
    timeComplexity = timeComplexityMatch[1]
  }

  const spaceComplexityMatch = fullContent.match(/空间复杂度[：:]\s*(O\([^)]+\))/i)
  if (spaceComplexityMatch) {
    spaceComplexity = spaceComplexityMatch[1]
  }

  return {
    code,
    thoughts,
    timeComplexity,
    spaceComplexity,
    analysis
  }
}

interface DebugProps {
  isProcessing: boolean
  setIsProcessing: (isProcessing: boolean) => void
}

const Debug: React.FC<DebugProps> = ({
  isProcessing,
  setIsProcessing
}) => {
  const [tooltipVisible, setTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)
  const { showToast } = useToast()
  const { language: currentLanguage } = useLanguageConfig()

  const { data: screenshots = [], refetch } = useQuery<Screenshot[]>({
    queryKey: ["screenshots"],
    queryFn: fetchScreenshots,
    staleTime: Infinity,
    gcTime: Infinity,
    refetchOnWindowFocus: false
  })

  const [newCode, setNewCode] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  const [debugAnalysis, setDebugAnalysis] = useState<string | null>(null)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [isStreaming, setIsStreaming] = useState<boolean>(false)

  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    // Try to get the new solution data from cache first
    const newSolution = queryClient.getQueryData(["new_solution"]) as {
      code: string
      debug_analysis: string
      thoughts: string[]
      time_complexity: string
      space_complexity: string
    } | null

    // If we have cached data, set all state variables to the cached data
    if (newSolution) {
      console.log("Found cached debug solution:", newSolution);
      
      // 🆕 检查缓存数据是否已经是解析后的结构化数据
      if (newSolution.thoughts && Array.isArray(newSolution.thoughts)) {
        // 已经是解析后的数据，直接使用
        console.log('✅ 缓存数据已解析，直接使用');
        setNewCode(newSolution.code || "// Debug mode");
        setThoughtsData(newSolution.thoughts);
        setTimeComplexityData(newSolution.time_complexity || "N/A");
        setSpaceComplexityData(newSolution.space_complexity || "N/A");
        setDebugAnalysis(newSolution.debug_analysis || newSolution.code);
      } else if (newSolution.code && typeof newSolution.code === 'string') {
        // 原始AI响应数据，需要解析
        console.log('🔧 缓存数据是原始AI响应，需要解析:', {
          contentLength: newSolution.code.length,
          contentPreview: newSolution.code.substring(0, 200)
        });
        
        const parsed = parseDebugContent(newSolution.code);
        
        console.log('🔍 缓存调试内容解析结果:', {
          hasCode: !!parsed.code,
          codeLength: parsed.code.length,
          thoughtsCount: parsed.thoughts.length
        });
        
        setNewCode(parsed.code);
        setThoughtsData(parsed.thoughts);
        setTimeComplexityData(parsed.timeComplexity);
        setSpaceComplexityData(parsed.spaceComplexity);
        setDebugAnalysis(parsed.analysis);
      }
      
      setIsProcessing(false)
    }

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(() => refetch()),
      window.electronAPI.onResetView(() => refetch()),
      window.electronAPI.onDebugSuccess((data) => {
        console.log("Debug success event received with data:", data);
        
        // 🆕 调试数据需要解析完整的AI响应内容
        if (data.code && typeof data.code === 'string') {
          console.log('🔧 调试模式收到完整AI响应，需要解析:', {
            contentLength: data.code.length,
            contentPreview: data.code.substring(0, 200)
          });
          
          // 使用parseDebugContent解析完整的AI响应
          const parsed = parseDebugContent(data.code);
          
          console.log('🔍 调试内容解析结果:', {
            hasCode: !!parsed.code,
            codeLength: parsed.code.length,
            thoughtsCount: parsed.thoughts.length,
            timeComplexity: parsed.timeComplexity,
            spaceComplexity: parsed.spaceComplexity
          });
          
          // 设置解析后的数据
          setNewCode(parsed.code);
          setThoughtsData(parsed.thoughts);
          setTimeComplexityData(parsed.timeComplexity);
          setSpaceComplexityData(parsed.spaceComplexity);
          setDebugAnalysis(parsed.analysis);
          
          // 更新queryClient缓存为解析后的结构化数据
          queryClient.setQueryData(["new_solution"], {
            code: parsed.code,
            thoughts: parsed.thoughts,
            time_complexity: parsed.timeComplexity,
            space_complexity: parsed.spaceComplexity,
            debug_analysis: parsed.analysis
          });
        } else {
          console.warn('⚠️ 调试数据格式异常:', data);
          setNewCode("// 调试数据格式异常");
          setThoughtsData(["调试数据解析失败"]);
          setTimeComplexityData("N/A");
          setSpaceComplexityData("N/A");
        }
        
        setIsProcessing(false);
      }),
      
      window.electronAPI.onDebugStart(() => {
        setIsProcessing(true)
        setIsStreaming(true)
        // 🆕 清空前端显示
        setNewCode(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
        setDebugAnalysis(null)
        setStreamingContent('')
      }),
      window.electronAPI.onDebugError((error: string) => {
        showToast(
          "Processing Failed",
          "There was an error debugging your code.",
          "error"
        )
        setIsProcessing(false)
        console.error("Processing error:", error)
      }),

      // 🆕 调试模式流式输出监听器
      window.electronAPI.onDebugStreamChunk?.((data: any) => {
        console.log('🌊 收到调试流式数据:', data);
        
        if (data.isComplete) {
          // 流式完成，解析最终内容
          const parsed = parseDebugContent(data.fullContent);
          setNewCode(parsed.code);
          setThoughtsData(parsed.thoughts);
          setTimeComplexityData(parsed.timeComplexity);
          setSpaceComplexityData(parsed.spaceComplexity);
          setDebugAnalysis(parsed.analysis);
          setIsProcessing(false);
          setIsStreaming(false);
          setStreamingContent('');
        } else {
          // 流式进行中，更新显示内容
          setStreamingContent(data.fullContent || '');
        }
      }) || (() => {})
    ]

    // 🆕 监听全局快捷键事件（来自主进程）
    const handleHorizontalScroll = (data: { direction: string }) => {
      console.log('🔄 Debug收到水平滚动事件:', data?.direction)
      
      if (!data || !data.direction) {
        console.error('❌ Debug滚动数据无效:', data)
        return
      }
      
      const scrollAmount = 100
      let totalScrolled = 0
      
      // 🚀 暴力滚动策略：尝试滚动所有可能包含代码的元素
      const selectors = [
        '.main-content',
        '.main-content > div',
        'pre',
        'code',
        '[class*="syntax"]',
        '[class*="highlight"]',
        '.pointer-events-none',
        '[style*="overflow"]',
        '[style*="width"]'
      ]
      
      console.log('🔍 Debug开始暴力滚动策略...')
      
      selectors.forEach((selector, selectorIndex) => {
        const elements = document.querySelectorAll(selector)
        console.log(`📦 Debug选择器"${selector}"找到${elements.length}个元素`)
        
        elements.forEach((element, elementIndex) => {
          if (element instanceof HTMLElement) {
            const beforeScroll = element.scrollLeft
            
            // 强制设置可滚动样式
            const originalOverflowX = element.style.overflowX
            element.style.overflowX = 'auto'
            
            // 尝试滚动
            if (data.direction === 'left') {
              element.scrollLeft = Math.max(0, beforeScroll - scrollAmount)
            } else {
              element.scrollLeft = beforeScroll + scrollAmount
            }
            
            const afterScroll = element.scrollLeft
            
            // 恢复原始样式
            if (originalOverflowX) {
              element.style.overflowX = originalOverflowX
            }
            
            if (afterScroll !== beforeScroll) {
              totalScrolled++
              console.log(`✅ Debug滚动成功！选择器${selectorIndex}元素${elementIndex}: ${beforeScroll} -> ${afterScroll}`)
              console.log(`   Debug元素信息:`, {
                tagName: element.tagName,
                className: element.className,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth
              })
            }
          }
        })
      })
      
      console.log(`📊 Debug暴力滚动总结: 总共成功滚动了${totalScrolled}个元素`)
    }

    // 监听来自主进程的水平滚动事件
    const unsubscribeScrolling = window.electronAPI.onScrollCodeHorizontal(handleHorizontalScroll)
    cleanupFunctions.push(unsubscribeScrolling)

    const handleVerticalScroll = (data: { direction: string }) => {
      console.log('🔄 Debug收到垂直滚动事件:', data?.direction)

      if (!data || !data.direction) {
        console.error('❌ Debug垂直滚动数据无效:', data)
        return
      }

      const scrollAmount = 150
      let totalScrolled = 0
      const selectors = [
        '.main-content',
        '.main-content > div',
        '.debug-result',
        '.overflow-y-auto',
        '.overflow-y-scroll',
        '[class*="scroll"]',
        '[style*="overflow"]',
        'pre',
        'code'
      ]

      selectors.forEach((selector, selectorIndex) => {
        const elements = document.querySelectorAll(selector)

        elements.forEach((element, elementIndex) => {
          if (!(element instanceof HTMLElement)) return
          if (element.scrollHeight <= element.clientHeight) return

          const beforeScroll = element.scrollTop
          const originalOverflowY = element.style.overflowY
          element.style.overflowY = 'auto'

          if (data.direction === 'up') {
            element.scrollTop = Math.max(0, beforeScroll - scrollAmount)
          } else {
            const maxScroll = element.scrollHeight - element.clientHeight
            element.scrollTop = Math.min(maxScroll, beforeScroll + scrollAmount)
          }

          const afterScroll = element.scrollTop

          if (originalOverflowY) {
            element.style.overflowY = originalOverflowY
          }

          if (afterScroll !== beforeScroll) {
            totalScrolled++
            console.log(`✅ Debug垂直滚动成功！选择器${selectorIndex}元素${elementIndex}: ${beforeScroll} -> ${afterScroll}`)
          }
        })
      })

      if (totalScrolled === 0) {
        console.log('ℹ️ Debug垂直滚动未命中元素，尝试滚动窗口')
        window.scrollBy({
          top: data.direction === 'up' ? -scrollAmount : scrollAmount,
          behavior: 'smooth'
        })
      }
    }

    const unsubscribeVerticalScrolling = window.electronAPI.onScrollCodeVertical(handleVerticalScroll)
    cleanupFunctions.push(unsubscribeVerticalScrolling)

    // Set up resize observer
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (tooltipVisible) {
          contentHeight += tooltipHeight
        }
        window.electronAPI.updateContentDimensions({
          width: contentWidth,
          height: contentHeight
        })
      }
    }

    const resizeObserver = new ResizeObserver(updateDimensions)
    if (contentRef.current) {
      resizeObserver.observe(contentRef.current)
    }
    updateDimensions()

    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [queryClient, setIsProcessing])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = screenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        refetch()
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
    }
  }

  return (
    <div ref={contentRef} className="relative">
      <div className="space-y-3 px-4 py-3">
      {/* Conditionally render the screenshot queue */}
      <div className="bg-transparent w-fit top-area pointer-events-none">
        <div className="pb-3">
          <div className="space-y-3 w-fit">
            <ScreenshotQueue
              screenshots={screenshots}
              onDeleteScreenshot={handleDeleteExtraScreenshot}
              isLoading={isProcessing}
            />
          </div>
        </div>
      </div>

      {/* Navbar of commands with the tooltip */}
      <div className="top-area pointer-events-none">
        <SolutionCommands
          screenshots={screenshots}
          onTooltipVisibilityChange={handleTooltipVisibilityChange}
          isProcessing={isProcessing}
          extraScreenshots={screenshots}
          credits={window.__CREDITS__}
        />
      </div>

      {/* Main Content */}
      <div className="w-full text-sm text-black opacity-controlled-bg rounded-md pointer-events-none main-content">
        <div className="rounded-lg overflow-hidden">
          <div className="px-4 py-3 space-y-4 max-w-full">
            {/* 完全复制Solutions的结构 */}
            {(newCode || isStreaming) && (
              <>
                <ContentSection
                  title={`我的思路 (${COMMAND_KEY} + 方向键滚动)${isStreaming ? ' - 正在生成...' : ''}`}
                  content={
                    thoughtsData && (
                      <div className="space-y-3">
                        <div className="space-y-1">
                          {thoughtsData.map((thought, index) => (
                            <div
                              key={index}
                              className={`flex items-start gap-2 ${isStreaming ? 'animate-fadeIn' : ''}`}
                            >
                              <div className={`w-1 h-1 rounded-full mt-2 shrink-0 ${
                                isStreaming ? 'bg-blue-400 animate-pulse' : 'bg-blue-400/80'
                              }`} />
                              <div className={isStreaming ? 'text-blue-100' : ''}>{thought}</div>
                            </div>
                          ))}
                          
                          {/* 流式模式下的思路生成提示 */}
                          {isStreaming && (
                            <div className="flex items-start gap-2 opacity-60">
                              <div className="w-1 h-1 rounded-full bg-blue-400 mt-2 shrink-0 animate-ping" />
                              <div className="text-blue-300 text-xs italic">思路分析中...</div>
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  }
                  isLoading={!thoughtsData && !isStreaming}
                />

                <SolutionSection
                  title={`调试代码 (${COMMAND_KEY} + Shift + ← → 水平滚动)`}
                  content={newCode}
                  isLoading={!newCode && !isStreaming}
                  currentLanguage={currentLanguage}
                  isStreaming={isStreaming}
                  streamingContent={streamingContent}
                />

                <ComplexitySection
                  timeComplexity={timeComplexityData}
                  spaceComplexity={spaceComplexityData}
                  isLoading={!timeComplexityData || !spaceComplexityData}
                />
              </>
            )}
          </div>
        </div>
      </div>
      </div>
    </div>
  )
}

export default Debug
