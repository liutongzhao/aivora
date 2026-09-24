// sseService.ts - Server-Sent Events (SSE) 服务
import { ProcessingStatus } from './aiService'
import { getWebSocketUrl } from '../utils/config'

/**
 * SSE消息类型
 */
interface SSEMessage {
  type: 'connected' | 'progress' | 'content' | 'complete' | 'completed' | 'error' | 'cancelled'
  task_id?: string
  stage?: string
  message?: string
  progress?: number
  section?: string
  content?: string
  append?: boolean
  final_status?: string
  partialContent?: string  // 🆕 流式内容
  streamingStarted?: boolean
  isComplete?: boolean
  result?: any
}

/**
 * SSE连接状态
 */
interface SSEConnectionStatus {
  connected: boolean
  connecting: boolean
  error: string | null
  task_id: string | null
}

/**
 * Server-Sent Events服务类
 * 替代WebSocket，提供更简单稳定的实时通信
 */
export class SSEService {

  private baseURL = getWebSocketUrl()

  private eventSource: EventSource | null = null
  private connectionStatus: SSEConnectionStatus = {
    connected: false,
    connecting: false,
    error: null,
    task_id: null
  }
  
  // 事件处理器
  private eventHandlers: Map<string, Function[]> = new Map()
  
  // 当前任务状态
  private currentTaskId: string | null = null
  private processingStatus: ProcessingStatus | null = null

  constructor() {
    console.log('🌊 SSE服务初始化')
  }

  /**
   * 启动AI处理并获取任务ID
   */
  async startProcessing(image: string, mode: 'programming' | 'debug' = 'programming'): Promise<{
    success: boolean
    task_id?: string
    error?: string
  }> {
    try {
      console.log('🚀 [SSE] 启动处理请求:', { mode, hasImage: !!image })

      // 获取认证信息
      let headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }

      try {
        if (window.electronAPI?.webAuthStatus) {
          const authStatus = await window.electronAPI.webAuthStatus()
          if (authStatus.authenticated && authStatus.sessionId) {
            headers['X-Session-Id'] = authStatus.sessionId
            console.log('🔐 [SSE] 设置认证头')
          }
        }
      } catch (authError) {
        console.warn('⚠️ [SSE] 获取认证信息失败:', authError)
      }

      // 🆕 添加客户端版本信息
      try {
        const { getVersionHeaders } = await import('../utils/version')
        const versionHeaders = getVersionHeaders()
        Object.assign(headers, versionHeaders)
        console.log('🏷️ [SSE] 添加版本信息:', versionHeaders)
      } catch (versionError) {
        console.warn('⚠️ [SSE] 获取版本信息失败:', versionError)
      }

      // 发送POST请求启动处理
      const response = await fetch(`${this.baseURL}/api/ai/process-screenshot`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          image,
          mode
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: { message: '未知错误' } }))
        throw new Error(errorData.error?.message || `HTTP ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ [SSE] 处理启动成功:', data)

      return {
        success: true,
        task_id: data.task_id
      }

    } catch (error: any) {
      console.error('❌ [SSE] 启动处理失败:', error)
      return {
        success: false,
        error: error.message || '启动处理失败'
      }
    }
  }

  /**
   * 建立SSE连接来接收实时更新
   */
  async connectToStream(taskId: string, streamToken?: string): Promise<{
    success: boolean
    error?: string
  }> {
    try {
      // 如果已有连接，先断开
      if (this.eventSource) {
        this.disconnect()
      }

      console.log(`🌊 [SSE] 建立流连接: ${taskId}`)
      this.connectionStatus.connecting = true
      this.connectionStatus.error = null
      this.currentTaskId = taskId

      // 创建EventSource连接
      const tokenQuery = streamToken ? `?token=${encodeURIComponent(streamToken)}` : ''
      const streamUrl = `${this.baseURL}/api/ai/stream/${taskId}${tokenQuery}`
      console.log(`🌊 [SSE] 连接URL: ${streamUrl}`)

      this.eventSource = new EventSource(streamUrl)

      // 设置事件监听器
      this.setupEventHandlers()

      // 等待连接成功
      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('SSE连接超时'))
        }, 30000)

        const handleConnect = (event: MessageEvent) => {
          try {
            const data: SSEMessage = JSON.parse(event.data)
            if (data.type === 'connected') {
              console.log('✅ [SSE] 连接成功')
              clearTimeout(timeout)
              this.connectionStatus.connected = true
              this.connectionStatus.connecting = false
              this.connectionStatus.task_id = taskId
              resolve()
            }
          } catch (e) {
            // 忽略解析错误，继续等待
          }
        }

        const handleError = (error: Event) => {
          console.error('❌ [SSE] 连接失败:', error)
          clearTimeout(timeout)
          reject(new Error('SSE连接失败'))
        }

        this.eventSource!.addEventListener('message', handleConnect)
        this.eventSource!.addEventListener('error', handleError)

        // 清理监听器的函数
        const cleanup = () => {
          this.eventSource?.removeEventListener('message', handleConnect)
          this.eventSource?.removeEventListener('error', handleError)
        }

        // 添加到Promise的finally中执行清理
        Promise.resolve().then(() => {
          setTimeout(cleanup, 1000)
        })
      })

      return { success: true }

    } catch (error: any) {
      console.error('❌ [SSE] 连接流失败:', error)
      
      this.connectionStatus.connected = false
      this.connectionStatus.connecting = false
      this.connectionStatus.error = error.message

      return {
        success: false,
        error: error.message || 'SSE连接失败'
      }
    }
  }

  /**
   * 断开SSE连接（增强版，更彻底的清理）
   */
  disconnect() {
    if (this.eventSource) {
      console.log('🔌 [SSE] 断开连接')
      
      try {
        // 移除所有事件监听器
        this.eventSource.onopen = null
        this.eventSource.onmessage = null
        this.eventSource.onerror = null
        
        // 关闭连接
        this.eventSource.close()
        this.eventSource = null
        
        console.log('✅ [SSE] EventSource已关闭并清理')
      } catch (error) {
        console.error('❌ [SSE] 断开连接时出错:', error)
        // 强制设置为null
        this.eventSource = null
      }
      
      // 重置所有状态
      this.connectionStatus.connected = false
      this.connectionStatus.connecting = false
      this.connectionStatus.error = null
      this.currentTaskId = null
      this.processingStatus = null
      
      // 清空事件处理器映射
      this.eventHandlers.clear()
      
      console.log('🧹 [SSE] 连接状态已完全重置')
    } else {
      console.log('ℹ️ [SSE] 没有活跃连接需要断开')
    }
  }

  /**
   * 获取当前连接状态
   */
  getConnectionStatus() {
    return {
      ...this.connectionStatus,
      currentTaskId: this.currentTaskId
    }
  }

  /**
   * 获取当前处理状态
   */
  getCurrentProcessingStatus(): ProcessingStatus | null {
    return this.processingStatus
  }

  /**
   * 监听处理状态更新
   */
  onProcessingStatusUpdate(callback: (status: ProcessingStatus) => void) {
    this.addEventListener('processing_status_update', callback)
  }

  /**
   * 移除处理状态更新监听器  
   */
  offProcessingStatusUpdate(callback: (status: ProcessingStatus) => void) {
    this.removeEventListener('processing_status_update', callback)
  }

  /**
   * 监听内容更新（流式输出）
   */
  onContentUpdate(callback: (content: string, append: boolean) => void) {
    this.addEventListener('content_update', callback)
  }

  /**
   * 移除内容更新监听器
   */
  offContentUpdate(callback: (content: string, append: boolean) => void) {
    this.removeEventListener('content_update', callback)
  }

  /**
   * 监听处理完成
   */
  onProcessingComplete(callback: (result: any) => void) {
    this.addEventListener('processing_complete', callback)
  }

  /**
   * 移除处理完成监听器
   */
  offProcessingComplete(callback: (result: any) => void) {
    this.removeEventListener('processing_complete', callback)
  }

  /**
   * 🆕 监听处理被取消
   */
  onProcessingCancelled(callback: () => void) {
    this.addEventListener('processing_cancelled', callback)
  }

  offProcessingCancelled(callback: () => void) {
    this.removeEventListener('processing_cancelled', callback)
  }

  /**
   * 监听错误
   */
  onError(callback: (error: string) => void) {
    this.addEventListener('error', callback)
  }

  /**
   * 移除错误监听器
   */
  offError(callback: (error: string) => void) {
    this.removeEventListener('error', callback)
  }

  /**
   * 🆕 监听流式传输开始
   */
  onStreamingStarted(callback: () => void) {
    this.addEventListener('streaming_started', callback)
  }

  /**
   * 🆕 移除流式传输开始监听器
   */
  offStreamingStarted(callback: () => void) {
    this.removeEventListener('streaming_started', callback)
  }

  /**
   * 🆕 监听流式传输完成
   */
  onStreamingComplete(callback: (content: string) => void) {
    this.addEventListener('streaming_complete', callback)
  }

  /**
   * 🆕 移除流式传输完成监听器
   */
  offStreamingComplete(callback: (content: string) => void) {
    this.removeEventListener('streaming_complete', callback)
  }

  /**
   * 🆕 监听最终结果
   */
  onFinalResult(callback: (result: any) => void) {
    this.addEventListener('final_result', callback)
  }

  /**
   * 🆕 移除最终结果监听器
   */
  offFinalResult(callback: (result: any) => void) {
    this.removeEventListener('final_result', callback)
  }

  // ==================== 私有方法 ====================

  /**
   * 设置SSE事件处理器
   */
  private setupEventHandlers() {
    if (!this.eventSource) return

    // 消息处理
    this.eventSource.onmessage = (event) => {
      try {
        const data: SSEMessage = JSON.parse(event.data)
        console.log(`🌊 [SSE] 收到消息:`, data.type, data)

        switch (data.type) {
          case 'connected':
            console.log('✅ [SSE] 流连接已建立')
            break

          case 'progress':
            // 更新处理进度
            this.updateProcessingStatus({
              requestId: data.task_id || this.currentTaskId || '',
              status: 'processing',
              stage: data.stage || 'processing',
              progress: data.progress || 0,
              message: data.message || '',
              result: null,
              error: null
            })
            
            // 🆕 处理流式传输开始信号
            if (data.streamingStarted) {
              console.log('🚀 [SSE] 流式传输开始')
              this.emitEvent('streaming_started')
            }
            
            // 🆕 处理流式内容推送
            if (data.partialContent !== undefined && data.partialContent !== null) {
              console.log('🌊 [SSE] 收到流式内容:')
              console.log('📄 长度:', data.partialContent.length)
              console.log('📄 进度:', data.progress)
              console.log('📄 阶段:', data.stage)
              console.log('📄 前200字符:', JSON.stringify(data.partialContent.substring(0, 200)))
              console.log('📄 是否包含代码块:', data.partialContent.includes('```'))
              console.log('📄 是否包含思路:', data.partialContent.includes('思路') || data.partialContent.includes('解题'))
              
              // 🆕 检查是否是流式传输完成信号
              if (data.isComplete) {
                console.log('🔚 [SSE] 流式传输完成信号')
                this.emitEvent('streaming_complete', data.partialContent)
              } else {
                // 🆕 发送流式内容更新事件
                this.emitEvent('content_update', data.partialContent, false)
              }
            } else if (data.partialContent === null && data.stage !== 'ai_streaming') {
              // 🔧 非流式阶段的null内容是正常的，不记录错误
              console.log('🔄 [SSE] 非流式阶段，partialContent为null是正常的')
            }
            break

          case 'content':
            // 流式内容更新
            this.emitEvent('content_update', data.content || '', data.append || false)
            break

          case 'completed':
            // 处理完成
            console.log('🎉 [SSE] 处理完成，准备发送最终结果')
            this.updateProcessingStatus({
              requestId: this.currentTaskId || '',
              status: 'completed',
              stage: 'completed',
              progress: 100,
              message: '处理完成',
              result: data.result || null,
              error: null
            })
            
            // 🆕 发送最终格式化的结果，覆盖流式显示
            if (data.result) {
              console.log('📤 [SSE] 发送最终格式化结果到UI')
              this.emitEvent('final_result', data.result)
            }
            
            this.emitEvent('processing_complete', data.result)
            // 完成后断开连接，防止重连循环
            this.disconnect()
            break

          case 'cancelled':
            console.log('🚫 [SSE] 处理被取消')
            this.updateProcessingStatus({
              requestId: this.currentTaskId || '',
              status: 'cancelled',
              stage: 'cancelled',
              progress: data.progress || 0,
              message: data.message || '处理已取消',
              result: null,
              error: { message: data.message || '处理已取消' }
            })
            this.emitEvent('processing_cancelled')
            this.disconnect()
            break

          case 'error':
            // 处理错误
            console.error('❌ [SSE] 处理错误:', data.message)
            this.updateProcessingStatus({
              requestId: this.currentTaskId || '',
              status: 'error',
              stage: 'error',
              progress: 0,
              message: data.message || '处理失败',
              result: null,
              error: { message: data.message || '处理失败' }
            })
            this.emitEvent('error', data.message || '处理失败')
            break
        }
      } catch (error) {
        console.error('❌ [SSE] 消息解析失败:', error, event.data)
      }
    }

    // 连接错误处理
    this.eventSource.onerror = (event) => {
      console.error('❌ [SSE] 连接错误:', event)
      
      // 检查连接状态
      if (this.eventSource?.readyState === EventSource.CLOSED) {
        console.log('🔌 [SSE] 连接已关闭')
        this.connectionStatus.connected = false
        this.connectionStatus.error = 'SSE连接已关闭'
      } else if (this.eventSource?.readyState === EventSource.CONNECTING) {
        console.log('🔄 [SSE] 正在重连...')
        this.connectionStatus.connecting = true
      }
    }

    // 连接打开
    this.eventSource.onopen = (event) => {
      console.log('🌊 [SSE] 连接已打开')
    }
  }

  /**
   * 更新处理状态
   */
  private updateProcessingStatus(status: ProcessingStatus) {
    this.processingStatus = status
    this.emitEvent('processing_status_update', status)
  }

  /**
   * 添加事件监听器
   */
  private addEventListener(event: string, callback: Function) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, [])
    }
    this.eventHandlers.get(event)!.push(callback)
  }

  /**
   * 移除事件监听器
   */
  private removeEventListener(event: string, callback: Function) {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      const index = handlers.indexOf(callback)
      if (index > -1) {
        handlers.splice(index, 1)
      }
    }
  }

  /**
   * 触发事件
   */
  private emitEvent(event: string, ...args: any[]) {
    const handlers = this.eventHandlers.get(event)
    if (handlers) {
      handlers.forEach(handler => {
        try {
          handler(...args)
        } catch (error) {
          console.error('❌ [SSE] 事件处理器执行失败:', error)
        }
      })
    }
  }
}

// 导出单例
export const sseService = new SSEService()
