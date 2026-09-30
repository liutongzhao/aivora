// useAIProcessing.ts - AI处理状态管理Hook（SSE版本）
import { useCallback, useEffect, useRef } from 'react'
import { aiService, ProcessingOptions, ProcessingStatus, AIProcessResult } from '../services/aiService'
import { sseService } from '../services/sseService'
import { useOptimizedState } from './useOptimizedState'
// ✅ WebSocket已完全移除，现在使用SSE进行实时通信

// 🆕 客户端格式化函数
function parseCompleteContent(content: string) {
  let code = ''
  let thoughts: string[] = []
  let timeComplexity = ''
  let spaceComplexity = ''

  // 提取代码实现部分
  const codeImplMatch = content.match(/\*\*代码实现：?\*\*[\s\S]*?```(?:\w+)?\s*([\s\S]*?)```/i)
  if (codeImplMatch) {
    code = codeImplMatch[1].trim()
  } else {
    // 后备方案：提取第一个代码块
    const codeMatch = content.match(/```(?:\w+)?\s*([\s\S]*?)```/)
    if (codeMatch) {
      code = codeMatch[1].trim()
    }
  }

  // 提取思路
  const thoughtsMatch = content.match(/\*\*(?:代码思路|解题思路|思路|分析思路)：?\*\*\s*([\s\S]*?)(?:\*\*|$)/i)
  if (thoughtsMatch) {
    const thoughtsText = thoughtsMatch[1].trim()
    thoughts = thoughtsText.split(/[-•]\s*/).filter(thought => thought.trim().length > 0).map(thought => thought.trim())
  }

  // 提取复杂度 - 直接查找标识行
  const lines = content.split('\n')
  for (const line of lines) {
    if (line.includes('时间复杂度') && !timeComplexity) {
      // 提取冒号后的内容
      const parts = line.split(/[：:]/)
      if (parts.length > 1) {
        timeComplexity = parts[1].trim()
      }
    }
    if (line.includes('空间复杂度') && !spaceComplexity) {
      // 提取冒号后的内容  
      const parts = line.split(/[：:]/)
      if (parts.length > 1) {
        spaceComplexity = parts[1].trim()
      }
    }
  }
  
  console.log('🔍 [PARSE] 复杂度提取结果:', { timeComplexity, spaceComplexity })

  return {
    code,
    thoughts,
    timeComplexity,
    spaceComplexity
  }
}

interface AIProcessingState {
  isProcessing: boolean
  isInitializing: boolean
  requestId: string | null
  status: ProcessingStatus | null
  result: AIProcessResult | null
  error: any | null
  progress: number
  stage: string
  message: string
}

export interface UseAIProcessingReturn extends AIProcessingState {
  processScreenshot: (screenshot: string | string[], options?: ProcessingOptions) => Promise<void>
  debugCode: (screenshot: string, code?: string, language?: string) => Promise<void>
  cancelProcessing: () => Promise<void>
  clearError: () => void
  clearResult: () => void
  retryProcessing: () => Promise<void>
}

/**
 * AI处理状态管理Hook
 * 重构为使用SSE（Server-Sent Events）进行实时状态更新
 * 提供更简单稳定的实时通信，替代WebSocket方案
 */
export function useAIProcessing(): UseAIProcessingReturn {
  // 🚀 使用优化的状态管理减少不必要的重渲染
  const [state, setState] = useOptimizedState<AIProcessingState>({
    isProcessing: false,
    isInitializing: false,
    requestId: null,
    status: null,
    result: null,
    error: null,
    progress: 0,
    stage: 'idle',
    message: '就绪'
  })

  // 保存最后的处理参数，用于重试
  const lastProcessingParams = useRef<{
    type: 'screenshot' | 'debug'
    screenshot: string | string[]
    options?: ProcessingOptions
    code?: string
    language?: string
  } | null>(null)
  
  // 🚀 保存轮询清理函数
  const pollingCleanupRef = useRef<(() => void) | null>(null)

  // 流式内容累积（用于SSE实时内容更新）
  const streamingContent = useRef<string>('')
  const streamingFields = useRef<{
    code: string
    explanation: string
    answer?: string
    answers?: string[]
  }>({ code: '', explanation: '' })
  const currentQuestionType = useRef<ProcessingOptions['forceQuestionType']>('programming')
  
  // 🆕 防重入锁：防止多次同时清除导致状态竞争
  const isClearingRef = useRef<boolean>(false)
  
  // SSE状态更新处理函数
  const handleStatusUpdate = useCallback((status: ProcessingStatus) => {
    console.log('🌊 [SSE-HOOK] 收到AI处理状态更新:', {
      requestId: status.requestId,
      stage: status.stage,
      progress: status.progress,
      status: status.status,
      currentRequestId: state.requestId,
      matches: status.requestId === state.requestId,
      hasResult: !!status.result
    })
    
    // 只处理与当前请求相关的更新
    if (!state.requestId || status.requestId === state.requestId) {
      const isInsufficientCredits =
        status.stage === 'insufficient_credits' ||
        /insufficient/i.test(status.message || '') ||
        (typeof status.error === 'string' && /credit/i.test(status.error)) ||
        (status.error?.message && /积分不足|insufficient/i.test(status.error.message))

      if (isInsufficientCredits) {
        const friendlyMessage =
          status.message ||
          status.error?.message ||
          '积分不足，请前往配置页充值后再试'

        console.warn('⛔ [SSE] 积分不足，终止处理:', friendlyMessage)

        setState(prev => ({
          ...prev,
          isProcessing: false,
          isInitializing: false,
          stage: 'error',
          message: friendlyMessage,
          error: { message: friendlyMessage }
        }))

        sseService.disconnect()
        return
      }

      console.log('✅ [SSE] 状态更新匹配，更新UI状态')
      
      setState(prev => ({
        ...prev,
        status,
        progress: status.progress,
        stage: status.stage,
        message: status.message,
        // 🔧 流式阶段不覆盖result，让content_update事件来管理result
        result: (status.status === 'processing' && status.stage === 'ai_streaming' && !status.result) 
          ? prev.result // 流式阶段保持现有result
          : status.result || prev.result, // 其他情况正常更新
        error: status.error || prev.error,
        isProcessing: status.status === 'processing' || status.status === 'queued',
        isInitializing: false
      }))

      // 处理完成或错误时的后续操作
      if (status.status === 'completed' && status.result) {
        console.log('🎉 [SSE] AI处理完成，显示结果')
        setState(prev => ({
          ...prev,
          isProcessing: false,
          result: status.result!
        }))
        
        // 断开SSE连接
        sseService.disconnect()
        
      } else if (status.status === 'error') {
        console.error('❌ [SSE] AI处理失败:', status.error)
        setState(prev => ({
          ...prev,
          isProcessing: false,
          error: status.error
        }))
        
        // 断开SSE连接
        sseService.disconnect()
      } else if (status.status === 'cancelled') {
        console.log('🚫 [SSE] AI处理被取消')
        setState(prev => ({
          ...prev,
          isProcessing: false,
          isInitializing: false,
          message: status.message || '处理已取消',
          stage: 'cancelled',
          requestId: null
        }))
        sseService.disconnect()
      } else {
        console.log(`🔄 [SSE] 处理中... 阶段: ${status.stage}, 进度: ${status.progress}%`)
      }
    } else {
      console.log('⚠️ [SSE] 状态更新不匹配当前请求，忽略')
    }
  }, [state.requestId])
  
  // SSE内容更新处理函数（流式显示 + 完成时格式化）
  const handleContentUpdate = useCallback(async (content: string, append: boolean) => {
    console.log('🌊 [SSE-HOOK] 收到内容更新, 长度:', content.length)
    console.log('🔍 [SSE-HOOK] 内容前200字符:', JSON.stringify(content.substring(0, 200)))
    
    streamingContent.current = append ? streamingContent.current + content : content
    
    // 更新内部state
    setState(prev => {
      console.log('📝 [SSE-HOOK] 更新流式结果状态, 当前isProcessing:', prev.isProcessing)
      return {
        ...prev,
        result: {
          content: streamingContent.current,
          questionType: currentQuestionType.current,
          type: currentQuestionType.current,
          stage: 'processing'
        }
      }
    })
  }, [])

  const handleFieldUpdate = useCallback((event: {
    type: 'code_delta' | 'explanation_delta' | 'answer_set'
    field: string
    delta?: string
    value?: string | string[]
  }) => {
    const fields = streamingFields.current
    if (event.type === 'code_delta') {
      fields.code += event.delta || ''
    } else if (event.type === 'explanation_delta') {
      fields.explanation += event.delta || ''
    } else if (event.field === 'answers' && Array.isArray(event.value)) {
      fields.answers = event.value
    } else if (event.field === 'answer' && typeof event.value === 'string') {
      fields.answer = event.value
    }

    const parsed = {
      question_type: currentQuestionType.current,
      ...(fields.code ? { code: fields.code } : {}),
      ...(fields.explanation ? { explanation: fields.explanation } : {}),
      ...(fields.answer ? { answer: fields.answer } : {}),
      ...(fields.answers ? { answers: fields.answers } : {}),
    }
    setState(prev => ({
      ...prev,
      result: {
        ...prev.result,
        content: fields.code || streamingContent.current,
        questionType: currentQuestionType.current,
        type: currentQuestionType.current,
        parsed,
        stage: 'processing',
      }
    }))
  }, [])

  // 🆕 处理完成后的格式化（从handleProcessingComplete调用）
  const performClientFormatting = useCallback(async (result: AIProcessResult) => {
    if (!result) {
      const message = '模型没有返回有效答案，请重新截图后重试'
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isInitializing: false,
        stage: 'error',
        message,
        error: { code: 'EMPTY_AI_RESULT', message }
      }))
      sseService.disconnect()
      return
    }

    console.log('🔚 [SSE-HOOK] 处理完成，检查后端解析结果:', result.parsed)
    console.log('🔚 [SSE-HOOK] 结果类型:', result.questionType, '内容预览:', result.content?.substring(0, 200))
    
    try {
      // 🆕 根据题目类型处理不同的数据格式
      if (result.questionType === 'single_choice' || result.questionType === 'multiple_choice' || result.questionType === 'universal') {
        setState(prev => ({
          ...prev,
          result: {
            ...result,
            isFormatted: true,
            timestamp: Date.now()
          },
          isProcessing: false
        }))
      } else {
        // 编程题：进行代码格式化
        let formatted: any
        
        if (result.parsed) {
          // 🆕 优先使用后端已经解析好的数据
          formatted = {
            code: result.parsed.code || '',
            thoughts: result.parsed.thoughts || [],
            timeComplexity: result.parsed.timeComplexity || 'O(n)',
            spaceComplexity: result.parsed.spaceComplexity || 'O(1)'
          }
          console.log('✨ [SSE-HOOK] 使用后端解析数据:', formatted)
        } else {
          // 备用方案：客户端解析流式内容
          const finalContent = streamingContent.current || result.content || ''
          formatted = parseCompleteContent(finalContent)
          console.log('✨ [SSE-HOOK] 使用客户端解析数据:', formatted)
        }
        
        // 直接更新state为格式化结果
        setState(prev => ({
          ...prev,
          result: {
            content: formatted.code,
            type: 'programming',
            stage: 'completed',
            isFormatted: true,
            formatted: {
              code: formatted.code,
              thoughts: formatted.thoughts,
              timeComplexity: formatted.timeComplexity,
              spaceComplexity: formatted.spaceComplexity
            },
            timestamp: Date.now()
          },
          isProcessing: false
        }))
      }
      
      console.log('✅ [SSE-HOOK] 格式化结果已更新到state')
      
    } catch (error) {
      console.error('❌ [SSE-HOOK] 格式化失败:', error)
      const message = '答案解析失败，请重新截图后重试'
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isInitializing: false,
        stage: 'error',
        message,
        error: {
          code: 'RESULT_FORMATTING_FAILED',
          message
        }
      }))
      sseService.disconnect()
    }
  }, [])
  
  // SSE处理完成处理函数
  const handleProcessingComplete = useCallback(async (result: AIProcessResult | null) => {
    console.log('🎉 [SSE] 处理完成，准备进行格式化')
    
    // 🆕 统一格式化处理，优先使用后端解析数据
    await performClientFormatting(result as AIProcessResult)
    
    // 清理
    streamingContent.current = ''
    sseService.disconnect()
  }, [performClientFormatting])
  
  // 🆕 SSE最终结果处理函数（用于选择题等不需要流式传输的结果）
  const handleFinalResult = useCallback(async (result: AIProcessResult | null) => {
    console.log('🎯 [SSE] 收到最终结果，直接显示:', result?.questionType)
    
    // 直接格式化并显示结果
    await performClientFormatting(result as AIProcessResult)
    
    // 清理
    streamingContent.current = ''
    sseService.disconnect()
  }, [performClientFormatting])
  
  // SSE错误处理函数
  const handleSSEError = useCallback((error: string) => {
    console.error('❌ [SSE] 处理错误:', error)
    setState(prev => ({
      ...prev,
      isProcessing: false,
      error: { message: error }
    }))
    
    // 重置流式内容
    streamingContent.current = ''
    
    // 断开SSE连接
    sseService.disconnect()
  }, [])

  // 🗑️ 简化：移除复杂的流式传输处理函数

  // SSE事件监听设置
  useEffect(() => {
    console.log('🌊 [SSE-HOOK] 设置事件监听器')
    
    // 🔧 简化的SSE事件监听器
    sseService.onProcessingStatusUpdate(handleStatusUpdate)
    sseService.onContentUpdate(handleContentUpdate)  // 🔥 核心：处理流式内容
    sseService.onFieldUpdate(handleFieldUpdate)
    sseService.onProcessingComplete(handleProcessingComplete)  // 🆕 处理完成时进行客户端格式化
    sseService.onFinalResult(handleFinalResult)  // 🆕 处理最终结果（选择题等）
    sseService.onError(handleSSEError)
    
    console.log('✅ [SSE-HOOK] 事件监听器设置完成')
    
    // 清理函数
    return () => {
      console.log('🧹 [SSE-HOOK] 清理事件监听器')
      sseService.offProcessingStatusUpdate(handleStatusUpdate)
      sseService.offContentUpdate(handleContentUpdate)
      sseService.offFieldUpdate(handleFieldUpdate)
      sseService.offProcessingComplete(handleProcessingComplete)
      sseService.offFinalResult(handleFinalResult)
      sseService.offError(handleSSEError)
    }
  }, [handleStatusUpdate, handleContentUpdate, handleFieldUpdate, handleProcessingComplete, handleFinalResult, handleSSEError])

  /**
   * 处理截图
   */
  const processScreenshot = useCallback(async (
    screenshot: string | string[], 
    options?: ProcessingOptions
  ) => {
    if (state.isProcessing) {
      console.log('⚠️ AI正在处理中，忽略新请求')
      return
    }

    try {
      const isMultiScreenshot = Array.isArray(screenshot)
      const screenshotArray = Array.isArray(screenshot) ? screenshot : [screenshot]
      
      console.log('🚀 [HOOK] 开始处理截图...', {
        isMultiScreenshot,
        screenshotCount: screenshotArray.length,
        firstScreenshotLength: screenshotArray[0]?.length,
        firstScreenshotPrefix: screenshotArray[0]?.substring(0, 50),
        isBase64: screenshotArray[0]?.startsWith('data:image/'),
        hasComma: screenshotArray[0]?.includes(','),
        options
      })
      
      // 🚀 清理之前的轮询（如果存在）
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current()
        pollingCleanupRef.current = null
        console.log('🔌 [DYNAMIC-POLL] 清理之前的轮询')
      }
      
      // 保存处理参数用于重试
      streamingContent.current = ''
      streamingFields.current = { code: '', explanation: '' }
      currentQuestionType.current = options?.forceQuestionType || 'programming'
      lastProcessingParams.current = {
        type: 'screenshot',
        screenshot,
        options
      }
      
      // 🆕 发送solution start事件，触发界面切换
      console.log('📤 [SSE] 发送solution start事件，切换界面到solutions')
      if (window.electronAPI?.sendSolutionStart) {
        window.electronAPI.sendSolutionStart()
      }
      
      // 初始化状态
      setState(prev => ({
        ...prev,
        isProcessing: true,
        isInitializing: true,
        requestId: null,
        result: null,
        error: null,
        progress: 0,
        stage: 'initializing',
        message: '正在初始化...'
      }))

      // 🆕 使用新的SSE方式发送处理请求，根据题目类型设置mode
      const mode = options?.forceQuestionType || 'programming'
      console.log('🎯 [SSE] 发送请求，mode:', mode, 'options:', options)
      const response = await aiService.processScreenshotSSE(
        screenshot,
        mode,
        { language: options?.preferredLanguage }
      )
      
      if (response.success && response.task_id) {
        console.log(`✅ [SSE] AI处理请求已提交: ${response.task_id}`)
        
        setState(prev => ({
          ...prev,
          requestId: response.task_id!,
          isInitializing: false,
          stage: 'connecting',
          message: '正在建立实时连接...'
        }))

        // 🆕 建立SSE连接来接收实时更新
        try {
          console.log('🌊 [SSE] 建立流式连接...')
          const sseResult = await sseService.connectToStream(response.task_id!, response.stream_token)
          
          if (sseResult.success) {
            console.log('✅ [SSE] 流式连接建立成功，等待实时更新')
            // 🔧 不再覆盖progress，让后端SSE推送的真实进度生效
            setState(prev => ({
              ...prev,
              stage: 'connected',
              message: '已连接，正在处理...'
            }))
          } else {
            console.warn('⚠️ [SSE] 连接失败，启动HTTP轮询:', sseResult.error)
            pollingCleanupRef.current = startPolling(response.task_id!)
          }
        } catch (sseError) {
          console.warn('⚠️ [SSE] 连接异常，启动HTTP轮询:', sseError)
          pollingCleanupRef.current = startPolling(response.task_id!)
        }

      } else {
        // 请求失败
        console.error('❌ AI处理请求失败:', response.error)
        setState(prev => ({
          ...prev,
          isProcessing: false,
          isInitializing: false,
          error: response.error
        }))
      }

    } catch (error: any) {
      console.error('❌ 处理截图异常:', error)
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isInitializing: false,
        error: {
          code: 'PROCESSING_EXCEPTION',
          message: error.message || '处理过程中发生异常'
        }
      }))
    }
  }, [state.isProcessing])

  /**
   * 调试代码
   */
  const debugCode = useCallback(async (
    screenshot: string,
    code?: string,
    language?: string
  ) => {
    if (state.isProcessing) {
      console.log('⚠️ AI正在处理中，忽略调试请求')
      return
    }

    try {
      console.log('🔧 开始调试代码...')
      
      // 🚀 清理之前的轮询（如果存在）
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current()
        pollingCleanupRef.current = null
        console.log('🔌 [DYNAMIC-POLL] 清理之前的调试轮询')
      }
      
      // 保存处理参数用于重试
      lastProcessingParams.current = {
        type: 'debug',
        screenshot,
        code,
        language
      }
      
      // 🆕 发送solution start事件，触发界面切换到solutions
      console.log('📤 [DEBUG] 发送solution start事件，切换界面到solutions')
      if (window.electronAPI?.sendSolutionStart) {
        window.electronAPI.sendSolutionStart()
      }
      
      // 初始化状态 - 立即设置界面反馈
      setState(prev => ({
        ...prev,
        isProcessing: true,
        isInitializing: true,
        requestId: null,
        result: { 
          content: '正在提取调试题目...\n正在分析您的代码，请稍等...', 
          timestamp: Date.now() 
        },
        error: null,
        progress: 0,
        stage: 'initializing',
        message: '正在初始化调试...'
      }))

      // 🆕 使用新的SSE方式发送调试请求
      const response = await aiService.processScreenshotSSE(screenshot, 'debug')
      
      if (response.success && response.task_id) {
        console.log(`✅ [SSE] 代码调试请求已提交: ${response.task_id}`)
        
        setState(prev => ({
          ...prev,
          requestId: response.task_id!,
          isInitializing: false,
          message: '正在建立调试连接...'
        }))

        // 🆕 建立SSE连接来接收实时更新  
        try {
          console.log('🌊 [SSE] 建立调试流式连接...')
          const sseResult = await sseService.connectToStream(response.task_id!, response.stream_token)
          
          if (sseResult.success) {
            console.log('✅ [SSE] 调试流式连接建立成功，等待实时更新')
            // 🔧 不再覆盖progress，让后端SSE推送的真实进度生效
            setState(prev => ({
              ...prev,
              stage: 'connected',
              message: '已连接，正在调试代码...'
            }))
          } else {
            console.warn('⚠️ [SSE] 调试连接失败，启动HTTP轮询:', sseResult.error)
            pollingCleanupRef.current = startPolling(response.task_id!)
          }
        } catch (sseError) {
          console.warn('⚠️ [SSE] 调试连接异常，启动HTTP轮询:', sseError)
          pollingCleanupRef.current = startPolling(response.task_id!)
        }

      } else {
        console.error('❌ 代码调试请求失败:', response.error)
        setState(prev => ({
          ...prev,
          isProcessing: false,
          isInitializing: false,
          error: response.error
        }))
      }

    } catch (error: any) {
      console.error('❌ 调试代码异常:', error)
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isInitializing: false,
        error: {
          code: 'DEBUG_EXCEPTION',
          message: error.message || '调试过程中发生异常'
        }
      }))
    }
  }, [state.isProcessing])

  /**
   * 取消处理
   */
  const cancelProcessing = useCallback(async () => {
    if (!state.requestId) {
      return
    }

    try {
      console.log(`🚫 取消处理请求: ${state.requestId}`)
      
      // 🆕 断开SSE连接
      sseService.disconnect()
      
      // 发送取消请求
      const response = await aiService.cancelProcessing(state.requestId)
      
      if (response.success) {
        console.log('✅ 处理请求已取消')
      } else {
        console.warn('⚠️ 取消请求失败:', response.error)
      }

    } catch (error) {
      console.error('❌ 取消处理异常:', error)
    } finally {
      // 🆕 断开SSE连接并重置状态
      sseService.disconnect()
      streamingContent.current = ''
      streamingFields.current = { code: '', explanation: '' }
      
      // 🚀 清理动态轮询
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current()
        pollingCleanupRef.current = null
        console.log('🔌 [DYNAMIC-POLL] 轮询已在取消时清理')
      }
      
      setState(prev => ({
        ...prev,
        isProcessing: false,
        isInitializing: false,
        requestId: null,
        status: null,
        progress: 0,
        stage: 'idle',
        message: '已取消'
      }))
    }
  }, [state.requestId])

  /**
   * 清除错误
   */
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null
    }))
  }, [])

  /**
   * 清除结果（增强版SSE清理 + 防重入机制）
   */
  const clearResult = useCallback(async () => {
    const startTime = Date.now()
    const clearId = Math.random().toString(36).substring(7)
    
    // 🛡️ 防重入检查
    if (isClearingRef.current) {
      console.log(`🧹 [${clearId}] 清理已在进行中，跳过此次调用`)
      return
    }
    
    // 🔒 设置清理锁
    isClearingRef.current = true
    
    try {
      console.log(`🧹 [${clearId}] 开始清除结果和SSE连接`)
      console.log(`🧹 [${clearId}] 当前状态:`, {
        requestId: state.requestId,
        isProcessing: state.isProcessing,
        isInitializing: state.isInitializing,
        hasResult: !!state.result
      })
      
      // 🆕 如果有活跃的请求，先取消后端处理
      if (state.requestId && (state.isProcessing || state.isInitializing)) {
        console.log(`🚫 [${clearId}] 发现活跃请求，正在取消后端处理...`)
        cancelProcessing()
          .then(() => {
            console.log(`✅ [${clearId}] 后端处理取消指令已发送完成`)
          })
          .catch((error) => {
            console.warn(`⚠️ [${clearId}] 取消后端处理时出现问题:`, error)
          })
      }
      
      // 🆕 断开任何活跃的SSE连接
      console.log(`🔌 [${clearId}] 断开SSE连接`)
      sseService.disconnect()
      
      // 重置流式内容
      console.log(`🧹 [${clearId}] 清空流式内容`)
      streamingContent.current = ''
      streamingFields.current = { code: '', explanation: '' }
      
      // 🚀 清理动态轮询
      if (pollingCleanupRef.current) {
        console.log(`🚀 [${clearId}] 清理动态轮询`)
        pollingCleanupRef.current()
        pollingCleanupRef.current = null
      }
      
      // 重置状态
      console.log(`📝 [${clearId}] 重置状态`)
      setState(prev => ({
        ...prev,
        result: null,
        status: null,
        progress: 0,
        stage: 'idle',
        message: '就绪',
        requestId: null,
        isProcessing: false,
        isInitializing: false,
        error: null
      }))
      
      const endTime = Date.now()
      console.log(`✅ [${clearId}] 清理完成，耗时: ${endTime - startTime}ms`)
      
    } catch (error: any) {
      console.error(`❌ [${clearId}] 清理过程中出错:`, error)
      
      // 发生错误时也要进行基础清理
      console.log(`🚨 [${clearId}] 执行强制清理`)
      sseService.disconnect()
      streamingContent.current = ''
      
      // 清理轮询
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current()
        pollingCleanupRef.current = null
      }
      
      // 重置状态（即使出错也要重置）
      setState(prev => ({
        ...prev,
        result: null,
        status: null,
        progress: 0,
        stage: 'idle',
        message: '就绪',
        requestId: null,
        isProcessing: false,
        isInitializing: false,
        error: error?.message ? { message: error.message } : null
      }))
      
    } finally {
      // 🔓 无论如何都要释放清理锁
      isClearingRef.current = false
      console.log(`🔓 [${clearId}] 清理锁已释放`)
    }
  }, [state.requestId, state.isProcessing, state.isInitializing, cancelProcessing])

  /**
   * 重试处理
   */
  const retryProcessing = useCallback(async () => {
    if (!lastProcessingParams.current) {
      console.warn('⚠️ 没有可重试的处理参数')
      return
    }

    const params = lastProcessingParams.current
    
    if (params.type === 'screenshot') {
      await processScreenshot(params.screenshot, params.options)
    } else if (params.type === 'debug') {
      await debugCode(
        Array.isArray(params.screenshot) ? params.screenshot[0] || '' : params.screenshot,
        params.code,
        params.language
      )
    }
  }, [processScreenshot, debugCode])

  /**
   * HTTP轮询备用方案 - 🚀 动态轮询间隔优化版本
   */
  const startPolling = useCallback((requestId: string) => {
    console.log(`🔄 [DYNAMIC-POLL] 启动HTTP轮询监听状态: ${requestId}`)
    let pollAttempts = 0
    const maxPollAttempts = 180 // 总时长约5分钟
    const startTime = Date.now()
    let currentTimeout: NodeJS.Timeout | null = null
    
    // 🚀 动态轮询间隔计算函数
    const getDynamicPollingInterval = (elapsedTime: number, attempts: number) => {
      if (elapsedTime < 30000) return 1000      // 前30秒: 每1秒 (快速反馈)
      if (elapsedTime < 60000) return 2000      // 30-60秒: 每2秒
      if (elapsedTime < 120000) return 3000     // 1-2分钟: 每3秒
      return 5000                               // 2分钟后: 每5秒 (减少服务器压力)
    }
    
    const executePoll = async () => {
      pollAttempts++
      const elapsedTime = Date.now() - startTime
      
      try {
        const response = await aiService.getProcessingStatus(requestId)
        
        if (response.success && response.status) {
          const nextInterval = getDynamicPollingInterval(elapsedTime, pollAttempts)
          console.log(`🔄 [DYNAMIC-POLL] 轮询获取状态[${pollAttempts}]:`, {
            requestId: response.status.requestId,
            status: response.status.status,
            stage: response.status.stage,
            progress: response.status.progress,
            elapsedTime: Math.round(elapsedTime / 1000) + 's',
            nextInterval: nextInterval + 'ms'
          })
          
          handleStatusUpdate(response.status)
          
          // 如果处理完成或失败，停止轮询
          if (response.status.status === 'completed' || response.status.status === 'error') {
            console.log('✅ [DYNAMIC-POLL] 轮询检测到处理完成，停止轮询')
            return
          }
          
          // 🚀 使用动态间隔调度下次轮询
          currentTimeout = setTimeout(executePoll, nextInterval)
          
        } else {
          console.warn(`⚠️ [DYNAMIC-POLL] 状态轮询失败[${pollAttempts}]:`, response.error)
          // 失败时使用短间隔重试
          currentTimeout = setTimeout(executePoll, 2000)
        }
        
      } catch (error) {
        console.error(`❌ [DYNAMIC-POLL] 状态轮询异常[${pollAttempts}]:`, error)
        // 异常时使用短间隔重试
        currentTimeout = setTimeout(executePoll, 2000)
      }
      
      // 达到最大尝试次数后停止轮询
      if (pollAttempts >= maxPollAttempts) {
        console.log(`⏰ [DYNAMIC-POLL] 状态轮询达到最大尝试次数(${maxPollAttempts})，停止轮询`)
        
        // 设置超时错误
        setState(prev => ({
          ...prev,
          isProcessing: false,
          error: {
            code: 'POLLING_TIMEOUT',
            message: '处理超时，请稍后重试'
          }
        }))
      }
    }
    
    // 启动第一次轮询
    executePoll()
    
    // 返回清理函数
    return () => {
      if (currentTimeout) {
        clearTimeout(currentTimeout)
        console.log('🔌 [DYNAMIC-POLL] 轮询已手动停止')
      }
    }

  }, [handleStatusUpdate])

  // 🚀 组件卸载时清理轮询
  useEffect(() => {
    return () => {
      if (pollingCleanupRef.current) {
        pollingCleanupRef.current()
        console.log('🔌 [DYNAMIC-POLL] Hook卸载时清理轮询')
      }
    }
  }, [])

  return {
    ...state,
    processScreenshot,
    debugCode,
    cancelProcessing,
    clearError,
    clearResult,
    retryProcessing
  }
}
