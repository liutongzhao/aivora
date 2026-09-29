// ipcHandlers.ts

import { BrowserWindow, ipcMain, shell, dialog, clipboard, screen } from "electron"
import { randomBytes } from "crypto"
import { IIpcHandlerDeps } from "./main"
import { configHelper } from "./ConfigHelper"
import { simpleAuthManager } from "./SimpleAuthManager"
import { SimpleAuthManager } from './SimpleAuthManager'
import { CompatibilityChecker, CompatibilityResult, CompatibilityReport } from './CompatibilityChecker'
// 使用 Electron 内置的 fetch API
// 🆕 导入版本信息
const packageJson = require('../../package.json');
const configData = require('../../config.json');
const API_BASE_URL = configData.api?.baseUrl || 'http://127.0.0.1:18000';

// 🆕 创建带版本信息的fetch函数
const fetchWithVersion = (url: string, options: RequestInit = {}) => {
  const versionHeaders = {
    'X-Client-Version': packageJson.version,
    'X-Client-Type': 'electron',
    'X-Client-Name': packageJson.name,
    'X-Client-Platform': process.platform
  };
  
  return fetch(url, {
    ...options,
    headers: {
      ...versionHeaders,
      ...options.headers
    }
  });
};

export function initializeIpcHandlers(deps: IIpcHandlerDeps): void {
  console.log("Initializing standard IPC handlers")
  console.log("🔍 [IPC] 开始初始化IPC处理器，PROCESSING_EVENTS:", Object.keys(deps.PROCESSING_EVENTS))

  ipcMain.handle('remote:create-pairing', async () => {
    try {
      if (!deps.remoteControlClient) return { success: false, error: '远程控制尚未初始化' }
      const pairing = await deps.remoteControlClient.createPairing()
      return { success: true, ...pairing }
    } catch (error: any) {
      return { success: false, error: error?.message || '生成连接码失败' }
    }
  })

  ipcMain.handle('remote:disconnect', () => {
    deps.remoteControlClient?.disconnect()
    return { success: true }
  })

  ipcMain.handle('window-recover', () => {
    const targetWindow = deps.getMainWindow()
    if (!targetWindow || targetWindow.isDestroyed()) {
      return { success: false, error: '无法获取窗口实例' }
    }
    const workArea = screen.getPrimaryDisplay().workArea
    const bounds = targetWindow.getBounds()
    targetWindow.setPosition(
      Math.round(workArea.x + (workArea.width - bounds.width) / 2),
      Math.round(workArea.y + (workArea.height - bounds.height) / 2),
    )
    targetWindow.showInactive()
    return { success: true }
  })

  // Configuration handlers
  ipcMain.handle("get-config", () => {
    return configHelper.loadConfig();
  })

  ipcMain.handle("update-config", (_event, updates) => {
    return configHelper.updateConfig(updates);
  })

  ipcMain.handle("check-api-key", () => {
    // API key is now built-in, always available
    return true;
  })
  
  ipcMain.handle("validate-api-key", async (_event, apiKey) => {
    // API key is now built-in, always valid
    return { 
      valid: true, 
      error: null 
    };
  })

  // 🆕 积分管理处理器 - 替换旧的简单积分系统
  ipcMain.handle("credits:get", async () => {
    try {
      const authStatus = await simpleAuthManager.isAuthenticated()
      if (!authStatus) {
        return { success: false, error: '用户未认证' }
      }

      const sessionId = simpleAuthManager.getToken()
      if (!sessionId) {
        return { success: false, error: '无session信息' }
      }

      const response = await fetchWithVersion(`${API_BASE_URL}/api/client/credits`, {

        method: 'GET',
        headers: {
          'X-Session-Id': sessionId,
          'Content-Type': 'application/json'
        }
      })

      if (response.ok) {
        const data = await response.json()
        return { success: true, credits: data.credits }
      } else {
        return { success: false, error: '获取积分失败' }
      }
    } catch (error) {
      console.error('获取积分错误:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("credits:check", async (_event, { modelName, questionType }) => {
    try {
      const authStatus = await simpleAuthManager.isAuthenticated()
      if (!authStatus) {
        return { success: false, error: '用户未认证' }
      }

      const sessionId = simpleAuthManager.getToken()
      if (!sessionId) {
        return { success: false, error: '无session信息' }
      }


      const response = await fetchWithVersion(`${API_BASE_URL}/api/client/credits/check`, {

        method: 'POST',
        headers: {
          'X-Session-Id': sessionId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modelName, questionType })
      })

      if (response.ok) {
        const data = await response.json()
        return { success: true, ...data }
      } else {
        const error = await response.json()
        return { success: false, error: error.error || '检查积分失败' }
      }
    } catch (error) {
      console.error('检查积分错误:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("credits:deduct", async (_event, { modelName, questionType, operationId }) => {
    try {
      const authStatus = await simpleAuthManager.isAuthenticated()
      if (!authStatus) {
        return { success: false, error: '用户未认证' }
      }

      const sessionId = simpleAuthManager.getToken()
      if (!sessionId) {
        return { success: false, error: '无session信息' }
      }


      const response = await fetchWithVersion(`${API_BASE_URL}/api/client/credits/deduct`, {

        method: 'POST',
        headers: {
          'X-Session-Id': sessionId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ modelName, questionType, operationId })
      })

      if (response.ok) {
        const data = await response.json()
        // 更新前端积分显示
        const mainWindow = deps.getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send("credits-updated", data.newCredits)
        }
        return { success: true, ...data }
      } else {
        const error = await response.json()
        return { success: false, error: error.error || '扣除积分失败' }
      }
    } catch (error) {
      console.error('扣除积分错误:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("credits:refund", async (_event, { operationId, amount, reason }) => {
    try {
      const authStatus = await simpleAuthManager.isAuthenticated()
      if (!authStatus) {
        return { success: false, error: '用户未认证' }
      }

      const sessionId = simpleAuthManager.getToken()
      if (!sessionId) {
        return { success: false, error: '无session信息' }
      }


      const response = await fetchWithVersion(`${API_BASE_URL}/api/client/credits/refund`, {

        method: 'POST',
        headers: {
          'X-Session-Id': sessionId,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ operationId, amount, reason })
      })

      if (response.ok) {
        const data = await response.json()
        // 更新前端积分显示
        const mainWindow = deps.getMainWindow()
        if (mainWindow) {
          mainWindow.webContents.send("credits-updated", data.newCredits)
        }
        return { success: true, ...data }
      } else {
        const error = await response.json()
        return { success: false, error: error.error || '退还积分失败' }
      }
    } catch (error) {
      console.error('退还积分错误:', error)
      return { success: false, error: error.message }
    }
  })

  // 🆕 兼容旧系统的处理器（逐步废弃）
  ipcMain.handle("set-initial-credits", async (_event, credits: number) => {
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return

    try {
      await mainWindow.webContents.executeJavaScript(
        `window.__CREDITS__ = ${credits}`
      )
      mainWindow.webContents.send("credits-updated", credits)
    } catch (error) {
      console.error("Error setting initial credits:", error)
      throw error
    }
  })

  ipcMain.handle("decrement-credits", async () => {
    // 这个方法现在被credits:deduct替代，保留用于兼容性
    console.warn("⚠️ decrement-credits已废弃，请使用credits:deduct")
    const mainWindow = deps.getMainWindow()
    if (!mainWindow) return

    try {
      const currentCredits = await mainWindow.webContents.executeJavaScript(
        "window.__CREDITS__"
      )
      if (currentCredits > 0) {
        const newCredits = currentCredits - 1
        await mainWindow.webContents.executeJavaScript(
          `window.__CREDITS__ = ${newCredits}`
        )
        mainWindow.webContents.send("credits-updated", newCredits)
      }
    } catch (error) {
      console.error("Error decrementing credits:", error)
    }
  })

  // Screenshot queue handlers
  ipcMain.handle("get-screenshot-queue", () => {
    return deps.getScreenshotQueue()
  })

  ipcMain.handle("get-extra-screenshot-queue", () => {
    return deps.getExtraScreenshotQueue()
  })


  ipcMain.handle("delete-screenshot", async (event, path: string) => {
    return deps.deleteScreenshot(path)
  })

  ipcMain.handle("get-image-preview", async (event, path: string) => {
    return deps.getImagePreview(path)
  })

  // 代码复制处理器
  ipcMain.handle("copy-code-to-clipboard", async (event, code: string) => {
    try {
      clipboard.writeText(code)
      console.log("✅ Code copied to clipboard successfully via main process")
      return { success: true }
    } catch (error) {
      console.error("❌ Failed to copy code to clipboard:", error)
      return { success: false, error: error.message }
    }
  })

  // Screenshot processing handlers
  ipcMain.handle("process-screenshots", async () => {
    // API key is now built-in, no need to check
    await deps.processingHelper?.processScreenshots()
  })

  // Window dimension handlers
  ipcMain.handle(
    "update-content-dimensions",
    async (event, { width, height }: { width?: number; height?: number }) => {
      if (height) {
        // 如果只传了高度，保持当前宽度
        if (!width) {
          const mainWindow = deps.getMainWindow()
          if (mainWindow) {
            const currentBounds = mainWindow.getBounds()
            width = currentBounds.width
          }
        }
        deps.setWindowDimensions(width, height)
      }
    }
  )

  ipcMain.handle(
    "set-window-dimensions",
    (event, width: number, height: number) => {
      deps.setWindowDimensions(width, height)
    }
  )

  // Screenshot management handlers
  ipcMain.handle("get-screenshots", async () => {
    try {
      let previews = []
      const currentView = deps.getView()

      if (currentView === "queue") {
        const queue = deps.getScreenshotQueue()
        previews = await Promise.all(
          queue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path)
          }))
        )
      } else {
        const extraQueue = deps.getExtraScreenshotQueue()
        previews = await Promise.all(
          extraQueue.map(async (path) => ({
            path,
            preview: await deps.getImagePreview(path)
          }))
        )
      }

      return previews
    } catch (error) {
      console.error("Error getting screenshots:", error)
      throw error
    }
  })

  // Screenshot trigger handlers
  ipcMain.handle("trigger-screenshot", async () => {
    const mainWindow = deps.getMainWindow()
    if (mainWindow) {
      try {
        const currentView = deps.getView?.()
        // 🆕 仅在非队列视图下自动执行重置，避免多余操作
        if (currentView && currentView !== 'queue' && deps.shortcutsHelper?.performCompleteReset) {
          console.log('🔄 [auto-before-screenshot] 当前视图为', currentView, ',执行完整重置后再截图')
          await deps.shortcutsHelper.performCompleteReset('auto-before-screenshot')
        } else {
          console.log('ℹ️ [auto-before-screenshot] 当前为 Queue 视图，直接截图')
        }

        const screenshotPath = await deps.takeScreenshot()
        const preview = await deps.getImagePreview(screenshotPath)
        mainWindow.webContents.send("screenshot-taken", {
          path: screenshotPath,
          preview
        })
        return { success: true }
      } catch (error) {
        console.error("Error triggering screenshot:", error)
        return { error: "Failed to trigger screenshot" }
      }
    }
    return { error: "No main window available" }
  })

  ipcMain.handle("take-screenshot", async () => {
    try {
      const screenshotPath = await deps.takeScreenshot()
      const preview = await deps.getImagePreview(screenshotPath)
      return { path: screenshotPath, preview }
    } catch (error) {
      console.error("Error taking screenshot:", error)
      return { error: "Failed to take screenshot" }
    }
  })

  // Web Authentication handlers
  ipcMain.handle("web-auth-login", async () => {
    try {
      const success = await simpleAuthManager.login()
      return { success }
    } catch (error) {
      console.error("Failed to open web login:", error)
      return { success: false, error: (error as Error).message }
    }
  })

  ipcMain.handle("web-auth-logout", async () => {
    try {
      await simpleAuthManager.logout()
      return { success: true }
    } catch (error) {
      console.error("Failed to logout:", error)
      return { success: false, error: error.message }
    }
  })

  // 🆕 手动触发自动重新登录
  ipcMain.handle("attempt-auto-relogin", async () => {
    try {
      console.log("📱 IPC: 手动触发自动重新登录")
      const success = await simpleAuthManager.attemptAutoRelogin()
      return { success, user: success ? simpleAuthManager.getCurrentUser() : null }
    } catch (error) {
      console.error("Failed to attempt auto relogin:", error)
      return { success: false, error: error.message }
    }
  })

  // 🆕 透明度控制IPC处理器 - 改为控制CSS背景透明度而非窗口透明度
  ipcMain.handle("adjust-opacity", (event, delta: number) => {
    try {
      const mainWindow = deps.getMainWindow()
      if (!mainWindow) {
        return { success: false, error: "Main window not available" }
      }
      
      // 从配置获取当前透明度值
      const config = configHelper.loadConfig()
      const currentOpacity = config.clientSettings?.backgroundOpacity ?? 0.8
      const newOpacity = Math.max(0, Math.min(1.0, currentOpacity + delta))
      console.log(`IPC调整背景透明度: ${currentOpacity} -> ${newOpacity}`)
      
      // 发送CSS透明度更新事件到前端
      mainWindow.webContents.send("background-opacity-changed", newOpacity)
      
      // 保存背景透明度到配置文件
      configHelper.updateClientSettings({ backgroundOpacity: newOpacity })
      
      return { 
        success: true, 
        opacity: newOpacity,
        previousOpacity: currentOpacity 
      }
    } catch (error) {
      console.error("Failed to adjust background opacity:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("get-opacity", () => {
    try {
      // 从配置获取背景透明度值
      const config = configHelper.loadConfig()
      const currentOpacity = config.clientSettings?.backgroundOpacity ?? 0.8
      return { success: true, opacity: currentOpacity }
    } catch (error) {
      console.error("Failed to get background opacity:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("set-opacity", (event, opacity: number) => {
    try {
      const targetWindow = deps.getMainWindow()
      const clampedOpacity = Math.max(0, Math.min(1.0, opacity))
      console.log(`IPC设置背景透明度: ${clampedOpacity}`)
      
      // 发送CSS透明度更新事件到前端
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send("background-opacity-changed", clampedOpacity)
      }
      
      // 保存背景透明度到配置文件
      configHelper.updateClientSettings({ backgroundOpacity: clampedOpacity })
      
      return { success: true, opacity: clampedOpacity }
    } catch (error) {
      console.error("Failed to set background opacity:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("web-auth-status", async () => {
    try {
      const isAuthenticated = await simpleAuthManager.isAuthenticated()
      const user = simpleAuthManager.getCurrentUser()
      const sessionId = simpleAuthManager.getToken() // token就是sessionId
      const versionInfo = simpleAuthManager.getVersionInfo() // 🆕 获取版本信息
      console.log(`📤 [IPC] web-auth-status 返回版本信息:`, versionInfo)
      return { 
        authenticated: isAuthenticated, 
        user: user,
        sessionId: sessionId,
        version: versionInfo // 🆕 返回版本信息
      }
    } catch (error) {
      console.error("Failed to check auth status:", error)
      return { 
        authenticated: false, 
        user: null, 
        error: error.message 
      }
    }
  })

  ipcMain.handle("web-sync-config", async () => {
    try {
      const config = await simpleAuthManager.refreshUserConfig()
      return { success: true, config: config }
    } catch (error) {
      console.error("Failed to sync config:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("web-update-config", async (_event, configUpdates) => {
    try {
      // 简化版：不支持更新Web配置，只返回当前配置
      const config = simpleAuthManager.getUserConfig()
      return { success: true, config: config }
    } catch (error) {
      console.error("Failed to update web config:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("web-get-ai-models", async () => {
    try {
      // 🆕 从数据库动态获取模型列表
      const token = simpleAuthManager.getToken()
      if (!token) {
        console.log("❌ 获取AI模型列表失败：用户未登录")
        return { success: false, error: "用户未登录", models: [] }
      }

      const response = await fetchWithVersion(`${API_BASE_URL}/api/client/credits/models`, {

        method: 'GET',
        headers: {
          'X-Session-Id': token,
          'Content-Type': 'application/json'
        }
      })

      const result = await response.json()
      console.log('📋 从数据库获取模型列表结果:', result)

      if (!response.ok || !result.success) {
        console.error("❌ 获取模型列表失败:", result.message)
        // 降级到硬编码列表
        const fallbackModels = [
          'gpt-5.5',
          'gemini-2.5-flash',
          'doubao-seed-1.6-vision'
        ]
        return { success: true, models: fallbackModels, source: 'fallback' }
      }

      // 返回所有可用模型的列表
      const models = result.data.allModels || []
      console.log(`✅ 成功获取 ${models.length} 个模型:`, models)
      
      return { 
        success: true, 
        models: models,
        source: 'database',
        byQuestionType: result.data.byQuestionType
      }
    } catch (error) {
      console.error("获取AI模型列表异常:", error)
      // 降级到硬编码列表
      const fallbackModels = [
        'gpt-5.5',
        'gemini-2.5-flash',
        'doubao-seed-1.6-vision'
      ]
      return { success: true, models: fallbackModels, source: 'fallback', error: error.message }
    }
  })

  ipcMain.handle("web-get-languages", async () => {
    try {
      // 简化版：返回固定的语言列表
      const languages = ['python', 'javascript', 'java', 'cpp', 'go', 'rust']
      return { success: true, languages: languages }
    } catch (error) {
      console.error("Failed to get languages:", error)
      return { success: false, error: error.message, languages: [] }
    }
  })


  // Handle notification actions
  ipcMain.handle("handle-notification-action", async (_event, action) => {
    try {
      console.log("Handling notification action:", action)
      
      switch (action) {
        case 'open-web-login':
          const success = await simpleAuthManager.login()
          return { success }
        

        
        case 'open-startup-guide':
          // Open startup guide or documentation
          await shell.openExternal('https://github.com/your-repo/startup-guide')
          return { success: true }
        
        default:
          console.log("Unknown notification action:", action)
          return { success: false, error: "Unknown action" }
      }
    } catch (error) {
      console.error("Failed to handle notification action:", error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle("web-check-connection", async () => {
    try {
      // 🆕 检查后端服务器连接状态
      const connected = await simpleAuthManager.checkConnection()
      return { connected: connected }
    } catch (error) {
      console.error("Failed to check web connection:", error)
      return { connected: false, error: error.message }
    }
  })

  ipcMain.handle("open-external-url", (event, url: string) => {
    shell.openExternal(url)
  })
  
  // Open external URL handler
  ipcMain.handle("openLink", (event, url: string) => {
    try {
      console.log(`Opening external URL: ${url}`);
      shell.openExternal(url);
      return { success: true };
    } catch (error) {
      console.error(`Error opening URL ${url}:`, error);
      return { success: false, error: `Failed to open URL: ${error}` };
    }
  })

  // Settings portal handler
  ipcMain.handle("open-settings-portal", () => {
    const mainWindow = deps.getMainWindow();
    if (mainWindow) {
      mainWindow.webContents.send("show-settings-dialog");
      return { success: true };
    }
    return { success: false, error: "Main window not available" };
  })

  // Window management handlers
  ipcMain.handle("toggle-window", () => {
    try {
      deps.toggleMainWindow()
      return { success: true }
    } catch (error) {
      console.error("Error toggling window:", error)
      return { error: "Failed to toggle window" }
    }
  })

  ipcMain.handle("reset-queues", async () => {
    try {
      deps.clearQueues()
      return { success: true }
    } catch (error) {
      console.error("Error resetting queues:", error)
      return { error: "Failed to reset queues" }
    }
  })

  // Process screenshot handlers
  ipcMain.handle("trigger-process-screenshots", async (_event, options?: { mock?: boolean }) => {
    try {
      // API key is now built-in, no need to check
      if (options?.mock) {
        deps.clearQueues()
        deps.setView("queue")
        const mainWindow = deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("reset-view")
        }
        return { success: true, mock: true }
      }
      await deps.processingHelper?.processScreenshots()
      return { success: true }
    } catch (error) {
      console.error("Error processing screenshots:", error)
      return { error: "Failed to process screenshots" }
    }
  })

  // 🆕 专门的调试处理器
  ipcMain.handle("trigger-debug-screenshots", async () => {
    try {
      console.log('🔧 触发调试功能...')
      const processingHelper = deps.processingHelper
      if (!processingHelper) {
        return { error: "Processing helper not available" }
      }

      // 调用轻量级调试处理
      await processingHelper.debugCode({})
      
      return { success: true }
    } catch (error) {
      console.error("Error processing debug screenshots:", error)
      return { error: "Failed to process debug screenshots" }
    }
  })

  // Reset handlers
  ipcMain.handle("trigger-reset", () => {
    try {
      // Clear all queues immediately
      deps.clearQueues()

      // Reset view to queue
      deps.setView("queue")

      // Get main window and send reset events
      const mainWindow = deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        // Send reset events in sequence
        mainWindow.webContents.send("reset-view")
        mainWindow.webContents.send("reset")
      }

      return { success: true }
    } catch (error) {
      console.error("Error triggering reset:", error)
      return { error: "Failed to trigger reset" }
    }
  })

  // Window movement handlers
  ipcMain.handle("trigger-move-left", () => {
    try {
      deps.moveWindowLeft()
      return { success: true }
    } catch (error) {
      console.error("Error moving window left:", error)
      return { error: "Failed to move window left" }
    }
  })

  ipcMain.handle("trigger-move-right", () => {
    try {
      deps.moveWindowRight()
      return { success: true }
    } catch (error) {
      console.error("Error moving window right:", error)
      return { error: "Failed to move window right" }
    }
  })

  ipcMain.handle("trigger-move-up", () => {
    try {
      deps.moveWindowUp()
      return { success: true }
    } catch (error) {
      console.error("Error moving window up:", error)
      return { error: "Failed to move window up" }
    }
  })

  ipcMain.handle("trigger-move-down", () => {
    try {
      deps.moveWindowDown()
      return { success: true }
    } catch (error) {
      console.error("Error moving window down:", error)
      return { error: "Failed to move window down" }
    }
  })
  
  // Delete last screenshot handler
  ipcMain.handle("delete-last-screenshot", async () => {
    try {
      const queue = deps.getView() === "queue" 
        ? deps.getScreenshotQueue() 
        : deps.getExtraScreenshotQueue()
      
      if (queue.length === 0) {
        return { success: false, error: "No screenshots to delete" }
      }
      
      // Get the last screenshot in the queue
      const lastScreenshot = queue[queue.length - 1]
      
      // Delete it
      const result = await deps.deleteScreenshot(lastScreenshot)
      
      // Notify the renderer about the change
      const mainWindow = deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("screenshot-deleted", { path: lastScreenshot })
      }
      
      return result
    } catch (error) {
      console.error("Error deleting last screenshot:", error)
      return { success: false, error: "Failed to delete last screenshot" }
    }
  })
  
  // 处理显示设置对话框的请求
  ipcMain.on("show-settings-dialog", () => {
    const mainWindow = deps.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("show-settings-dialog")
    }
  })

  // 🆕 新架构AI处理请求处理器
  // 处理来自LightweightProcessingHelper的AI处理请求
  ipcMain.on("ai-process-request", (event, requestData) => {
    console.log('📨 收到AI处理请求:', requestData.type, requestData.triggerType)
    
    const mainWindow = deps.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 转发到前端渲染进程
      mainWindow.webContents.send("ai-process-request", requestData)
      console.log('✅ AI处理请求已转发到前端')
    } else {
      console.error('❌ 主窗口不可用，无法转发AI处理请求')
    }
  })

  // 处理来自LightweightProcessingHelper的调试请求
  ipcMain.on("ai-debug-request", (event, requestData) => {
    console.log('📨 收到AI调试请求:', requestData.language, requestData.triggerType)
    
    const mainWindow = deps.getMainWindow()
    if (mainWindow && !mainWindow.isDestroyed()) {
      // 转发到前端渲染进程
      mainWindow.webContents.send("ai-debug-request", requestData)
      console.log('✅ AI调试请求已转发到前端')
    } else {
      console.error('❌ 主窗口不可用，无法转发AI调试请求')
    }
  })
}

// 积分管理 (独立导出，在main.ts中单独注册)
export function registerCreditsHandlers(deps: IIpcHandlerDeps) {
  console.log('Initializing credits IPC handlers')
  const makeAuthenticatedRequest = async (endpoint: string, options: any = {}) => {
    const token = simpleAuthManager.getToken()
    if (!token) {
      return { success: false, error: 'User not authenticated' }
    }
    try {
      const response = await fetchWithVersion(`${API_BASE_URL}${endpoint}`, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'X-Session-Id': token,
          ...options.headers,
        },
      })
      const data = await response.json()
      return { success: response.ok, ...data }
    } catch (error) {
      return { success: false, error: (error as Error).message }
    }
  }

  ipcMain.handle('credits:get', async () => {
    return makeAuthenticatedRequest('/api/client/credits')
  })

  ipcMain.handle('credits:check', async (_event, { modelName, questionType }) => {
    return makeAuthenticatedRequest('/api/client/credits/check', {
      method: 'POST',
      body: JSON.stringify({ modelName, questionType }),
    })
  })

  ipcMain.handle('credits:deduct', async (_event, { modelName, questionType, operationId }) => {
    const result = await makeAuthenticatedRequest('/api/client/credits/deduct', {
      method: 'POST',
      body: JSON.stringify({ modelName, questionType, operationId }),
    })
    if (result.success) {
      deps.getMainWindow()?.webContents.send('credits-updated', result.newCredits)
    }
    return result
  })

  ipcMain.handle('credits:refund', async (_event, { amount, operationId, reason }) => {
    const result = await makeAuthenticatedRequest('/api/client/credits/refund', {
      method: 'POST',
      body: JSON.stringify({ amount, operationId, reason }),
    })
    if (result.success) {
      deps.getMainWindow()?.webContents.send('credits-updated', result.newCredits)
    }
    return result
  })

  // 🆕 流式传输控制处理器（轻量级版本不需要取消功能）
  ipcMain.handle('cancel-streaming', async () => {
    console.log('✅ 轻量级版本无需取消流式传输')
    return { success: true, message: '轻量级版本无需取消流式传输' }
  })
  
  console.log('🔍 [IPC] cancel-streaming 处理器注册完成')

  console.log('🔍 [IPC] 准备注册SSE事件处理器...')

  try {
    // 🆕 SSE流式解决方案IPC事件处理器
    console.log('🔧 [IPC-MAIN] 注册SSE事件监听器...')
    
    ipcMain.on(deps.PROCESSING_EVENTS.INITIAL_START, () => {
      console.log('📨 [IPC-MAIN] 接收到solution-start事件')
      // 转发给渲染进程中的组件
      deps.getMainWindow()?.webContents.send(deps.PROCESSING_EVENTS.INITIAL_START)
    })

    console.log('🔧 [IPC-MAIN] 注册solution-stream-chunk监听器，事件名:', deps.PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK)
    ipcMain.on(deps.PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK, (event, data) => {
      console.log('📨 [IPC-MAIN] 接收到流式内容块:', {
        contentLength: data.fullContent?.length,
        contentPreview: data.fullContent?.substring(0, 100) + '...',
        progress: data.progress,
        isComplete: data.isComplete,
        streamingStarted: data.streamingStarted
      })
      // 转发给渲染进程中的显示组件
      deps.getMainWindow()?.webContents.send(deps.PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK, data)
    })

    ipcMain.on(deps.PROCESSING_EVENTS.SOLUTION_SUCCESS, (event, data) => {
      console.log('📨 [IPC-MAIN] 接收到最终解决方案结果')
      // 转发给渲染进程中的显示组件
      deps.getMainWindow()?.webContents.send(deps.PROCESSING_EVENTS.SOLUTION_SUCCESS, data)
    })
    
    console.log("✅ [IPC] SSE事件处理器注册成功")
  } catch (error) {
    console.error("❌ [IPC] SSE事件处理器注册失败:", error)
  }
  
  console.log("✅ [IPC] IPC处理器初始化完成，包含流式事件处理器")
}

// 兼容性检测 IPC 处理器
export function registerCompatibilityHandlers(deps: IIpcHandlerDeps) {
  console.log('Initializing compatibility check IPC handlers')
  
  let compatibilityChecker: CompatibilityChecker | null = null

  // 启动兼容性检测
  ipcMain.handle('start-compatibility-check', async () => {
    try {
      console.log('🔍 启动兼容性检测...')
      
      // 创建检测器实例，传入进度回调和ShortcutsHelper
      compatibilityChecker = new CompatibilityChecker((result: CompatibilityResult) => {
        // 发送进度更新到渲染进程
        const mainWindow = deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('compatibility-progress', result)
        }
      }, deps.shortcutsHelper)

      // 执行完整检测
      const report = await compatibilityChecker.runFullCheck()
      
      // 发送完成事件到渲染进程
      const mainWindow = deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('compatibility-complete', report)
      }

      console.log('✅ 兼容性检测完成')
      return { 
        success: true, 
        report: report,
        message: '兼容性检测完成'
      }
    } catch (error) {
      console.error('❌ 兼容性检测失败:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 获取最后的检测报告
  ipcMain.handle('get-compatibility-report', async () => {
    try {
      if (!compatibilityChecker) {
        return { success: false, error: '尚未进行兼容性检测' }
      }

      // 这里可以返回缓存的报告或重新生成
      const report = await compatibilityChecker.runFullCheck()
      return { success: true, report: report }
    } catch (error) {
      console.error('获取兼容性报告失败:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 导出兼容性报告
  ipcMain.handle('export-compatibility-report', async (_event, report: CompatibilityReport) => {
    try {
      const { dialog } = require('electron')
      const fs = require('fs')
      const path = require('path')
      
      // 生成报告文本
      const reportText = compatibilityChecker?.generateReport(report) || '无法生成报告'
      
      // 显示保存对话框
      const result = await dialog.showSaveDialog(deps.getMainWindow(), {
        title: '导出兼容性检测报告',
        defaultPath: `compatibility-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`,
        filters: [
          { name: '文本文件', extensions: ['txt'] },
          { name: '所有文件', extensions: ['*'] }
        ]
      })

      if (!result.canceled && result.filePath) {
        fs.writeFileSync(result.filePath, reportText, 'utf8')
        return { 
          success: true, 
          filePath: result.filePath,
          message: '报告已成功保存'
        }
      } else {
        return { success: false, error: '用户取消了保存操作' }
      }
    } catch (error) {
      console.error('导出兼容性报告失败:', error)
      return { 
        success: false, 
        error: error instanceof Error ? error.message : String(error)
      }
    }
  })

  // 获取平台信息
  ipcMain.handle('get-platform-info', () => {
    const os = require('os')
    return {
      platform: process.platform,
      version: os.release(),
      arch: process.arch,
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      chromeVersion: process.versions.chrome
    }
  })

  ipcMain.handle('renderer-view:set', (_event, view: 'queue' | 'solutions' | 'debug') => {
    deps.setView?.(view)
  })

  // 监听快捷键恢复事件
  ipcMain.on('restore-shortcuts', () => {
    console.log('🔄 收到恢复快捷键信号，重新注册...')
    try {
      // 获取 ShortcutsHelper 实例并重新注册
      const mainWindow = deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        // 延迟一点时间确保之前的注册已清除
        setTimeout(() => {
          // 这里需要访问 ShortcutsHelper 实例
          // 由于架构限制，我们发送信号让主进程处理
          mainWindow.webContents.send('shortcuts-restore-needed')
        }, 100)
      }
    } catch (error) {
      console.error('❌ 恢复快捷键时出错:', error)
    }
  })

  console.log('✅ 兼容性检测 IPC 处理器注册完成')
}

/**
 * 反录屏保护控制处理器
 */
export function registerAntiCaptureHandlers(deps: IIpcHandlerDeps & { antiCapture?: any }) {
  console.log('注册反录屏保护控制处理器')

  // 获取反录屏保护状态
  ipcMain.handle('anti-capture:get-status', () => {
    try {
      if (deps.antiCapture) {
        return { success: true, status: deps.antiCapture.getStatus() }
      }
      return { success: false, error: '反录屏保护未初始化' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 设置保护级别
  ipcMain.handle('anti-capture:set-level', (_event, level: 'high' | 'medium' | 'low') => {
    try {
      if (deps.antiCapture) {
        deps.antiCapture.setProtectionLevel(level)
        console.log(`🎛️ 反录屏保护级别设置为: ${level}`)
        return { success: true, level }
      }
      return { success: false, error: '反录屏保护未初始化' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  // 临时降低保护（截图时使用）
  ipcMain.handle('anti-capture:temporary-reduce', (_event, duration: number = 1000) => {
    try {
      if (deps.antiCapture) {
        deps.antiCapture.temporaryReduce(duration)
        console.log(`🔄 临时降低反录屏保护 ${duration}ms`)
        return { success: true, duration }
      }
      return { success: false, error: '反录屏保护未初始化' }
    } catch (error) {
      return { success: false, error: error.message }
    }
  })

  console.log('✅ 反录屏保护控制处理器注册完成')
}

/**
 * Registers IPC handlers for application settings.
 */
