// LightweightProcessingHelper.ts - 轻量级AI处理助手
import { BrowserWindow } from 'electron'
import { ScreenshotHelper } from './ScreenshotHelper'
import { IProcessingHelperDeps } from './main'

// Set UTF-8 encoding for console output in this module
if (process.stdout.setEncoding) {
  process.stdout.setEncoding('utf8')
}
if (process.stderr.setEncoding) {
  process.stderr.setEncoding('utf8')
}

/**
 * 轻量级AI处理助手 - 只负责截图和与后端通信
 * 所有AI处理逻辑都移到后端，客户端只负责：
 * 1. 截图采集
 * 2. 发送请求到后端
 * 3. 展示结果
 */
export class LightweightProcessingHelper {
  private deps: IProcessingHelperDeps
  private screenshotHelper: ScreenshotHelper

  // 防重复处理机制（保持与原版本一致）
  private isProcessingSearch: boolean = false
  private lastSearchTimestamp: number = 0
  private readonly SEARCH_COOLDOWN = 1000 // 1秒冷却
  
  private isProcessingDebug: boolean = false
  private lastDebugTimestamp: number = 0
  private readonly DEBUG_COOLDOWN = 1000 // 1秒冷却时间，与搜索相同

  constructor(deps: IProcessingHelperDeps) {
    this.deps = deps
    this.screenshotHelper = deps.getScreenshotHelper()
    console.log('🚀 轻量级AI处理助手初始化完成')
  }

  /**
   * 处理截图（编程题）
   */
  public async processScreenshots(overrideLanguage?: string): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // 防重复处理检查
    if (!this.canStartNewSearch()) {
      console.log('🚫 编程题处理被拒绝：正在处理中或冷却中')
      return
    }

    console.log('🔥 开始处理编程题截图...')
    this.markSearchStart()

    try {
      // 采集截图
      const screenshot = await this.captureScreenshot()
      if (!screenshot) {
        console.error('❌ 截图采集失败')
        return
      }

      // 🔍 调试：检查截图数据（支持单张和多张）
      if (Array.isArray(screenshot)) {
        console.log('🔍 [ELECTRON] 多张截图数据详情:', {
          screenshotCount: screenshot.length,
          firstScreenshotLength: screenshot[0]?.length,
          isDataURL: screenshot[0]?.startsWith('data:image/'),
          // isBase64Array: screenshot.every(s => s?.startsWith('data:image/')),
          allHaveComma: screenshot.every(s => s?.includes(','))
        })
      } else {
        console.log('🔍 [ELECTRON] 单张截图数据详情:', {
          screenshotLength: screenshot?.length,
          isDataURL: screenshot?.startsWith('data:image/'),
          hasComma: screenshot?.includes(',')
        })
      }

      // 🆕 发送处理请求到前端，支持多张截图
      const requestData: any = {
        type: 'programming',
        options: {
          forceQuestionType: 'programming',
          preferredLanguage: overrideLanguage || 'python'
        },
        triggerType: 'shortcut'
      }

      // 根据截图数量设置不同的字段
      if (Array.isArray(screenshot)) {
        requestData.screenshots = screenshot // 多张截图
      } else {
        requestData.screenshot = screenshot // 单张截图（向后兼容）
      }

      mainWindow.webContents.send('ai-process-request', requestData)

      console.log('✅ [ELECTRON] 编程题处理请求已发送到前端')

    } catch (error: any) {
      console.error('❌ 编程题处理异常:', error)
      this.showError('编程题处理失败', error.message)
    } finally {
      this.markSearchEnd()
    }
  }

  /**
   * 处理截图（单选题）
   */
  public async processScreenshotsAsChoice(overrideLanguage?: string): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // 防重复处理检查
    if (!this.canStartNewSearch()) {
      console.log('🚫 单选题处理被拒绝：正在处理中或冷却中')
      return
    }

    console.log('🔥 开始处理单选题截图...')
    this.markSearchStart()

    try {
      // 采集截图
      const screenshot = await this.captureScreenshot()
      if (!screenshot) {
        console.error('❌ 截图采集失败')
        return
      }

      // 🆕 发送处理请求到前端，支持多张截图
      const requestData: any = {
        type: 'single_choice',
        options: {
          forceQuestionType: 'single_choice',
          preferredLanguage: overrideLanguage || 'python'
        },
        triggerType: 'shortcut'
      }

      // 根据截图数量设置不同的字段
      if (Array.isArray(screenshot)) {
        requestData.screenshots = screenshot // 多张截图
      } else {
        requestData.screenshot = screenshot // 单张截图（向后兼容）
      }

      mainWindow.webContents.send('ai-process-request', requestData)

      console.log('✅ 单选题处理请求已发送到前端')

    } catch (error: any) {
      console.error('❌ 单选题处理异常:', error)
      this.showError('单选题处理失败', error.message)
    } finally {
      this.markSearchEnd()
    }
  }

  /**
   * 处理截图（多选题）
   */
  public async processScreenshotsAsMultipleChoice(operationId?: string, overrideLanguage?: string): Promise<void> {
    const timestamp = Date.now()
    console.log(`🔥 processScreenshotsAsMultipleChoice called at ${timestamp} with operationId: ${operationId}`)
    
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // 防重复处理检查
    if (!this.canStartNewSearch()) {
      console.log(`🚫 多选题处理被拒绝：正在处理中或冷却中 (${timestamp})`)
      return
    }

    console.log('🔥 开始处理多选题截图...')
    this.markSearchStart()

    try {
      // 采集截图
      const screenshot = await this.captureScreenshot()
      if (!screenshot) {
        console.error('❌ 截图采集失败')
        return
      }

      // 🆕 发送处理请求到前端，支持多张截图
      const requestData: any = {
        type: 'multiple_choice',
        options: {
          forceQuestionType: 'multiple_choice',
          preferredLanguage: overrideLanguage || 'python'
        },
        triggerType: 'shortcut',
        operationId: operationId
      }

      // 根据截图数量设置不同的字段
      if (Array.isArray(screenshot)) {
        requestData.screenshots = screenshot // 多张截图
      } else {
        requestData.screenshot = screenshot // 单张截图（向后兼容）
      }

      mainWindow.webContents.send('ai-process-request', requestData)

      console.log('✅ 多选题处理请求已发送到前端')

    } catch (error: any) {
      console.error('❌ 多选题处理异常:', error)
      this.showError('多选题处理失败', error.message)
    } finally {
      this.markSearchEnd()
    }
  }

  /**
   * 调试代码
   */
  public async debugCode(params: { language?: string }): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // 防重复处理检查
    if (!this.canStartDebug()) {
      console.log('🚫 代码调试被拒绝：正在处理中或冷却中')
      return
    }

    console.log('🔧 开始代码调试...')
    this.markDebugStart()

    try {
      // 采集截图
      const screenshot = await this.captureScreenshot()
      if (!screenshot) {
        console.error('❌ 截图采集失败')
        return
      }

      // 🆕 发送调试请求到前端，支持多张截图
      const requestData: any = {
        language: params.language || 'python',
        triggerType: 'shortcut'
      }

      // 根据截图数量设置不同的字段
      if (Array.isArray(screenshot)) {
        requestData.screenshots = screenshot // 多张截图
      } else {
        requestData.screenshot = screenshot // 单张截图（向后兼容）
      }

      mainWindow.webContents.send('ai-debug-request', requestData)

      console.log('✅ 代码调试请求已发送到前端')

    } catch (error: any) {
      console.error('❌ 代码调试异常:', error)
      this.showError('代码调试失败', error.message)
    } finally {
      this.markDebugEnd()
    }
  }

  // ==================== 防重复处理机制（从原版本保留） ====================

  /**
   * 检查是否可以开始新的搜索操作
   */
  private canStartNewSearch(): boolean {
    const now = Date.now()
    
    // 如果正在处理中，拒绝新请求
    if (this.isProcessingSearch) {
      console.log("❌ 搜索正在进行中，拒绝重复请求")
      return false
    }
    
    // 检查冷却时间
    if (now - this.lastSearchTimestamp < this.SEARCH_COOLDOWN) {
      console.log(`❌ 搜索冷却中，还需等待 ${this.SEARCH_COOLDOWN - (now - this.lastSearchTimestamp)}ms`)
      return false
    }
    
    return true
  }

  /**
   * 标记搜索开始
   */
  private markSearchStart(): void {
    this.isProcessingSearch = true
    this.lastSearchTimestamp = Date.now()
    console.log("🔒 搜索状态已锁定")
  }

  /**
   * 标记搜索结束
   */
  private markSearchEnd(): void {
    if (this.isProcessingSearch) {
      this.isProcessingSearch = false
      console.log("🔓 搜索状态已解锁")
    }
  }

  /**
   * 检查是否可以开始调试操作
   */
  private canStartDebug(): boolean {
    const now = Date.now()
    
    // 如果正在处理调试，拒绝新请求
    if (this.isProcessingDebug) {
      console.log("❌ 调试正在进行中，拒绝重复请求")
      return false
    }
    
    // 检查冷却时间
    if (now - this.lastDebugTimestamp < this.DEBUG_COOLDOWN) {
      console.log(`❌ 调试冷却中，还需等待 ${this.DEBUG_COOLDOWN - (now - this.lastDebugTimestamp)}ms`)
      return false
    }
    
    console.log("✅ 调试状态检查通过，可以开始调试")
    return true
  }

  /**
   * 标记调试开始
   */
  private markDebugStart(): void {
    this.isProcessingDebug = true
    this.lastDebugTimestamp = Date.now()
    console.log("🔒 调试状态已锁定")
  }

  /**
   * 标记调试结束
   */
  private markDebugEnd(): void {
    if (this.isProcessingDebug) {
      this.isProcessingDebug = false
      console.log("🔓 调试状态已解锁")
    }
  }

  // ==================== 辅助方法 ====================

  /**
   * 采集截图 - 统一多截图版本
   */
  private async captureScreenshot(): Promise<string | string[] | null> {
    try {
      console.log('📸 开始采集截图（多截图模式）...')

      // 获取屏幕截图队列中的所有截图
      const screenshotQueue = this.deps.getScreenshotQueue()
      const extraQueue = this.deps.getExtraScreenshotQueue()
      
      console.log(`📸 找到 ${screenshotQueue.length} 个普通截图，${extraQueue.length} 个额外截图`)

      // 如果没有截图，尝试立即截取一张
      if (screenshotQueue.length === 0 && extraQueue.length === 0) {
        console.log('📸 没有现有截图，立即采集新截图...')
        const newScreenshot = await this.deps.takeScreenshot()
        console.log(`📸 新截图路径: ${newScreenshot}`)
        if (newScreenshot) {
          const previewData = await this.deps.getImagePreview(newScreenshot)
          console.log(`📸 新截图预览数据长度: ${previewData?.length}`)
          console.log(`📸 新截图预览前缀: ${previewData?.substring(0, 50)}`)
          return previewData // 返回单张截图
        } else {
          throw new Error('立即截图失败')
        }
      }

      // 🆕 统一多截图处理：处理所有可用截图
      const allScreenshots = [...screenshotQueue, ...extraQueue]
      
      if (allScreenshots.length === 1) {
        // 单张截图情况，返回单个字符串以保持向后兼容
        const screenshotPath = allScreenshots[0]
        console.log(`📸 处理单张截图: ${screenshotPath}`)
        const screenshotData = await this.deps.getImagePreview(screenshotPath)
        
        // 🔍 验证截图数据
        console.log(`🔍 [SCREENSHOT] 单张截图验证:`, {
          filepath: screenshotPath,
          dataLength: screenshotData?.length,
          dataPrefix: screenshotData?.substring(0, 100),
          isEmpty: !screenshotData || screenshotData.length < 100,
          isValidBase64: screenshotData?.startsWith('data:image/')
        })
        
        return screenshotData
      } else if (allScreenshots.length > 1) {
        // 🆕 多张截图情况，返回截图数组
        console.log(`📸 处理多张截图: ${allScreenshots.length} 张`)
        const screenshotDataArray: string[] = []
        
        for (let i = 0; i < allScreenshots.length; i++) {
          const screenshotPath = allScreenshots[i]
          console.log(`📸 处理第 ${i + 1}/${allScreenshots.length} 张截图: ${screenshotPath}`)
          
          const screenshotData = await this.deps.getImagePreview(screenshotPath)
          
          if (screenshotData && screenshotData.length > 100 && screenshotData.startsWith('data:image/')) {
            screenshotDataArray.push(screenshotData)
            console.log(`✅ 第 ${i + 1} 张截图验证通过，长度: ${screenshotData.length}`)
          } else {
            console.warn(`⚠️ 第 ${i + 1} 张截图验证失败，跳过`)
          }
        }
        
        console.log(`🔍 [MULTI-SCREENSHOT] 多张截图处理完成:`, {
          totalScreenshots: allScreenshots.length,
          validScreenshots: screenshotDataArray.length,
          allValid: screenshotDataArray.length === allScreenshots.length
        })
        
        if (screenshotDataArray.length > 0) {
          return screenshotDataArray // 返回截图数组
        } else {
          throw new Error('所有截图都验证失败')
        }
      }

      throw new Error('没有可用的截图')

    } catch (error: any) {
      console.error('❌ 采集截图失败:', error)
      return null
    }
  }

  /**
   * 显示错误信息
   */
  private showError(title: string, message: string): void {
    const mainWindow = this.deps.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('show-notification', {
        type: 'error',
        title: title,
        message: message,
        duration: 5000
      })
    }
  }

  /**
   * 其他兼容性方法（保持与原SimpleProcessingHelper接口兼容）
   */
  
  // 保持与原版本的兼容性
  public getLatestRawOutput() {
    // 原始输出现在由后端管理，客户端不再存储
    return null
  }

  public sendLatestRawOutputToFrontend() {
    // 不需要实现，由后端直接推送
    console.log('📭 原始输出由后端直接推送，无需客户端发送')
  }

  // 搜索相关方法（暂时保留接口兼容性）
  public async searchForSolution(params: any): Promise<void> {
    console.log('🔍 多选题搜索转为processScreenshotsAsMultipleChoice')
    const finalLanguage = params.language || 'python'
    await this.processScreenshotsAsMultipleChoice(undefined, finalLanguage)
  }

  /**
   * 🆕 通用搜题处理 - 不预设题目类型，让AI根据内容自动判断
   */
  public async processScreenshotsAsUniversal(overrideLanguage?: string): Promise<void> {
    const mainWindow = this.deps.getMainWindow()
    if (!mainWindow) return

    // 防重复处理检查
    if (!this.canStartNewSearch()) {
      console.log('🚫 通用搜题处理被拒绝：正在处理中或冷却中')
      return
    }

    console.log('🎯 开始通用搜题处理...')
    this.markSearchStart()

    try {
      // 采集截图
      const screenshot = await this.captureScreenshot()
      if (!screenshot) {
        return
      }

      // 🆕 发送处理请求到前端，使用与单选题相同的流程
      const requestData: any = {
        type: 'universal',
        options: {
          forceQuestionType: 'universal',
          preferredLanguage: overrideLanguage || 'python'
        },
        triggerType: 'shortcut'
      }

      // 根据截图数量设置不同的字段
      if (Array.isArray(screenshot)) {
        requestData.screenshots = screenshot // 多张截图
      } else {
        requestData.screenshot = screenshot // 单张截图（向后兼容）
      }

      mainWindow.webContents.send('ai-process-request', requestData)

      console.log('✅ 通用搜题处理请求已发送到前端')

    } catch (error: any) {
      console.error('❌ 通用搜题处理异常:', error)
      this.showError('通用搜题处理失败', error.message)
    } finally {
      this.markSearchEnd()
    }
  }

  /**
   * 取消正在进行的请求
   */
  public cancelOngoingRequests(): void {
    console.log('🚫 取消正在进行的请求（轻量级版本）')
    // 重置处理状态
    this.isProcessingSearch = false
    this.isProcessingDebug = false
    
    // 通知前端取消请求
    const mainWindow = this.deps.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('cancel-ai-requests')
    }
  }

  /**
   * 取消所有积分预约
   */
  public async cancelAllCreditReservations(): Promise<void> {
    console.log('💰 取消所有积分预约（轻量级版本）')
    // 轻量级版本不管理积分，通知前端处理
    const mainWindow = this.deps.getMainWindow()
    if (mainWindow) {
      mainWindow.webContents.send('cancel-credit-reservations')
    }
  }
}