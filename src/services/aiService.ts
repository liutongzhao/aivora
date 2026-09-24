// aiService.ts - AI服务调用封装
import axios from 'axios'
import { getVersionHeaders } from '../utils/version'
import { getAIApiBaseUrl } from '../utils/config'

// 处理选项接口
export interface ProcessingOptions {
  forceQuestionType?: 'programming' | 'multiple_choice' | 'single_choice' | 'universal';
  preferredLanguage?: string;
  urgencyLevel?: 'normal' | 'fast';
}

// AI处理请求接口
export interface AIProcessRequest {
  screenshot: string;           // Base64编码的截图
  triggerType: 'shortcut' | 'manual';  // 触发方式
  processingOptions?: ProcessingOptions;
}

// AI处理结果接口
export interface AIProcessResult {
  questionType?: 'programming' | 'multiple_choice' | 'single_choice' | 'universal';
  content?: string;           // 处理后的答案
  rawContent?: string;        // 原始AI输出
  confidence?: number;        // 置信度
  model?: string;             // 使用的模型
  language?: string;          // 编程语言
  processingTime?: number;    // 处理耗时
  creditsUsed?: number;       // 消耗积分
  mode?: string
  type?: string;             // 题目类型
  stage?: string;            // 处理阶段
  // 🆕 格式化数据相关字段
  isFormatted?: boolean;     // 是否为最终格式化结果
  formatted?: {              // 格式化后的数据
    code: string;
    thoughts: string[];
    timeComplexity: string;
    spaceComplexity: string;
  };
  parsed?: {                 // 后端解析的数据（用于final_result事件）
    code?: string;
    thoughts?: string[];
    timeComplexity?: string;
    spaceComplexity?: string;
    time_complexity?: string;
    space_complexity?: string;
  };
}

// 处理状态接口
export interface ProcessingStatus {
  requestId: string;
  status: 'queued' | 'processing' | 'completed' | 'error' | 'cancelled';
  stage: string;              // 当前处理阶段
  progress: number;           // 处理进度 0-100
  message: string;            // 状态描述
  estimatedTime?: number;     // 预估剩余时间
  result?: AIProcessResult;   // 处理结果（完成时）
  partialContent?: string;    // 部分内容（流式输出）
  error?: any;               // 错误信息（失败时）
}

/**
 * AI服务调用类
 */
export class AIService {

  private baseURL: string = getAIApiBaseUrl()

  private axiosInstance = axios.create({
    baseURL: this.baseURL,
    timeout: 60000, // 60秒超时
    headers: {
      'Content-Type': 'application/json'
    }
  })

  constructor() {
    // 设置请求拦截器，自动添加认证信息
    this.axiosInstance.interceptors.request.use(
      async (config) => {
        // 获取认证信息
        const sessionId = await this.getSessionId()
        if (sessionId) {
          config.headers['X-Session-Id'] = sessionId
          console.log('🔑 [AI服务] 添加会话ID到请求头:', sessionId.substring(0, 10) + '...')
        } else {
          console.warn('⚠️  [AI服务] 未获取到会话ID')
        }
        
        // 添加客户端版本号到请求头
        const versionHeaders = getVersionHeaders()
        Object.assign(config.headers, versionHeaders)
        console.log('🏷️ [AI服务] 添加版本信息:', versionHeaders)
        
        // 🔍 调试请求配置
        if (config.url?.includes('/process-screenshot')) {
          console.log('🔍 [AI服务] 拦截器检查:', JSON.stringify({
            url: config.url,
            method: config.method,
            hasSessionId: !!sessionId,
            contentType: config.headers['Content-Type'],
            dataKeys: config.data ? Object.keys(config.data) : 'no data'
          }, null, 2))
        }
        
        return config
      },
      (error) => {
        return Promise.reject(error)
      }
    )

    // 设置响应拦截器，处理错误
    this.axiosInstance.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error('AI服务请求失败:', error)
        
        // 处理认证错误
        if (error.response?.status === 401) {
          this.handleAuthError()
        }
        
        return Promise.reject(error)
      }
    )
  }

  /**
   * 处理截图 - 主要的AI处理接口
   */
  async processScreenshot(
    screenshot: string, 
    options?: ProcessingOptions
  ): Promise<{ success: boolean; requestId?: string; error?: any; status?: string; message?: string; progress?: number }> {
    try {
      console.log('🚀 发送AI处理请求到后端...')
      
      // 验证截图数据
      if (!screenshot) {
        throw new Error('截图数据不能为空')
      }
      
      // 构建请求数据
      const requestData: AIProcessRequest = {
        screenshot,
        triggerType: 'shortcut',
        processingOptions: options
      }
      
      console.log('📝 AI处理请求详情:', {
        hasScreenshot: !!screenshot,
        screenshotLength: screenshot.length,
        triggerType: requestData.triggerType,
        processingOptions: requestData.processingOptions
      })
      
      // 发送请求到后端
      const response = await this.axiosInstance.post('/process', requestData)
      
      console.log('✅ AI处理请求成功:', response.data)
      
      return {
        success: response.data.success,
        requestId: response.data.requestId,
        status: response.data.status,
        message: response.data.message,
        progress: response.data.progress
      }
      
    } catch (error: any) {
      console.error('❌ AI处理请求失败:', error)
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || '处理请求失败'
        }
      }
    }
  }

  /**
   * 获取处理状态
   */
  async getProcessingStatus(requestId: string): Promise<{ success: boolean; status?: ProcessingStatus; error?: any }> {
    try {
      console.log(`🔍 查询处理状态 - RequestId: ${requestId}`)
      
      const response = await this.axiosInstance.get(`/process/${requestId}/status`)
      
      if (response.data.success) {
        return {
          success: true,
          status: {
            requestId: response.data.requestId,
            status: response.data.status,
            stage: response.data.stage,
            progress: response.data.progress,
            message: response.data.message,
            estimatedTime: response.data.estimatedTime,
            result: response.data.result,
            error: response.data.error
          }
        }
      } else {
        return {
          success: false,
          error: response.data.error
        }
      }
      
    } catch (error: any) {
      console.error('❌ 获取处理状态失败:', error)
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || '获取状态失败'
        }
      }
    }
  }

  /**
   * 取消处理请求
   */
  async cancelProcessing(requestId: string): Promise<{ success: boolean; error?: any }> {
    try {
      console.log(`🚫 取消处理请求 - RequestId: ${requestId}`)
      
      const response = await this.axiosInstance.delete(`/process/${requestId}`)
      
      return {
        success: response.data.success
      }
      
    } catch (error: any) {
      console.error('❌ 取消处理请求失败:', error)
      const status = error.response?.status
      if (status === 404 || status === 400) {
        console.warn('⚠️ 取消请求返回可忽略状态:', status, error.response?.data)
        return { success: true }
      }
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || '取消请求失败'
        }
      }
    }
  }

  /**
   * 调试代码
   */
  async debugCode(
    screenshot: string,
    code?: string,
    language?: string
  ): Promise<{ success: boolean; requestId?: string; error?: any }> {
    try {
      console.log('🔧 发送代码调试请求到后端...')
      
      const response = await this.axiosInstance.post('/debug', {
        screenshot,
        code,
        language,
        triggerType: 'manual'
      })
      
      console.log('✅ 代码调试请求成功:', response.data)
      
      return {
        success: response.data.success,
        requestId: response.data.requestId
      }
      
    } catch (error: any) {
      console.error('❌ 代码调试请求失败:', error)
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || '调试请求失败'
        }
      }
    }
  }

  /**
   * 获取可用的AI模型列表
   */
  async getAvailableModels(): Promise<{ success: boolean; models?: any[]; error?: any }> {
    try {
      const response = await this.axiosInstance.get('/models')
      
      return {
        success: response.data.success,
        models: response.data.models
      }
      
    } catch (error: any) {
      console.error('❌ 获取模型列表失败:', error)
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || '获取模型列表失败'
        }
      }
    }
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{ success: boolean; status?: any; error?: any }> {
    try {
      const response = await this.axiosInstance.get('/health')
      
      return {
        success: response.data.success,
        status: response.data
      }
      
    } catch (error: any) {
      console.error('❌ AI服务健康检查失败:', error)
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || '健康检查失败'
        }
      }
    }
  }

  // ==================== 🆕 SSE相关方法 ====================

  /**
   * SSE方式处理截图（新的SSE接口）- 支持单张和多张截图
   */
  async processScreenshotSSE(
    image: string | string[], 
    mode: 'programming' | 'debug' | 'single_choice' | 'multiple_choice' | 'universal' = 'programming'
  ): Promise<{ success: boolean; task_id?: string; stream_token?: string; error?: any }> {
    try {
      console.log('🌊 [AI服务] 发送SSE处理请求...')
      
      // 处理单张或多张截图 - 直接发送，不分批
      let requestBody: any = { mode }

      if (Array.isArray(image)) {
        // 多张截图模式 - 直接传输数组
        if (image.length === 0) {
          throw new Error('截图数组不能为空')
        }
        requestBody.images = image
        console.log('📝 [AI服务] 多截图处理请求:', JSON.stringify({
          imageCount: image.length,
          totalSize: image.reduce((sum, img) => sum + img.length, 0),
          mode: mode,
          hasFirstImage: !!image[0]
        }, null, 2))
      } else {
        // 单张截图模式
        if (!image) {
          throw new Error('图片数据不能为空')
        }
        requestBody.image = image
        console.log('📝 [AI服务] 单截图处理请求:', JSON.stringify({
          hasImage: !!image,
          imageLength: image.length,
          mode: mode
        }, null, 2))
      }
      
      // 发送请求到SSE端点
      console.log('📤 [AI服务] 即将发送HTTP请求到:', '/process-screenshot')
      console.log('📤 [AI服务] 请求体概要:', JSON.stringify({
        mode: requestBody.mode,
        hasImage: !!requestBody.image,
        hasImages: !!requestBody.images,
        imagesCount: requestBody.images?.length,
        requestBodyKeys: Object.keys(requestBody)
      }, null, 2))
      
      // 🔍 详细调试：验证请求体内容（不打印base64）
      console.log('🔍 [AI服务] 请求体详细检查:', JSON.stringify({
        imageExists: 'image' in requestBody,
        imagesExists: 'images' in requestBody,
        imageType: requestBody.image ? typeof requestBody.image : 'undefined',
        imagesType: requestBody.images ? typeof requestBody.images : 'undefined',
        imagesLength: requestBody.images ? requestBody.images.length : 'undefined',
        imagesArrayCheck: requestBody.images ? Array.isArray(requestBody.images) : 'undefined',
        mode: requestBody.mode,
        requestBodySize: JSON.stringify(requestBody).length
      }, null, 2))
      
      // 🔍 验证axios实例配置
      console.log('🔧 [AI服务] Axios实例配置:', JSON.stringify({
        baseURL: this.axiosInstance.defaults.baseURL,
        timeout: this.axiosInstance.defaults.timeout,
        headers: Object.keys(this.axiosInstance.defaults.headers || {})
      }, null, 2))
      
      const response = await this.axiosInstance.post('/process-screenshot', requestBody)
      
      console.log('✅ SSE处理请求成功:', response.data)
      
      return {
        success: response.data.success,
        task_id: response.data.task_id,
        stream_token: response.data.stream_token
      }
      
    } catch (error: any) {
      console.error('❌ SSE处理请求失败:', error.code, error.message)
      console.error('❌ 详细错误信息:', JSON.stringify({
        errorCode: error.code,
        errorMessage: error.message,
        responseStatus: error.response?.status,
        responseData: error.response?.data,
        requestConfig: {
          url: error.config?.url,
          method: error.config?.method,
          baseURL: error.config?.baseURL
        }
      }, null, 2))
      
      // 如果是请求体过大错误，提供清晰的错误信息
      if (error.code === 'ECONNABORTED' || error.message?.includes('413') || error.message?.includes('Request Entity Too Large')) {
        return {
          success: false,
          error: {
            code: 'REQUEST_TOO_LARGE',
            message: '图片数据过大，请尝试减少截图数量或优化图片质量'
          }
        }
      }
      
      // 网络连接错误
      if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return {
          success: false,
          error: {
            code: 'CONNECTION_ERROR',
            message: '无法连接到后端服务，请检查服务是否启动'
          }
        }
      }
      
      return {
        success: false,
        error: {
          code: error.response?.data?.error?.code || error.code || 'UNKNOWN_ERROR',
          message: error.response?.data?.error?.message || error.message || 'SSE处理请求失败'
        }
      }
    }
  }


  /**
   * 获取SSE流URL
   */
  getSSEStreamUrl(taskId: string): string {
    return `${this.baseURL}/stream/${taskId}`
  }

  // ==================== 私有方法 ====================

  /**
   * 获取会话ID（从现有认证系统）
   */
  private async getSessionId(): Promise<string | null> {
    try {
      // 通过IPC获取认证信息
      if (window.electronAPI?.webAuthStatus) {
        const authStatus = await window.electronAPI.webAuthStatus()
        console.log('🔍 认证状态检查:', authStatus) // 调试日志
        if (authStatus.authenticated && authStatus.sessionId) {
          console.log('✅ 获取到sessionId:', authStatus.sessionId.substring(0, 10) + '...') // 调试日志
          return authStatus.sessionId
        } else {
          console.warn('❌ 未认证或缺少sessionId')
        }
      }
      return null
    } catch (error) {
      console.warn('获取sessionId失败:', error)
      return null
    }
  }

  /**
   * 处理认证错误
   */
  private handleAuthError() {
    console.warn('AI服务认证失败，需要重新登录')
    
    // 通知主进程需要认证
    if (window.electronAPI?.showAuthRequired) {
      window.electronAPI.showAuthRequired({
        title: '需要登录',
        message: 'AI功能需要登录后才能使用'
      })
    }
  }
}

// 导出单例
export const aiService = new AIService()
