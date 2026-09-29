console.log("Preload script starting...")
import { contextBridge, ipcRenderer } from "electron"
const { shell } = require("electron")

export const PROCESSING_EVENTS = {
  //global states
  UNAUTHORIZED: "procesing-unauthorized",
  NO_SCREENSHOTS: "processing-no-screenshots",
  OUT_OF_CREDITS: "out-of-credits",
  API_KEY_INVALID: "api-key-invalid",

  //states for generating the initial solution
  INITIAL_START: "initial-start",
  PROBLEM_EXTRACTED: "problem-extracted",
  SOLUTION_SUCCESS: "solution-success",
  INITIAL_SOLUTION_ERROR: "solution-error",
  RESET: "reset",

  //states for processing the debugging
  DEBUG_START: "debug-start",
  DEBUG_SUCCESS: "debug-success", 
  DEBUG_ERROR: "debug-error",
  REQUEST_CODE_FOR_COPY: "request-code-for-copy",
  
  // 🆕 流式输出事件
  SOLUTION_STREAM_CHUNK: "solution-stream-chunk",
  SOLUTION_STREAM_COMPLETE: "solution-stream-complete",
  SOLUTION_STREAM_ERROR: "solution-stream-error"
} as const

// At the top of the file
console.log("Preload script is running")

const electronAPI = {
  // Original methods
  openSubscriptionPortal: async (authData: { id: string; email: string }) => {
    return ipcRenderer.invoke("open-subscription-portal", authData)
  },
  openSettingsPortal: () => ipcRenderer.invoke("open-settings-portal"),
  getAppVersion: () => ipcRenderer.invoke('app-version'),
  updateContentDimensions: (dimensions: { width: number; height: number }) =>
    ipcRenderer.invoke("update-content-dimensions", dimensions),
  clearStore: () => ipcRenderer.invoke("clear-store"),
  getScreenshots: () => ipcRenderer.invoke("get-screenshots"),
  deleteScreenshot: (path: string) =>
    ipcRenderer.invoke("delete-screenshot", path),
  toggleMainWindow: async () => {
    console.log("toggleMainWindow called from preload")
    try {
      const result = await ipcRenderer.invoke("toggle-window")
      console.log("toggle-window result:", result)
      return result
    } catch (error) {
      console.error("Error in toggleMainWindow:", error)
      throw error
    }
  },
  loginWithCredentials: (payload: { email: string; password: string }) =>
    ipcRenderer.invoke('auth:login-with-credentials', payload),
  openExamClient: () => ipcRenderer.invoke('ui:launch-exam-client'),
  getShortcutBindings: () => ipcRenderer.invoke('shortcuts:get-bindings'),
  updateShortcutBinding: (payload: { action: string; accelerator: string }) =>
    ipcRenderer.invoke('shortcuts:update-binding', payload),
  syncUserShortcuts: (shortcuts: Record<string, string>) =>
    ipcRenderer.invoke('shortcuts:sync-user', shortcuts),
  startShortcutTestMode: () => ipcRenderer.invoke('shortcuts:start-test-mode'),
  stopShortcutTestMode: () => ipcRenderer.invoke('shortcuts:stop-test-mode'),
  onShortcutTestResult: (callback: (result: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on('shortcut-test-result', subscription)
    return () => ipcRenderer.removeListener('shortcut-test-result', subscription)
  },
  onShortcutsUpdated: (callback: (bindings: Record<string, string>) => void) => {
    const subscription = (_: any, data: Record<string, string>) => callback(data)
    ipcRenderer.on('shortcuts-updated', subscription)
    return () => ipcRenderer.removeListener('shortcuts-updated', subscription)
  },
  onShortcutRuntimeStatus: (callback: (status: { type: 'success' | 'error'; message: string }) => void) => {
    const subscription = (_: Electron.IpcRendererEvent, status: { type: 'success' | 'error'; message: string }) => callback(status)
    ipcRenderer.on('shortcut-runtime-status', subscription)
    return () => ipcRenderer.removeListener('shortcut-runtime-status', subscription)
  },
  downloadLatestVersion: (url: string) => ipcRenderer.invoke('updates:download-latest', url),
  windowControl: (action: 'minimize' | 'close' | 'toggle-maximize') => ipcRenderer.invoke('window-control', action),
  recoverWindow: () => ipcRenderer.invoke('window-recover'),
  remoteControl: {
    createPairing: () => ipcRenderer.invoke('remote:create-pairing'),
    disconnect: () => ipcRenderer.invoke('remote:disconnect'),
    onState: (callback: (state: { connected: boolean; code?: string; expiresAt?: number; remoteUrl?: string; pairingLoading?: boolean; error?: string }) => void) => {
      const subscription = (_event: Electron.IpcRendererEvent, state: any) => callback(state)
      ipcRenderer.on('remote-control-state', subscription)
      return () => ipcRenderer.removeListener('remote-control-state', subscription)
    }
  },
  getClientTheme: () => ipcRenderer.invoke('client-theme:get'),
  setClientTheme: (theme: 'dark' | 'light') => ipcRenderer.invoke('client-theme:set', theme),
  onThemeChanged: (callback: (theme: 'dark' | 'light') => void) => {
    const subscription = (_: any, theme: 'dark' | 'light') => callback(theme)
    ipcRenderer.on('client-theme-changed', subscription)
    return () => {
      ipcRenderer.removeListener('client-theme-changed', subscription)
    }
  },
  // Event listeners
  onScreenshotTaken: (
    callback: (data: { path: string; preview: string; type?: string; timestamp?: number }) => void
  ) => {
    const subscription = (_: any, data: { path: string; preview: string; type?: string; timestamp?: number }) =>
      callback(data)
    ipcRenderer.on("screenshot-taken", subscription)
    return () => {
      ipcRenderer.removeListener("screenshot-taken", subscription)
    }
  },
  onResetView: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("reset-view", subscription)
    return () => {
      ipcRenderer.removeListener("reset-view", subscription)
    }
  },
  // 🆕 部分截图相关事件
  onPartialScreenshotStarted: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("partial-screenshot-started", subscription)
    return () => {
      ipcRenderer.removeListener("partial-screenshot-started", subscription)
    }
  },
  onPartialScreenshotError: (callback: (error: { error: string }) => void) => {
    const subscription = (_: any, data: { error: string }) => callback(data)
    ipcRenderer.on("partial-screenshot-error", subscription)
    return () => {
      ipcRenderer.removeListener("partial-screenshot-error", subscription)
    }
  },
  onPartialScreenshotStep: (callback: (data: { step: number }) => void) => {
    const subscription = (_: any, data: { step: number }) => callback(data)
    ipcRenderer.on("partial-screenshot-step", subscription)
    return () => {
      ipcRenderer.removeListener("partial-screenshot-step", subscription)
    }
  },
  onScreenshotsCleared: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("screenshots-cleared", subscription)
    return () => {
      ipcRenderer.removeListener("screenshots-cleared", subscription)
    }
  },
  onSolutionStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.INITIAL_START, subscription)
    }
  },
  onDebugStart: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_START, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_START, subscription)
    }
  },
  onDebugSuccess: (callback: (data: any) => void) => {
    ipcRenderer.on("debug-success", (_event, data) => callback(data))
    return () => {
      ipcRenderer.removeListener("debug-success", (_event, data) =>
        callback(data)
      )
    }
  },
  onDebugError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.DEBUG_ERROR, subscription)
    }
  },
  onDebugStreamChunk: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on("debug-stream-chunk", subscription)
    return () => {
      ipcRenderer.removeListener("debug-stream-chunk", subscription)
    }
  },
  onSolutionError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.INITIAL_SOLUTION_ERROR,
        subscription
      )
    }
  },
  onProcessingNoScreenshots: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.NO_SCREENSHOTS, subscription)
    }
  },
  onOutOfCredits: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.OUT_OF_CREDITS, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.OUT_OF_CREDITS, subscription)
    }
  },
  onProblemExtracted: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.PROBLEM_EXTRACTED, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.PROBLEM_EXTRACTED,
        subscription
      )
    }
  },
  onSolutionSuccess: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_SUCCESS, subscription)
    return () => {
      ipcRenderer.removeListener(
        PROCESSING_EVENTS.SOLUTION_SUCCESS,
        subscription
      )
    }
  },
  onUnauthorized: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.UNAUTHORIZED, subscription)
    }
  },
  // External URL handler
  openLink: (url: string) => shell.openExternal(url),
  triggerScreenshot: () => ipcRenderer.invoke("trigger-screenshot"),
  triggerProcessScreenshots: () =>
    ipcRenderer.invoke("trigger-process-screenshots"),
  triggerDebugScreenshots: () =>
    ipcRenderer.invoke("trigger-debug-screenshots"),
  triggerReset: () => ipcRenderer.invoke("trigger-reset"),
  triggerMoveLeft: () => ipcRenderer.invoke("trigger-move-left"),
  triggerMoveRight: () => ipcRenderer.invoke("trigger-move-right"),
  triggerMoveUp: () => ipcRenderer.invoke("trigger-move-up"),
  triggerMoveDown: () => ipcRenderer.invoke("trigger-move-down"),
  onSubscriptionUpdated: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("subscription-updated", subscription)
    return () => {
      ipcRenderer.removeListener("subscription-updated", subscription)
    }
  },
  onSubscriptionPortalClosed: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("subscription-portal-closed", subscription)
    return () => {
      ipcRenderer.removeListener("subscription-portal-closed", subscription)
    }
  },
  onReset: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.RESET, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.RESET, subscription)
    }
  },
  onRequestCodeForCopy: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.REQUEST_CODE_FOR_COPY, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.REQUEST_CODE_FOR_COPY, subscription)
    }
  },
  startUpdate: () => ipcRenderer.invoke("start-update"),
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  installUpdate: () => ipcRenderer.invoke("install-update"),
  onUpdateAvailable: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-available", subscription)
    return () => {
      ipcRenderer.removeListener("update-available", subscription)
    }
  },
  onUpdateDownloaded: (callback: (info: any) => void) => {
    const subscription = (_: any, info: any) => callback(info)
    ipcRenderer.on("update-downloaded", subscription)
    return () => {
      ipcRenderer.removeListener("update-downloaded", subscription)
    }
  },
  // 🆕 新的积分管理方法
  creditsGet: () => ipcRenderer.invoke("credits:get"),
  creditsCheck: (params: { modelName: string; questionType: string }) => 
    ipcRenderer.invoke("credits:check", params),
  creditsDeduct: (params: { modelName: string; questionType: string; operationId?: string }) => 
    ipcRenderer.invoke("credits:deduct", params),
  creditsRefund: (params: { operationId: string; amount: number; reason?: string }) => 
    ipcRenderer.invoke("credits:refund", params),

  // 🆕 兼容旧系统的方法（逐步废弃）
  decrementCredits: () => ipcRenderer.invoke("decrement-credits"),
  onCreditsUpdated: (callback: (credits: number) => void) => {
    const subscription = (_event: any, credits: number) => callback(credits)
    ipcRenderer.on("credits-updated", subscription)
    return () => {
      ipcRenderer.removeListener("credits-updated", subscription)
    }
  },
  getPlatform: () => process.platform,
  setRendererView: (view: 'queue' | 'solutions' | 'debug') =>
    ipcRenderer.invoke('renderer-view:set', view),
  
  // New methods for OpenAI API integration
  getConfig: () => ipcRenderer.invoke("get-config"),
  updateConfig: (config: { apiKey?: string; model?: string; language?: string; opacity?: number }) => 
    ipcRenderer.invoke("update-config", config),
  copyCodeToClipboard: (code: string) => ipcRenderer.invoke("copy-code-to-clipboard", code),
  onShowSettings: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("show-settings-dialog", subscription)
    return () => {
      ipcRenderer.removeListener("show-settings-dialog", subscription)
    }
  },
  checkApiKey: () => ipcRenderer.invoke("check-api-key"),
  validateApiKey: (apiKey: string) => 
    ipcRenderer.invoke("validate-api-key", apiKey),
  openExternal: (url: string) => 
    ipcRenderer.invoke("openExternal", url),
  onApiKeyInvalid: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on(PROCESSING_EVENTS.API_KEY_INVALID, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.API_KEY_INVALID, subscription)
    }
  },
  removeListener: (eventName: string, callback: (...args: any[]) => void) => {
    ipcRenderer.removeListener(eventName, callback)
  },
  onDeleteLastScreenshot: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("delete-last-screenshot", subscription)
    return () => {
      ipcRenderer.removeListener("delete-last-screenshot", subscription)
    }
  },
  deleteLastScreenshot: () => ipcRenderer.invoke("delete-last-screenshot"),
  
  // 添加控制鼠标事件穿透的方法
  setIgnoreMouseEvents: (ignore: boolean, options?: { forward: boolean }) => {
    return ipcRenderer.invoke('set-ignore-mouse-events', ignore, options);
  },
  
  // 新增：区域性穿透API
  setIgnoreMouseEventsExcept: (exceptRegions: Array<{x: number, y: number, width: number, height: number}>) => {
    return ipcRenderer.invoke('set-ignore-mouse-events-except', exceptRegions);
  },

  // 新增：显示设置对话框
  showSettings: () => {
    return ipcRenderer.send('show-settings-dialog');
  },

  // Web Authentication methods
  webAuthLogin: () => ipcRenderer.invoke("web-auth-login"),
  webAuthLogout: () => ipcRenderer.invoke("web-auth-logout"),
  webAuthStatus: () => ipcRenderer.invoke("web-auth-status"),
  webSyncConfig: () => ipcRenderer.invoke("web-sync-config"),
  attemptAutoRelogin: () => ipcRenderer.invoke("attempt-auto-relogin"),
  webUpdateConfig: (config: any) => ipcRenderer.invoke("web-update-config", config),
  webGetAIModels: () => ipcRenderer.invoke("web-get-ai-models"),
  webGetLanguages: () => ipcRenderer.invoke("web-get-languages"),
  webCheckConnection: () => ipcRenderer.invoke("web-check-connection"),
  
  // 🆕 透明度控制API
  adjustOpacity: (delta: number) => ipcRenderer.invoke("adjust-opacity", delta),
  getOpacity: () => ipcRenderer.invoke("get-opacity"),
  setOpacity: (opacity: number) => ipcRenderer.invoke("set-opacity", opacity),
  
  // 🆕 背景透明度变更事件监听
  onBackgroundOpacityChanged: (callback: (opacity: number) => void) => {
    const subscription = (_: any, opacity: number) => callback(opacity)
    ipcRenderer.on("background-opacity-changed", subscription)
    return () => {
      ipcRenderer.removeListener("background-opacity-changed", subscription)
    }
  },
  
  // Web Authentication event listeners
  onWebAuthStatus: (callback: (data: { authenticated: boolean; user: any }) => void) => {
    const subscription = (_: any, data: { authenticated: boolean; user: any }) => callback(data)
    ipcRenderer.on("web-auth-status", subscription)
    return () => {
      ipcRenderer.removeListener("web-auth-status", subscription)
    }
  },
  onConfigUpdated: (callback: (config: any) => void) => {
    const subscription = (_: any, config: any) => callback(config)
    ipcRenderer.on("config-updated", subscription)
    return () => {
      ipcRenderer.removeListener("config-updated", subscription)
    }
  },
  
  // 添加通知事件监听器
  onNotification: (callback: (notification: any) => void) => {
    const subscription = (_: any, notification: any) => callback(notification)
    ipcRenderer.on("show-notification", subscription)
    return () => {
      ipcRenderer.removeListener("show-notification", subscription)
    }
  },
  
  // 添加清除通知事件监听器
  onClearNotification: (callback: () => void) => {
    const subscription = () => callback()
    ipcRenderer.on("clear-notification", subscription)
    return () => {
      ipcRenderer.removeListener("clear-notification", subscription)
    }
  },

  // 🆕 流式输出相关方法
  onSolutionStreamChunk: (callback: (data: {
    delta: string,
    fullContent: string,
    parsedContent: any,
    progress: number,
    isComplete: boolean
  }) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK, subscription)
    }
  },

  onSolutionStreamComplete: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => callback(data)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_STREAM_COMPLETE, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.SOLUTION_STREAM_COMPLETE, subscription)
    }
  },

  onSolutionStreamError: (callback: (error: string) => void) => {
    const subscription = (_: any, error: string) => callback(error)
    ipcRenderer.on(PROCESSING_EVENTS.SOLUTION_STREAM_ERROR, subscription)
    return () => {
      ipcRenderer.removeListener(PROCESSING_EVENTS.SOLUTION_STREAM_ERROR, subscription)
    }
  },

  // 🆕 取消流式传输
  cancelStreaming: () => ipcRenderer.invoke("cancel-streaming"),

  // 🆕 水平滚动事件监听
  onScrollCodeHorizontal: (callback: (data: { direction: string }) => void) => {
    const subscription = (_: any, data: { direction: string }) => {
      console.log('📨 Preload received scroll event:', data)
      callback(data)
    }
    ipcRenderer.on("scroll-code-horizontal", subscription)
    return () => {
      ipcRenderer.removeListener("scroll-code-horizontal", subscription)
    }
  },

  // 🆕 垂直滚动事件监听
  onScrollCodeVertical: (callback: (data: { direction: string }) => void) => {
    const subscription = (_: any, data: { direction: string }) => {
      console.log('📨 Preload received vertical scroll event:', data)
      callback(data)
    }
    ipcRenderer.on("scroll-code-vertical", subscription)
    return () => {
      ipcRenderer.removeListener("scroll-code-vertical", subscription)
    }
  },

  // 🆕 解决方案高度调整事件监听（测试用）
  onAdjustSolutionHeight: (callback: (data: { direction: 'increase' | 'decrease' }) => void) => {
    const subscription = (_: any, data: { direction: 'increase' | 'decrease' }) => {
      console.log('📨 Preload received solution height adjust event:', data)
      callback(data)
    }
    ipcRenderer.on("adjust-solution-height", subscription)
    return () => {
      ipcRenderer.removeListener("adjust-solution-height", subscription)
    }
  },
  
  // 🆕 原始输出相关事件监听
  onRawOutputUpdate: (callback: (data: any) => void) => {
    const subscription = (_: any, data: any) => {
      console.log('📨 Preload received raw output update:', data)
      callback(data)
    }
    ipcRenderer.on("raw-output-updated", subscription)
    return () => {
      ipcRenderer.removeListener("raw-output-updated", subscription)
    }
  },
  
  onToggleRawOutput: (callback: () => void) => {
    const subscription = () => {
      console.log('📨 Preload received toggle raw output')
      callback()
    }
    ipcRenderer.on("toggle-raw-output-view", subscription)
    return () => {
      ipcRenderer.removeListener("toggle-raw-output-view", subscription)
    }
  },
  

  // 🆕 新架构AI处理请求事件监听器
  onAiProcessRequest: (callback: (requestData: any) => void) => {
    const subscription = (_: any, requestData: any) => {
      console.log('📨 Preload received ai-process-request:', requestData)
      callback(requestData)
    }
    ipcRenderer.on("ai-process-request", subscription)
    return () => {
      ipcRenderer.removeListener("ai-process-request", subscription)
    }
  },

  // 🆕 新架构AI调试请求事件监听器
  onAiDebugRequest: (callback: (requestData: any) => void) => {
    const subscription = (_: any, requestData: any) => {
      console.log('📨 Preload received ai-debug-request:', requestData)
      callback(requestData)
    }
    ipcRenderer.on("ai-debug-request", subscription)
    return () => {
      ipcRenderer.removeListener("ai-debug-request", subscription)
    }
  },

  // 🆕 监听AI请求取消事件（Ctrl+R触发）
  onCancelAiRequests: (callback: () => void) => {
    const subscription = (_: any) => {
      console.log('🚫 Preload received cancel-ai-requests')
      callback()
    }
    ipcRenderer.on("cancel-ai-requests", subscription)
    
    return () => {
      ipcRenderer.removeListener("cancel-ai-requests", subscription)
    }
  },

  // 🆕 SSE流式解决方案发送方法
  sendSolutionStart: () => {
    console.log('📤 [IPC] 发送solution-start事件')
    ipcRenderer.send(PROCESSING_EVENTS.INITIAL_START)
  },
  
  sendSolutionStreamChunk: (data: { fullContent: string; progress: number; isComplete: boolean; streamingStarted: boolean }) => {
    console.log('📤 [IPC-PRELOAD] 发送流式内容块:', { 
      contentLength: data.fullContent.length, 
      progress: data.progress,
      isComplete: data.isComplete,
      eventName: PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK
    })
    console.log('📤 [IPC-PRELOAD] 事件名称:', PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK)
    console.log('📤 [IPC-PRELOAD] 内容预览:', JSON.stringify(data.fullContent.substring(0, 100)))
    // 发送流式数据块
    ipcRenderer.send(PROCESSING_EVENTS.SOLUTION_STREAM_CHUNK, data)
    console.log('📤 [IPC-PRELOAD] ipcRenderer.send 调用完成')
  },
  
  sendSolutionSuccess: (data: any) => {
    console.log('📤 [IPC] 发送最终解决方案结果')
    ipcRenderer.send(PROCESSING_EVENTS.SOLUTION_SUCCESS, data)
  },
  
  // 🆕 强制刷新队列事件监听
  onForceRefreshQueue: (callback: () => void) => {
    const subscription = () => {
      console.log('📨 Preload received force refresh queue event')
      callback()
    }
    ipcRenderer.on("force-refresh-queue", subscription)
    return () => {
      ipcRenderer.removeListener("force-refresh-queue", subscription)
    }
  },

  // 🔍 兼容性检测相关方法
  startCompatibilityCheck: () => ipcRenderer.invoke("start-compatibility-check"),
  getCompatibilityReport: () => ipcRenderer.invoke("get-compatibility-report"),
  exportCompatibilityReport: (report: any) => ipcRenderer.invoke("export-compatibility-report", report),
  getPlatformInfo: () => ipcRenderer.invoke("get-platform-info"),

  // 🔍 兼容性检测事件监听
  onCompatibilityProgress: (callback: (result: any) => void) => {
    const subscription = (_: any, result: any) => {
      console.log('📨 Preload received compatibility progress:', result)
      callback(result)
    }
    ipcRenderer.on("compatibility-progress", subscription)
    return () => {
      ipcRenderer.removeListener("compatibility-progress", subscription)
    }
  },

  onCompatibilityComplete: (callback: (report: any) => void) => {
    const subscription = (_: any, report: any) => {
      console.log('📨 Preload received compatibility complete:', report)
      callback(report)
    }
    ipcRenderer.on("compatibility-complete", subscription)
    return () => {
      ipcRenderer.removeListener("compatibility-complete", subscription)
    }
  },

  // 移除兼容性检测事件监听器
  removeCompatibilityListeners: () => {
    ipcRenderer.removeAllListeners("compatibility-progress")
    ipcRenderer.removeAllListeners("compatibility-complete")
  },

  // 🆕 反录屏保护控制API
  antiCapture: {
    getStatus: () => ipcRenderer.invoke("anti-capture:get-status"),
    setLevel: (level: 'high' | 'medium' | 'low') => 
      ipcRenderer.invoke("anti-capture:set-level", level),
    temporaryReduce: (duration?: number) => 
      ipcRenderer.invoke("anti-capture:temporary-reduce", duration),
  },

  // 🆕 面试语音采集API（ScreenCaptureKit 系统音频 + 断句）
  interviewAudio: {
    start: () => ipcRenderer.invoke("interview-audio:start"),
    stop: () => ipcRenderer.invoke("interview-audio:stop"),
    onReady: (callback: () => void) => {
      const subscription = () => callback()
      ipcRenderer.on("interview-audio:ready", subscription)
      return () => ipcRenderer.removeListener("interview-audio:ready", subscription)
    },
    onError: (callback: (message: string) => void) => {
      const subscription = (_: any, message: string) => callback(message)
      ipcRenderer.on("interview-audio:error", subscription)
      return () => ipcRenderer.removeListener("interview-audio:error", subscription)
    },
    onStopped: (callback: (info: { code: number | null; signal: string | null }) => void) => {
      const subscription = (_: any, info: { code: number | null; signal: string | null }) => callback(info)
      ipcRenderer.on("interview-audio:stopped", subscription)
      return () => ipcRenderer.removeListener("interview-audio:stopped", subscription)
    },
    onUtterance: (callback: (data: { audioBase64: string; durationMs: number }) => void) => {
      const subscription = (_: any, data: { audioBase64: string; durationMs: number }) => callback(data)
      ipcRenderer.on("interview-audio:utterance", subscription)
      return () => ipcRenderer.removeListener("interview-audio:utterance", subscription)
    },
  },
}

// Before exposing the API
console.log(
  "About to expose electronAPI with methods:",
  Object.keys(electronAPI)
)

// Expose the API
contextBridge.exposeInMainWorld("electronAPI", electronAPI)

console.log("electronAPI exposed to window")

// Add this focus restoration handler
ipcRenderer.on("restore-focus", () => {
  // Try to focus the active element if it exists
  const activeElement = document.activeElement as HTMLElement
  if (activeElement && typeof activeElement.focus === "function") {
    activeElement.focus()
  }
})

// Remove auth-callback handling - no longer needed
