// Solutions.tsx
import React, { useState, useEffect, useRef } from "react"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter"
import { dracula } from "react-syntax-highlighter/dist/esm/styles/prism"

import ScreenshotQueue from "../components/Queue/ScreenshotQueue"

import { ProblemStatementData, SolutionData, MultipleChoiceAnswer } from "../types/solutions"
import SolutionCommands from "../components/Solutions/SolutionCommands"
import Debug from "./Debug"
import { useToast } from "../contexts/toast"
import { COMMAND_KEY } from "../utils/platform"
import { useLanguageConfig } from "../hooks/useLanguageConfig"
import { parseStreamedSolution, shouldStartDisplaying } from "@/utils/streamParser"
import { isMacOS } from "../utils/platform"
import { useAIProcessing } from "../hooks/useAIProcessing"
import { ProcessingStatus } from "../components/ProcessingStatus"

// CSS variables follow the existing theme classes, including live theme changes.
const codeColors: Record<string, string> = {
  '#f8f8f2': 'var(--text-color)',
  '#6272a4': 'var(--code-comment)',
  '#ff79c6': 'var(--code-property)',
  '#bd93f9': 'var(--code-number)',
  '#50fa7b': 'var(--code-string)',
  '#f1fa8c': 'var(--code-function)',
  '#8be9fd': 'var(--code-keyword)',
  '#ffb86c': 'var(--code-regex)'
}
const solutionCodeTheme = Object.fromEntries(
  Object.entries(dracula as Record<string, any>).map(([token, style]: [string, any]) => [token, {
    ...style,
    ...(style.color && { color: codeColors[style.color] || style.color }),
    textShadow: 'none'
  }])
)

const SOLUTION_PANEL_DEFAULT_HEIGHT = 800
const SOLUTION_PANEL_MIN_HEIGHT = 160
const SOLUTION_PANEL_MAX_HEIGHT = 1800
const SOLUTION_PANEL_OFFSET = 200

const clampSolutionPanelHeight = (value: number) =>
  Math.max(
    SOLUTION_PANEL_MIN_HEIGHT,
    Math.min(SOLUTION_PANEL_MAX_HEIGHT, value)
  )

const calculatePanelHeightFromViewport = () => {
  if (typeof window === 'undefined') {
    return SOLUTION_PANEL_DEFAULT_HEIGHT
  }
  return clampSolutionPanelHeight(window.innerHeight - SOLUTION_PANEL_OFFSET)
}

// 调试内容解析函数
function parseDebugContent(fullContent: string) {
  let code = ''
  let thoughts: string[] = []
  let timeComplexity = "基于调试分析"
  let spaceComplexity = "基于调试分析"

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
      code = '// 调试模式 - 请查看分析'
    }
  }

  // 只处理必要的Unicode转义序列，保持代码中的转义字符原样
  if (code && typeof code === 'string') {
    code = code
      .replace(/\\u([0-9a-fA-F]{4})/g, (match, hex) => String.fromCharCode(parseInt(hex, 16)))
      .trim()
  }

  // 提取思路
  const thoughtsMatch = fullContent.match(/\*\*(?:解题思路|思路|分析思路|问题分析)：?\*\*\s*([\s\S]*?)(?:\*\*|$)/i)
  if (thoughtsMatch) {
    const thoughtsText = thoughtsMatch[1].trim()
    thoughts = thoughtsText.split(/[-•]\s*/).filter(thought => thought.trim().length > 0).map(thought => thought.trim())
  }
  
  if (thoughts.length === 0) {
    thoughts = ["基于截图的调试分析"]
  }

  // 提取复杂度
  const timeComplexityMatch = fullContent.match(/时间复杂度[：:]?\s*(O\([^)]+\))/i)
  if (timeComplexityMatch) {
    timeComplexity = timeComplexityMatch[1]
  }

  const spaceComplexityMatch = fullContent.match(/空间复杂度[：:]?\s*(O\([^)]+\))/i)
  if (spaceComplexityMatch) {
    spaceComplexity = spaceComplexityMatch[1]
  }

  return {
    code,
    thoughts,
    timeComplexity,
    spaceComplexity
  }
}

export const ContentSection = ({
  title,
  content,
  isLoading
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
}) => (
  <div className="space-y-2">
    <h2 className="text-[13px] font-medium text-white tracking-wide">
      {title}
    </h2>
    {isLoading ? (
      <div className="mt-4 flex">
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          提取问题描述中...
        </p>
      </div>
    ) : (
      <div className="text-[13px] leading-[1.4] text-[color:var(--text-color)] max-w-[600px]">
        {content}
      </div>
    )}
  </div>
)
export const SolutionSection = ({
  title,
  content,
  isLoading,
  currentLanguage,
  // 🆕 流式相关属性
  isStreaming,
  streamingContent,
  streamingProgress,
  panelHeight = 440
}: {
  title: string
  content: React.ReactNode
  isLoading: boolean
  currentLanguage: string
  // 🆕 流式相关属性类型
  isStreaming?: boolean
  streamingContent?: string
  streamingProgress?: number
  panelHeight?: number
}) => {
  const [copied, setCopied] = useState(false)
  const [showCopyButton, setShowCopyButton] = useState(true)

  useEffect(() => {
    const fetchConfig = async () => {
      try {
        const config = await window.electronAPI.getConfig()
        setShowCopyButton(config.showCopyButton !== false)
      } catch (error) {
        console.error("Failed to load copy button config:", error)
      }
    }
    fetchConfig()
  }, [])

  const copyToClipboard = () => {
    // 🆕 优先复制流式内容，否则复制最终内容
    let textToCopy = content
    
    if (isStreaming && streamingContent) {
      if (currentLanguage === "text") {
        // 文本模式：直接复制完整内容
        textToCopy = streamingContent
      } else {
        // 代码模式：尝试提取代码部分
        const codeImplMatch = streamingContent.match(/\*\*代码实现：?\*\*[\s\S]*?```(?:\w+)?\s*([\s\S]*?)```/i)
        if (codeImplMatch) {
          textToCopy = codeImplMatch[1].trim()
        } else {
          // 后备方案：传统代码块提取
          const codeMatch = streamingContent.match(/```[\w]*\n?([\s\S]*?)(?:```|$)/)
          if (codeMatch && codeMatch[1]) {
            textToCopy = codeMatch[1].trim()
          } else {
            textToCopy = streamingContent
          }
        }
      }
    } else {
      // 非流式模式
      if (currentLanguage === "text") {
        // 文本模式：直接复制完整内容
        textToCopy = content
      }
    }
    
    if (typeof textToCopy === "string") {
      navigator.clipboard.writeText(textToCopy).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  // 决定显示什么内容：流式内容 > 最终内容
  let displayContent = (isStreaming && streamingContent) ? streamingContent : (content || '// 代码生成中...')
  
  const showStreamingIndicator = isStreaming && streamingProgress !== undefined
  
  return (
    <div className="client-solution-section space-y-2 relative">
      <h2 className="text-[13px] font-medium text-white tracking-wide flex items-center gap-2">
        {title}
        {/* 🆕 流式状态指示器 */}
        {showStreamingIndicator && (
          <div className="flex items-center gap-1 text-xs text-blue-400">
            <div className="w-1 h-1 bg-blue-400 rounded-full animate-pulse"></div>
            <span>正在生成... {streamingProgress}%</span>
          </div>
        )}
      </h2>
      {isLoading && !isStreaming ? (
        <div className="space-y-1.5">
          <div className="mt-4 flex">
            <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
              加载解决方案中...
            </p>
          </div>
        </div>
      ) : (
        <div className="w-full relative pointer-events-none opacity-controlled-bg rounded-md">
          {showCopyButton && (
            <button
              onClick={copyToClipboard}
              className="absolute top-2 right-2 text-xs text-white bg-white/10 hover:bg-white/20 rounded px-2 py-1 transition pointer-events-none z-10"
              tabIndex={-1}
              aria-hidden="true"
            >
              {copied ? "已复制!" : "复制"}
            </button>
          )}
          <div className="pointer-events-none rounded-md overflow-hidden">
            <div
              className="pointer-events-none"
              style={{
                height: `${panelHeight}px`,
                maxHeight: `${panelHeight}px`,
                overflowY: "auto",
                overflowX: "auto",
                borderRadius: "0.375rem",
                position: "relative"
              }}
            >
              {currentLanguage === "text" ? (
                <div
                  style={{
                    maxWidth: "100%",
                    width: "100%",
                    minWidth: 0,
                    margin: 0,
                    padding: "1rem",
                    whiteSpace: "pre-wrap",
                    overflowX: "hidden",
                    overflowWrap: "anywhere",
                    wordBreak: "break-word",
                    overflowY: "visible",
                    backgroundColor: "transparent",
                    userSelect: "none",
                    color: "var(--text-color)",
                    fontFamily: "ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                    fontSize: "14px",
                    lineHeight: "1.5",
                    ...(isStreaming && {
                      borderRight: "2px solid #3b82f6",
                      animation: "pulse 1.5s ease-in-out infinite"
                    })
                  }}
                  className={`pointer-events-none user-select-none ${isStreaming ? 'streaming-code' : ''}`}
                >
                  {typeof displayContent === 'string' ? displayContent : (displayContent as string)}
                </div>
              ) : (
                <SyntaxHighlighter
                  key={isStreaming ? `streaming-${streamingContent?.length || 0}` : 'static'}
                  showLineNumbers
                  language={
                    currentLanguage === "Go" || currentLanguage === "Golang" ? "go" :
                    currentLanguage === "JavaScript" ? "javascript" :
                    currentLanguage === "TypeScript" ? "typescript" :
                    currentLanguage === "Cpp" || currentLanguage === "C++" ? "cpp" :
                    currentLanguage === "Csharp" || currentLanguage === "C#" ? "csharp" :
                    currentLanguage === "Java" ? "java" :
                    currentLanguage === "Python" ? "python" :
                    currentLanguage === "Swift" ? "swift" :
                    currentLanguage === "Kotlin" ? "kotlin" :
                    currentLanguage === "Ruby" ? "ruby" :
                    currentLanguage === "Php" || currentLanguage === "PHP" ? "php" :
                    currentLanguage === "Scala" ? "scala" :
                    currentLanguage === "Rust" ? "rust" :
                    currentLanguage === "Sql" || currentLanguage === "SQL" ? "sql" :
                    currentLanguage === "R" ? "r" :
                    currentLanguage.toLowerCase()
                  }
                  style={solutionCodeTheme}
                  lineNumberStyle={{ color: 'var(--code-comment)' }}
                  customStyle={{
                    maxWidth: "none",
                    width: "100%",
                    minWidth: "600px",
                    margin: 0,
                    padding: "1rem",
                    whiteSpace: "pre",
                    overflowX: "auto",
                    overflowY: "visible",
                    backgroundColor: "transparent",
                    userSelect: "none",
                    ...(isStreaming && {
                      borderRight: "2px solid #3b82f6",
                      animation: "pulse 1.5s ease-in-out infinite"
                    })
                  }}
                  wrapLongLines={true}
                  className={`pointer-events-none ${isStreaming ? 'streaming-code' : ''}`}
                >
                  {typeof displayContent === 'string' ? displayContent : (displayContent as string)}
                </SyntaxHighlighter>
              )}

              {isStreaming && (
                <div className="pointer-events-none absolute bottom-2 right-2 flex items-center gap-1 text-xs text-blue-400 bg-black/50 px-2 py-1 rounded">
                  <div className="w-1 h-3 bg-blue-400 animate-pulse" />
                  <span>生成中...</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const ComplexitySection = ({
  timeComplexity,
  spaceComplexity,
  isLoading
}: {
  timeComplexity: string | null
  spaceComplexity: string | null
  isLoading: boolean
}) => {
  // Helper to ensure we have proper complexity values
  const formatComplexity = (complexity: string | null): string => {
    // Default if no complexity returned by LLM
    if (!complexity || complexity.trim() === "") {
      return "复杂度不可用";
    }

    const bigORegex = /O\([^)]+\)/i;
    // Return the complexity as is if it already has Big O notation
    if (bigORegex.test(complexity)) {
      return complexity;
    }
    
    // Concat Big O notation to the complexity
    return `O(${complexity})`;
  };
  
  const formattedTimeComplexity = formatComplexity(timeComplexity);
  const formattedSpaceComplexity = formatComplexity(spaceComplexity);
  
  return (
    <div className="space-y-2 pointer-events-none user-select-none">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        复杂度
      </h2>
      {isLoading ? (
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          计算复杂度中...
        </p>
      ) : (
        <div className="space-y-3">
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Time:</strong> {formattedTimeComplexity}
              </div>
            </div>
          </div>
          <div className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
            <div className="flex items-start gap-2">
              <div className="w-1 h-1 rounded-full bg-blue-400/80 mt-2 shrink-0" />
              <div>
                <strong>Space:</strong> {formattedSpaceComplexity}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// 选择题答案显示组件
export const MultipleChoiceSection = ({
  answers,
  isLoading
}: {
  answers: Array<{
    question_number: string;
    answer: string;
    reasoning?: string;
  }> | null;
  isLoading: boolean;
}) => {
  return (
    <div className="space-y-2 pointer-events-none user-select-none">
      <h2 className="text-[13px] font-medium text-white tracking-wide">
        答案
      </h2>
      {isLoading ? (
        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
          分析选择题中...
        </p>
      ) : (
        <div className="space-y-3">
          {answers?.map((answer, index) => (
            <div key={index} className="text-[13px] leading-[1.4] text-gray-100 bg-white/5 rounded-md p-3">
              <div className="flex items-start gap-2">
                <div className="w-1 h-1 rounded-full bg-green-400/80 mt-2 shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <strong>题目 {answer.question_number}:</strong>
                    <span className="bg-green-500/20 text-green-300 px-2 py-0.5 rounded text-xs font-semibold">
                      {answer.answer}
                    </span>
                  </div>
                  {answer.reasoning && (
                    <div className="text-gray-300 text-xs mt-1 max-h-[200px] overflow-y-auto whitespace-pre-wrap">
                      {answer.reasoning}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export interface SolutionsProps {
  setView: (view: "queue" | "solutions" | "debug" | "raw-output") => void
  credits: number
}
const Solutions: React.FC<SolutionsProps> = ({
  setView,
  credits
}) => {
  const queryClient = useQueryClient()
  const contentRef = useRef<HTMLDivElement>(null)
  const { language: currentLanguage } = useLanguageConfig()
  
  // 🆕 直接从useAIProcessing获取流式数据和状态信息
  const { 
    result: aiResult, 
    isProcessing, 
    isInitializing,
    requestId,
    progress,
    stage,
    message,
    error,
    debugCode 
  } = useAIProcessing()

  // 🔧 同步后端进度到本地的streamingProgress状态
  useEffect(() => {
    if (isProcessing || isInitializing) {
      setStreamingProgress(progress)
    }
  }, [progress, isProcessing, isInitializing])

  const [debugProcessing, setDebugProcessing] = useState(false)
  const [problemStatementData, setProblemStatementData] =
    useState<ProblemStatementData | null>(null)
  const [solutionData, setSolutionData] = useState<string | null>(null)
  const [thoughtsData, setThoughtsData] = useState<string[] | null>(null)
  const [timeComplexityData, setTimeComplexityData] = useState<string | null>(
    null
  )
  const [spaceComplexityData, setSpaceComplexityData] = useState<string | null>(
    null
  )
  const [multipleChoiceAnswers, setMultipleChoiceAnswers] = useState<MultipleChoiceAnswer[] | null>(null)

  // 🆕 流式输出状态管理
  const [isStreaming, setIsStreaming] = useState<boolean>(false)
  const [streamingContent, setStreamingContent] = useState<string>('')
  const [streamingProgress, setStreamingProgress] = useState<number>(0)
  const [streamingParsedData, setStreamingParsedData] = useState<any>(null)
  const [solutionPanelHeight, setSolutionPanelHeight] = useState<number>(
    calculatePanelHeightFromViewport
  )

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow
    const previousHtmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousBodyOverflow
      document.documentElement.style.overflow = previousHtmlOverflow
    }
  }, [])

  useEffect(() => {
    const handleResize = () => {
      setSolutionPanelHeight((prev) => {
        const next = calculatePanelHeightFromViewport()
        return next === prev ? prev : next
      })
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('resize', handleResize)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('resize', handleResize)
      }
    }
  }, [])

  // 🆕 防抖状态更新
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)


  const [isTooltipVisible, setIsTooltipVisible] = useState(false)
  const [tooltipHeight, setTooltipHeight] = useState(0)

  const [isResetting, setIsResetting] = useState(false)

  interface Screenshot {
    id: string
    path: string
    preview: string
    timestamp: number
  }

  const [extraScreenshots, setExtraScreenshots] = useState<Screenshot[]>([])

  // 🆕 直接监听aiResult变化，使用完全SSE直连架构（带防抖）
  useEffect(() => {
    console.log('🔍 [SOLUTIONS-DIRECT] useEffect触发，aiResult:', {
      hasAiResult: !!aiResult,
      hasContent: !!(aiResult && aiResult.content),
      isProcessing,
      isFormatted: aiResult?.isFormatted,
      hasFormattedData: !!(aiResult?.formatted),
      contentLength: aiResult?.content?.length
    })
    
    // 🆕 清除之前的防抖定时器
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current)
    }
    
    if (aiResult && aiResult.content) {
      console.log('🔥 [SOLUTIONS-DIRECT] 直接接收到AI结果，准备防抖处理')
      
      // 🆕 使用防抖机制，避免快速重复更新导致闪烁
      updateTimeoutRef.current = setTimeout(() => {
        console.log('⚡ [SOLUTIONS-DIRECT] 防抖触发，开始处理结果')
        
        try {
          if (aiResult.isFormatted && aiResult.formatted) {
            // 处理最终格式化数据
            console.log('✨ [SOLUTIONS-DIRECT] 处理最终格式化数据')
            setIsStreaming(false)
            setStreamingContent('')
            setStreamingParsedData(null)
            
            setSolutionData(aiResult.formatted.code)
            setThoughtsData(aiResult.formatted.thoughts)
            setTimeComplexityData(aiResult.formatted.timeComplexity)
            setSpaceComplexityData(aiResult.formatted.spaceComplexity)
            
            queryClient.setQueryData(["solution"], {
              code: aiResult.formatted.code,
              thoughts: aiResult.formatted.thoughts,
              time_complexity: aiResult.formatted.timeComplexity,
              space_complexity: aiResult.formatted.spaceComplexity,
              type: 'programming',
              isStreaming: false
            })
            
            console.log('✅ [SOLUTIONS-DIRECT] 最终格式化结果已设置')
            
          } else {
            // 处理完成的AI结果（非格式化数据）
            console.log('✅ [SOLUTIONS-DIRECT] AI处理已完成，设置最终结果显示')
            
            // 🔍 [DEBUG] 打印aiResult的完整结构用于调试
            console.log('🔍 [DEBUG] aiResult完整结构:', JSON.stringify(aiResult, null, 2))
            console.log('🔍 [DEBUG] aiResult类型字段:', {
              questionType: aiResult.questionType,
              type: aiResult.type,
              mode: aiResult.mode
            })
            
            setIsStreaming(false)
            setStreamingContent('')
            setStreamingParsedData(null)
            
            // 🆕 根据题目类型决定处理方式
            const questionType = aiResult.questionType || aiResult.type || 'programming'
            console.log('🎯 [SOLUTIONS-DIRECT] 确定的题目类型:', questionType)
            
            if (questionType === 'multiple_choice' || questionType === 'single_choice' || questionType === 'universal') {
              // 选择题/通用搜题处理 - 统一逻辑
              console.log(`🎯 [SOLUTIONS-DIRECT] 处理${questionType}结果`)
              setSolutionData(aiResult.content || aiResult.rawContent || '') // 在解决方案部分显示
              setThoughtsData(null)
              setTimeComplexityData(null)
              setSpaceComplexityData(null)
              setMultipleChoiceAnswers(null)
              
              queryClient.setQueryData(["solution"], {
                type: questionType,
                code: aiResult.content || aiResult.rawContent || '', // 让SolutionSection显示内容  
                isStreaming: false
              })
              
            } else {
              // 编程题处理（默认）
              console.log('💻 [SOLUTIONS-DIRECT] 处理编程题结果')
              
              // 优先使用后端已解析的数据
              if (aiResult.parsed) {
                console.log('✨ [SOLUTIONS-DIRECT] 使用后端解析的数据')
                setSolutionData(aiResult.parsed.code || '')
                setThoughtsData(aiResult.parsed.thoughts || [])
                setTimeComplexityData(aiResult.parsed.timeComplexity || null)
                setSpaceComplexityData(aiResult.parsed.spaceComplexity || null)
              } else {
                // 后备方案：客户端解析
                console.log('🔄 [SOLUTIONS-DIRECT] 使用客户端解析')
                const parsed = parseStreamedSolution(aiResult.content)
                setSolutionData(parsed.code)
                setThoughtsData(parsed.thoughts)
                setTimeComplexityData(parsed.time_complexity)
                setSpaceComplexityData(parsed.space_complexity)
              }
              
              // 使用实际设置的数据更新queryClient
              const finalCode = aiResult.parsed?.code || parseStreamedSolution(aiResult.content).code
              const finalThoughts = aiResult.parsed?.thoughts || parseStreamedSolution(aiResult.content).thoughts
              const finalTimeComplexity = aiResult.parsed?.timeComplexity || parseStreamedSolution(aiResult.content).time_complexity
              const finalSpaceComplexity = aiResult.parsed?.spaceComplexity || parseStreamedSolution(aiResult.content).space_complexity
              
              queryClient.setQueryData(["solution"], {
                code: finalCode,
                thoughts: finalThoughts,
                time_complexity: finalTimeComplexity,
                space_complexity: finalSpaceComplexity,
                type: 'programming',
                isStreaming: false
              })
            }
            
            queryClient.setQueryData(["raw_output"], {
              type: questionType,
              content: aiResult.content,
              timestamp: new Date().toISOString(),
              model: 'complete'
            })
            
            console.log('✅ [SOLUTIONS-DIRECT] 最终结果已设置完成')
          }
          
        } catch (error) {
          console.error('❌ [SOLUTIONS-DIRECT] 解析失败:', error)
        }
      }, 100) // 100ms防抖延迟
    }
    
    // 清理函数
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
      }
    }
  }, [aiResult, isProcessing, queryClient])

  // 🔍 [DEBUG] 监听solutionData变化
  useEffect(() => {
    console.log('🔍 [DEBUG] solutionData状态变化:', {
      hasSolutionData: !!solutionData,
      solutionDataLength: solutionData?.length || 0,
      solutionDataPreview: solutionData?.substring(0, 50) + '...' || 'null'
    })
  }, [solutionData])

  useEffect(() => {
    const fetchScreenshots = async () => {
      try {
        const existing = await window.electronAPI.getScreenshots()
        console.log("Raw screenshot data type:", typeof existing, "Array:", Array.isArray(existing), "Count:", existing?.length)
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        console.log("Processed screenshots count:", screenshots.length)
        setExtraScreenshots(screenshots)
      } catch (error) {
        console.error("Error loading extra screenshots:", error)
        setExtraScreenshots([])
      }
    }

    fetchScreenshots()
  }, [solutionData])

  const { showToast } = useToast()

  useEffect(() => {
    // Height update logic
    const updateDimensions = () => {
      if (contentRef.current) {
        let contentHeight = contentRef.current.scrollHeight
        const contentWidth = contentRef.current.scrollWidth
        if (isTooltipVisible) {
          contentHeight += tooltipHeight
        }
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

    // Set up event listeners
    const cleanupFunctions = [
      window.electronAPI.onScreenshotTaken(async () => {
        try {
          const existing = await window.electronAPI.getScreenshots()
          const screenshots = (Array.isArray(existing) ? existing : []).map(
            (p) => ({
              id: p.path,
              path: p.path,
              preview: p.preview,
              timestamp: Date.now()
            })
          )
          setExtraScreenshots(screenshots)
        } catch (error) {
          console.error("Error loading extra screenshots:", error)
        }
      }),
      window.electronAPI.onResetView(() => {
        // Set resetting state first
        setIsResetting(true)

        // Remove queries
        queryClient.removeQueries({
          queryKey: ["solution"]
        })
        queryClient.removeQueries({
          queryKey: ["new_solution"]
        })

        // Reset screenshots
        setExtraScreenshots([])

        // After a small delay, clear the resetting state
        setTimeout(() => {
          setIsResetting(false)
        }, 0)
      }),
      window.electronAPI.onSolutionStart(() => {
        // Every time processing starts, reset relevant states
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
        
        // 🆕 重置流式状态，但不设置为false，让流式事件自己控制
        // setIsStreaming(false) - 移除这行，让流式事件自己管理
        setStreamingContent('')
        setStreamingProgress(0)
        setStreamingParsedData(null)
      }),
      window.electronAPI.onProblemExtracted((data) => {
        queryClient.setQueryData(["problem_statement"], data)
      }),
      //if there was an error processing the initial solution
      window.electronAPI.onSolutionError((error: string) => {
        showToast("处理失败", error, "error")
        // Reset solutions in the cache (even though this shouldn't ever happen) and complexities to previous states
        const solution = queryClient.getQueryData(["solution"]) as {
          code: string
          thoughts: string[]
          time_complexity: string
          space_complexity: string
        } | null
        if (!solution) {
          setView("queue")
        }
        setSolutionData(solution?.code || null)
        setThoughtsData(solution?.thoughts || null)
        setTimeComplexityData(solution?.time_complexity || null)
        setSpaceComplexityData(solution?.space_complexity || null)
        console.error("Processing error:", error)
      }),
      //when the initial solution is generated, we'll set the solution data to that
      window.electronAPI.onSolutionSuccess((data) => {
        if (!data) {
          console.warn("Received empty or invalid solution data")
          return
        }
        console.log("📨 Received solution data:", { isStreaming: data.isStreaming, hasCode: !!data.code })
        
        // 🔍 [DEBUG] 打印完整数据结构用于调试
        console.log("🔍 [DEBUG] 完整数据结构:", JSON.stringify(data, null, 2))
        console.log("🔍 [DEBUG] 数据类型字段:", {
          type: data.type,
          questionType: data.questionType,
          mode: data.mode,
          isStreaming: data.isStreaming
        })

        // 🆕 根据是否为流式数据决定处理方式
        if (data.isStreaming) {
          console.log("🌊 处理流式数据")
          setIsStreaming(true)
          
          // 🔧 关键修复：流式数据也需要设置到React Query缓存中！
          queryClient.setQueryData(["solution"], {
            ...data,
            type: data.questionType || 'programming' // 保持原始类型
          })
          
          setStreamingParsedData({
            code: data.code,
            thoughts: data.thoughts,
            timeComplexity: data.time_complexity,
            spaceComplexity: data.space_complexity
          })
          return // 流式数据不设置最终状态
        }

        // 🆕 处理最终格式化结果
        console.log("✨ 处理最终结果，关闭流式状态")
        setIsStreaming(false)
        setStreamingContent('')
        setStreamingProgress(0)
        setStreamingParsedData(null)

        // 映射questionType到type字段以保持兼容性
        const mappedType = data.questionType || data.type || 'programming'
        const processedData = {
          ...data,
          type: mappedType
        }
        
        // Save original data to query cache, including type information
        queryClient.setQueryData(["solution"], processedData)

        // Set state based on data type
        if (mappedType === 'multiple_choice' || mappedType === 'single_choice') {
          // Multiple choice or single choice data processing
          console.log(`🎯 Processing ${mappedType === 'single_choice' ? 'single' : 'multiple'} choice data`)
          console.log('📊 Choice data details:', {
            hasAnswers: !!(data.answers || data.parsed?.answers),
            answersLength: (data.answers || data.parsed?.answers)?.length || 0,
            answersData: data.answers || data.parsed?.answers,
            hasThoughts: !!(data.thoughts || data.parsed?.thoughts),
            thoughtsLength: (data.thoughts || data.parsed?.thoughts)?.length || 0,
            thoughtsData: data.thoughts || data.parsed?.thoughts
          })
          setSolutionData(data.content || data.rawContent || '') // Choice questions show raw content
          setThoughtsData(data.thoughts || data.parsed?.thoughts || null)
          setTimeComplexityData(null) // Choice questions don't show complexity
          setSpaceComplexityData(null)
          setMultipleChoiceAnswers(data.answers || data.parsed?.answers || null)
        } else if (mappedType === 'universal') {
          // Universal search data processing - display raw content like choice questions
          console.log('🌐 Processing universal search data')
          console.log('📊 Universal data details:', {
            hasContent: !!data.content,
            contentLength: data.content?.length || 0,
            hasRawContent: !!data.rawContent,
            rawContentLength: data.rawContent?.length || 0,
            hasParsedThoughts: !!(data.parsed?.thoughts),
            parsedThoughtsLength: data.parsed?.thoughts?.length || 0
          })
          setSolutionData(null) // Universal doesn't show code
          // 优先使用parsed.thoughts，fallback到content或rawContent
          setThoughtsData(data.parsed?.thoughts || [data.content || data.rawContent || ''])
          setTimeComplexityData(null) // Universal doesn't show complexity
          setSpaceComplexityData(null)
          setMultipleChoiceAnswers(null) // Universal doesn't show choice answers
        } else {
          // Programming problem data processing
          console.log("💻 Processing programming problem data (覆盖流式内容)")
          console.log("💻 Code length:", data.code?.length)
          console.log("💻 Thoughts count:", data.thoughts?.length)
          setSolutionData(data.code || null)
          setThoughtsData(data.thoughts || null)
          setTimeComplexityData(data.time_complexity || null)
          setSpaceComplexityData(data.space_complexity || null)
          setMultipleChoiceAnswers(null)
        }

        // Fetch latest screenshots when solution is successful
        const fetchScreenshots = async () => {
          try {
            const existing = await window.electronAPI.getScreenshots()
            const screenshots =
              existing.previews?.map((p) => ({
                id: p.path,
                path: p.path,
                preview: p.preview,
                timestamp: Date.now()
              })) || []
            setExtraScreenshots(screenshots)
          } catch (error) {
            console.error("Error loading extra screenshots:", error)
            setExtraScreenshots([])
          }
        }
        fetchScreenshots()
      }),

      //########################################################
      //DEBUG EVENTS
      //########################################################
      window.electronAPI.onDebugStart(() => {
        //we'll set the debug processing state to true and use that to render a little loader
        setDebugProcessing(true)
      }),
      //the first time debugging works, we'll set the view to debug and populate the cache with the data
      window.electronAPI.onDebugSuccess((data) => {
        queryClient.setQueryData(["new_solution"], data)
        setDebugProcessing(false)
      }),
      //when there was an error in the initial debugging, we'll show a toast and stop the little generating pulsing thing.
      window.electronAPI.onDebugError(() => {
        showToast(
          "处理失败",
          "调试代码时发生错误",
          "error"
        )
        setDebugProcessing(false)
      }),
      window.electronAPI.onProcessingNoScreenshots(() => {
        showToast(
          "无截图",
          "没有额外的截图需要处理",
          "neutral"
        )
      }),
      // 代码复制快捷键监听器 - 使用主进程clipboard API
      window.electronAPI.onRequestCodeForCopy(() => {
        console.log("📥 Received request-code-for-copy event, executing copy logic...")
        
        // 获取当前 solution 数据
        const solution = queryClient.getQueryData(["solution"]) as any
        // 🆕 同时检查调试数据
        const debugSolution = queryClient.getQueryData(["new_solution"]) as any
        
        // 🆕 优先使用调试数据，如果没有则使用普通解决方案数据
        const currentSolution = debugSolution || solution
        const isDebugCode = !!debugSolution
        
        // 检查是否有编程题代码
        if (currentSolution?.code && typeof currentSolution.code === "string") {
          console.log(`✅ Found ${isDebugCode ? 'debug' : 'normal'} code, copying to clipboard via main process...`)
          
          // 使用主进程的clipboard API
          window.electronAPI.copyCodeToClipboard(currentSolution.code).then((result) => {
            if (result.success) {
              console.log("✅ Code copied successfully via main process")
              showToast(
                "复制成功",
                `${isDebugCode ? '调试' : ''}代码已复制到剪贴板`,
                "success"
              )
            } else {
              console.error("❌ Main process copy failed:", result.error)
              showToast(
                "复制失败",
                "无法复制代码到剪贴板",
                "error"
              )
            }
          }).catch((error) => {
            console.error("❌ Copy operation failed:", error)
            showToast(
              "复制失败",
              "无法复制代码到剪贴板",
              "error"
            )
          })
        } else {
          console.log("❌ No valid code found to copy")
          console.log("  - Normal solution:", !!solution?.code)
          console.log("  - Debug solution:", !!debugSolution?.code)
          showToast(
            "复制失败",
            "没有找到可复制的代码。请先搜题或调试生成代码。",
            "error"
          )
        }
      }),
      // Removed out of credits handler - unlimited credits in this version
      
      // 🗑️ 移除复杂的流式事件处理，现在通过onSolutionSuccess统一处理

      // 🗑️ 流式错误处理也简化了

      // 🆕 调试事件监听器
      window.electronAPI.onDebugStart(() => {
        setIsStreaming(true)
        setStreamingContent('')
        setStreamingProgress(0)
        // 清空现有数据
        setSolutionData(null)
        setThoughtsData(null)
        setTimeComplexityData(null)
        setSpaceComplexityData(null)
        setMultipleChoiceAnswers(null)
      }),

      window.electronAPI.onDebugStreamChunk?.((data: any) => {
        console.log('🌊 Solutions收到调试流式数据:', data);
        
        if (data.isComplete) {
          // 调试流式完成，解析最终内容
          setTimeout(() => {
            setIsStreaming(false)
            setStreamingProgress(100)
          }, 1500)
          
          // 解析调试内容
          if (data.fullContent) {
            const parsed = parseDebugContent(data.fullContent)
            setSolutionData(parsed.code)
            setThoughtsData(parsed.thoughts)
            setTimeComplexityData(parsed.timeComplexity)
            setSpaceComplexityData(parsed.spaceComplexity)
            setMultipleChoiceAnswers(null)
            
            // 缓存到queryClient
            queryClient.setQueryData(["solution"], {
              type: 'programming',
              code: parsed.code,
              thoughts: parsed.thoughts,
              time_complexity: parsed.timeComplexity,
              space_complexity: parsed.spaceComplexity
            })
          }
        } else {
          // 调试流式进行中
          setIsStreaming(true)
          setStreamingContent(data.fullContent || '')
          setStreamingProgress(data.progress || 0)
        }
      }) || (() => {}),
    ]

    // 🆕 监听全局快捷键事件（来自主进程）
    const handleHorizontalScroll = (data: { direction: string }) => {
      console.log('🔄 Solutions收到水平滚动事件:', data?.direction)
      
      if (!data || !data.direction) {
        console.error('❌ Solutions滚动数据无效:', data)
        return
      }
      
      const scrollAmount = 100
      let totalScrolled = 0
      
      // 🚀 暴力滚动策略：尝试滚动所有可能包含代码的元素
      const selectors = [
        '.main-content',                           // 主内容区域
        '.main-content > div',                     // 主内容的直接子div
        'pre',                                     // 所有pre元素
        'code',                                    // 所有code元素
        '[class*="syntax"]',                       // 包含syntax的类名
        '[class*="highlight"]',                    // 包含highlight的类名
        '.pointer-events-none',                    // 代码显示区域常用类
        '[style*="overflow"]',                     // 有overflow样式的元素
        '[style*="width"]'                         // 有width样式的元素
      ]
      
      console.log('🔍 开始暴力滚动策略...')
      
      selectors.forEach((selector, selectorIndex) => {
        const elements = document.querySelectorAll(selector)
        console.log(`📦 选择器"${selector}"找到${elements.length}个元素`)
        
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
              console.log(`✅ 滚动成功！选择器${selectorIndex}元素${elementIndex}: ${beforeScroll} -> ${afterScroll}`)
              console.log(`   元素信息:`, {
                tagName: element.tagName,
                className: element.className,
                scrollWidth: element.scrollWidth,
                clientWidth: element.clientWidth
              })
            }
          }
        })
      })
      
      console.log(`📊 Solutions暴力滚动总结: 总共成功滚动了${totalScrolled}个元素`)
    }

    // 监听来自主进程的水平滚动事件
    const unsubscribeScrolling = window.electronAPI.onScrollCodeHorizontal(handleHorizontalScroll)
    cleanupFunctions.push(unsubscribeScrolling)

    const handleVerticalScroll = (data: { direction: string }) => {
      console.log('🔄 Solutions收到垂直滚动事件:', data?.direction)

      if (!data || !data.direction) {
        console.error('❌ Solutions垂直滚动数据无效:', data)
        return
      }

      const scrollAmount = 150
      let totalScrolled = 0

      const selectors = [
        '.main-content',
        '.main-content > div',
        '.solution-output',
        '.solution-content',
        '.overflow-y-auto',
        '.overflow-y-scroll',
        '.prose',
        '[style*="overflow"]',
        '[class*="scroll"]',
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
            console.log(`✅ 垂直滚动成功！选择器${selectorIndex}元素${elementIndex}: ${beforeScroll} -> ${afterScroll}`)
          }
        })
      })

      if (totalScrolled === 0) {
        console.log('ℹ️ Solutions垂直滚动未找到可滚动的代码区域')
      } else {
        console.log(`📊 Solutions垂直滚动总结: 成功滚动了${totalScrolled}个元素`)
      }
    }

    const unsubscribeVerticalScrolling = window.electronAPI.onScrollCodeVertical(handleVerticalScroll)
    cleanupFunctions.push(unsubscribeVerticalScrolling)

    const handleSolutionHeightAdjust = (data: { direction: 'increase' | 'decrease' }) => {
      if (!data || !data.direction) {
        console.error('❌ Solutions高度调整数据无效:', data)
        return
      }

      const step = 40

      setSolutionPanelHeight(prev => {
        const next = data.direction === 'increase' ? prev + step : prev - step
        const clamped = clampSolutionPanelHeight(next)
        console.log('🔧 调整解决方案面板高度:', {
          direction: data.direction,
          previous: prev,
          next,
          clamped
        })
        return clamped
      })
    }

    const unsubscribeHeightAdjust = window.electronAPI.onAdjustSolutionHeight(handleSolutionHeightAdjust)
    cleanupFunctions.push(unsubscribeHeightAdjust)


    return () => {
      resizeObserver.disconnect()
      cleanupFunctions.forEach((cleanup) => cleanup())
    }
  }, [isTooltipVisible, tooltipHeight])

  useEffect(() => {
    setProblemStatementData(
      queryClient.getQueryData(["problem_statement"]) || null
    )
    
    // 正确处理初始解决方案数据
    const initialSolution = queryClient.getQueryData(["solution"]) as SolutionData | null
    if (initialSolution?.type === 'multiple_choice' || initialSolution?.type === 'single_choice') {
      // 选择题：使用code字段显示内容
      setSolutionData(initialSolution?.code ?? null)
      setThoughtsData(initialSolution?.thoughts ?? null)
      setTimeComplexityData(null)
      setSpaceComplexityData(null)
      setMultipleChoiceAnswers(initialSolution?.answers ?? null)
    } else if (initialSolution) {
      // 编程题：设置代码数据和复杂度数据
      setSolutionData(initialSolution?.code ?? null)
      setThoughtsData(initialSolution?.thoughts ?? null)
      setTimeComplexityData(initialSolution?.time_complexity ?? null)
      setSpaceComplexityData(initialSolution?.space_complexity ?? null)
      setMultipleChoiceAnswers(null)
    } else {
      // 没有数据：清空所有
      setSolutionData(null)
      setThoughtsData(null)
      setTimeComplexityData(null)
      setSpaceComplexityData(null)
      setMultipleChoiceAnswers(null)
    }

    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event?.query.queryKey[0] === "problem_statement") {
        setProblemStatementData(
          queryClient.getQueryData(["problem_statement"]) || null
        )
      }
      if (event?.query.queryKey[0] === "solution") {
        const solution = queryClient.getQueryData(["solution"]) as SolutionData | null

        // 根据解决方案类型处理不同的数据
        if (solution?.type === 'multiple_choice' || solution?.type === 'single_choice') {
          // 选择题：使用code字段显示内容
          setSolutionData(solution?.code ?? null)
          setThoughtsData(solution?.thoughts ?? null)
          setTimeComplexityData(null)
          setSpaceComplexityData(null)
          setMultipleChoiceAnswers(solution?.answers ?? null)
        } else {
          // 编程题：显示代码和复杂度
          setSolutionData(solution?.code ?? null)
          setThoughtsData(solution?.thoughts ?? null)
          setTimeComplexityData(solution?.time_complexity ?? null)
          setSpaceComplexityData(solution?.space_complexity ?? null)
          setMultipleChoiceAnswers(null)
        }
      }
    })
    return () => unsubscribe()
  }, [queryClient])

  const handleTooltipVisibilityChange = (visible: boolean, height: number) => {
    setIsTooltipVisible(visible)
    setTooltipHeight(height)
  }

  const handleDeleteExtraScreenshot = async (index: number) => {
    const screenshotToDelete = extraScreenshots[index]

    try {
      const response = await window.electronAPI.deleteScreenshot(
        screenshotToDelete.path
      )

      if (response.success) {
        // Fetch and update screenshots after successful deletion
        const existing = await window.electronAPI.getScreenshots()
        const screenshots = (Array.isArray(existing) ? existing : []).map(
          (p) => ({
            id: p.path,
            path: p.path,
            preview: p.preview,
            timestamp: Date.now()
          })
        )
        setExtraScreenshots(screenshots)
      } else {
        console.error("Failed to delete extra screenshot:", response.error)
        showToast("错误", "删除截图失败", "error")
      }
    } catch (error) {
      console.error("Error deleting extra screenshot:", error)
      showToast("Error", "Failed to delete the screenshot", "error")
    }
  }

  return (
    <>
      {!isResetting && queryClient.getQueryData(["new_solution"]) ? (
        <Debug
          isProcessing={debugProcessing}
          setIsProcessing={setDebugProcessing}
        />
      ) : (
        <div ref={contentRef} className="relative">
          <div className="space-y-3 px-4 py-3">
          {/* Screenshot queue is only shown while waiting for a solution */}
          {!solutionData && !multipleChoiceAnswers && !isStreaming && (
            <div className="bg-transparent w-fit top-area pointer-events-none">
              <div className="pb-3">
                <div className="space-y-3 w-fit">
                  <ScreenshotQueue
                    isLoading={debugProcessing}
                    screenshots={extraScreenshots}
                    onDeleteScreenshot={handleDeleteExtraScreenshot}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Processing Status - 显示调试模式等状态信息 */}
          {(isProcessing || isInitializing || error) && (
            <div className="mb-3">
              <ProcessingStatus
                isProcessing={isProcessing}
                isInitializing={isInitializing}
                progress={progress}
                stage={stage}
                message={message}
                error={error}
                requestId={requestId || ''}
                className="mx-0"
              />
            </div>
          )}

          {/* Navbar of commands with the SolutionsHelper */}
          <div className="top-area pointer-events-none">
            <SolutionCommands
              onTooltipVisibilityChange={handleTooltipVisibilityChange}
              isProcessing={!problemStatementData || (!solutionData && !multipleChoiceAnswers && !isStreaming)}
              extraScreenshots={extraScreenshots}
              credits={credits}
            />
          </div>

          {/* Main Content - Modified width constraints */}
          <div className="w-full text-sm text-black opacity-controlled-bg rounded-md pointer-events-none main-content">
            <div className="rounded-lg overflow-hidden">
              <div className="px-4 py-3 space-y-4 max-w-full">
                {!solutionData && !multipleChoiceAnswers && !isStreaming && (
                  <>
                    <ContentSection
                      title="问题描述"
                      content={problemStatementData?.problem_statement}
                      isLoading={!problemStatementData}
                    />
                    {problemStatementData && (
                      <div className="mt-4 flex">
                        <p className="text-xs bg-gradient-to-r from-gray-300 via-gray-100 to-gray-300 bg-clip-text text-transparent animate-pulse">
                          生成解决方案中...
                        </p>
                      </div>
                    )}
                  </>
                )}

                {(solutionData || multipleChoiceAnswers || isStreaming) && (
                  <>
                    {/* 🚫 正常界面不显示思路 - 思路只在原始输出界面(Ctrl+L)显示 */}

                    {/* 解决方案显示 - 支持编程题代码和选择题/通用搜题文本 */}
                    {(solutionData || (isStreaming && streamingContent)) && (
                      <>
                        {/* 检查是否为选择题或通用搜题，使用不同的显示方式 */}
                        {(() => {
                          const solutionType = (queryClient.getQueryData(["solution"]) as SolutionData | undefined)?.type
                          console.log('🔍 [DEBUG] 解决方案类型:', solutionType)
                          
                          if (solutionType === 'single_choice' || solutionType === 'multiple_choice' || solutionType === 'universal') {
                            // 选择题/通用搜题：使用类似编程题的显示方式
                            return (
                              <SolutionSection
                                title="解决方案"
                                content={solutionData}
                                isLoading={!solutionData && !isStreaming}
                                currentLanguage="text" // 使用纯文本模式
                                // 🆕 传递流式相关属性
                                isStreaming={isStreaming}
                                streamingContent={streamingContent}
                                streamingProgress={streamingProgress}
                                panelHeight={solutionPanelHeight}
                              />
                            )
                          } else {
                            // 编程题：使用代码高亮
                            return (
                              <SolutionSection
                                title={`解决方案 (${COMMAND_KEY} + Shift + ← → 水平滚动)`}
                                content={solutionData}
                                isLoading={!solutionData && !isStreaming}
                                currentLanguage={currentLanguage}
                                // 🆕 传递流式相关属性
                                isStreaming={isStreaming}
                                streamingContent={streamingContent} // 直接传递原始流式内容
                                streamingProgress={streamingProgress}
                                panelHeight={solutionPanelHeight}
                              />
                            )
                          }
                        })()}

                        <ComplexitySection
                          timeComplexity={timeComplexityData}
                          spaceComplexity={spaceComplexityData}
                          isLoading={!timeComplexityData || !spaceComplexityData}
                        />
                      </>
                    )}

                    {/* 选择题显示答案 */}
                    {multipleChoiceAnswers && multipleChoiceAnswers.length > 0 && (
                      <MultipleChoiceSection
                        answers={multipleChoiceAnswers}
                        isLoading={!multipleChoiceAnswers}
                      />
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      )}
    </>
  )
}

export default Solutions
