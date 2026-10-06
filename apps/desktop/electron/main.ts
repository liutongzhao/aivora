import { app, BrowserWindow, screen, shell, ipcMain, globalShortcut } from "electron"
import path from "path"
import fs from "fs"
import { pathToFileURL } from "url"
import { defaultShortcutBindings } from "../shared/shortcuts"
import type { ShortcutAction } from "../shared/shortcuts"
import { initializeIpcHandlers, registerCompatibilityHandlers, registerAntiCaptureHandlers } from "./ipcHandlers"
import { registerInterviewAudioIpc } from "./InterviewAudioIpc"
import { LightweightProcessingHelper } from "./LightweightProcessingHelper"
import { ScreenshotHelper } from "./ScreenshotHelper"
import { ShortcutsHelper } from "./shortcuts"
import { initAutoUpdater } from "./autoUpdater"
import { configHelper } from "./ConfigHelper"
import { simpleAuthManager } from "./SimpleAuthManager"
import * as dotenv from "dotenv"
import { setupUTF8Encoding, patchConsoleForUTF8 } from "./encoding-fix"
import { PerformantAntiCapture } from "./PerformantAntiCapture"
import { RemoteControlClient } from "./RemoteControlClient"

// Setup UTF-8 encoding at the very beginning
setupUTF8Encoding()
patchConsoleForUTF8()

// Constants
const isDev = process.env.NODE_ENV === "development"
const appDataDirectoryName = isDev ? "interview-coder-v1-dev" : "interview-coder-v1"

// Select the data directory before Electron creates the single-instance lock.
// The production directory is intentionally unchanged for existing users.
const appDataPath = path.join(app.getPath("appData"), appDataDirectoryName)
app.setPath("userData", appDataPath)
console.log(`[app] ${isDev ? "development" : "production"} data directory: ${appDataPath}`)

// Application State
const state = {
  // Window management properties
  mainWindow: null as BrowserWindow | null,
  loginWindow: null as BrowserWindow | null,
  configWindow: null as BrowserWindow | null,
  isWindowVisible: false,
  windowPosition: null as { x: number; y: number } | null,
  windowSize: null as { width: number; height: number } | null,
  screenWidth: 0,
  screenHeight: 0,
  step: 0,
  currentX: 0,
  currentY: 0,
  userManuallyResized: false, // 🆕 标记用户是否手动调整了窗口大小

  // Application helpers
  screenshotHelper: null as ScreenshotHelper | null,
  shortcutsHelper: null as ShortcutsHelper | null,
  processingHelper: null as LightweightProcessingHelper | null,
  antiCapture: null as PerformantAntiCapture | null,
  remoteControlClient: null as RemoteControlClient | null,

  // View and state management
  view: "queue" as "queue" | "solutions" | "debug",
  problemInfo: null as any,
  hasDebugged: false,
  overlayLocked: false,
  isTestModeActive: false,
  currentTheme: 'dark' as 'dark' | 'light',

  // Processing events
  PROCESSING_EVENTS: {
    UNAUTHORIZED: "processing-unauthorized",
    NO_SCREENSHOTS: "processing-no-screenshots",
    OUT_OF_CREDITS: "out-of-credits",
    API_KEY_INVALID: "api-key-invalid",
    INITIAL_START: "initial-start",
    PROBLEM_EXTRACTED: "problem-extracted",
    SOLUTION_SUCCESS: "solution-success",
    INITIAL_SOLUTION_ERROR: "solution-error",
    DEBUG_START: "debug-start",
    DEBUG_SUCCESS: "debug-success",
    DEBUG_ERROR: "debug-error",
    COPY_CODE: "copy-code",
    
    // 🆕 流式输出事件（与preload.ts保持一致）
    SOLUTION_STREAM_CHUNK: "solution-stream-chunk",
    SOLUTION_STREAM_COMPLETE: "solution-stream-complete",
    SOLUTION_STREAM_ERROR: "solution-stream-error"
  } as const,
  testOverlay: null as BrowserWindow | null,
  skipRestoreOnClose: false
}

function broadcastTheme(theme: 'dark' | 'light') {
  const targets = [state.mainWindow, state.loginWindow, state.configWindow]
  targets.forEach((win) => {
    if (win && !win.isDestroyed()) {
      win.webContents.send('client-theme-changed', theme)
    }
  })
}

let pointerHandlersRegistered = false
function ensurePointerHandlers() {
  if (pointerHandlersRegistered) return
  pointerHandlersRegistered = true

  ipcMain.handle('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win && !win.isDestroyed()) {
      win.setIgnoreMouseEvents(ignore, options)
    }
  })

  ipcMain.handle('set-ignore-mouse-events-except', (event, exceptRegions) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return

    win.setIgnoreMouseEvents(true, { forward: true })
    win.webContents.executeJavaScript(`
      (function() {
        if (window._mouseMoveHandler) {
          document.removeEventListener('mousemove', window._mouseMoveHandler);
          delete window._mouseMoveHandler;
        }

        function debounce(func, wait) {
          let timeout;
          return function debounced() {
            const context = this;
            const args = arguments;
            clearTimeout(timeout);
            timeout = setTimeout(function() {
              func.apply(context, args);
            }, wait);
          };
        }

        window._mouseMoveHandler = debounce(function(e) {
          const mousePos = { x: e.clientX, y: e.clientY };
          const exceptRegions = ${JSON.stringify(exceptRegions)};
          const isInExceptRegion = exceptRegions.some(function(region) {
            return mousePos.x >= region.x &&
                   mousePos.x <= region.x + region.width &&
                   mousePos.y >= region.y &&
                   mousePos.y <= region.y + region.height;
          });

          if (window._lastIgnoreState !== !isInExceptRegion) {
            window._lastIgnoreState = !isInExceptRegion;
            window.electronAPI?.setIgnoreMouseEvents?.(!isInExceptRegion, { forward: true });
          }
        }, 30);

        document.addEventListener('mousemove', window._mouseMoveHandler);
      })();
    `)
  })
}

function getStoredTheme(): 'dark' | 'light' {
  const settings = configHelper.getClientSettings() || {}
  return settings.theme === 'light' ? 'light' : 'dark'
}

function setClientTheme(theme: 'dark' | 'light') {
  configHelper.updateClientSettings({ theme })
  state.currentTheme = theme
  broadcastTheme(theme)
}

async function stopTestMode(options?: { preserveEntryWindows?: boolean }) {
  if (!state.isTestModeActive) return
  state.shortcutsHelper?.cancelShortcutTest()
  state.isTestModeActive = false
  closeTestOverlay()
  if (state.overlayLocked && state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.skipRestoreOnClose = options?.preserveEntryWindows ?? true
    await new Promise<void>((resolve) => {
      const win = state.mainWindow
      if (!win) {
        resolve()
        return
      }
      win.once('closed', () => {
        resolve()
      })
      win.close()
    })
  }
}

const validShortcutActions = Object.keys(defaultShortcutBindings) as ShortcutAction[]

function isShortcutAction(value: string): value is ShortcutAction {
  return validShortcutActions.includes(value as ShortcutAction)
}

function getAssetPath(...segments: string[]) {
  const base = app.isPackaged ? process.resourcesPath : path.join(__dirname, "../..")
  return path.join(base, ...segments)
}

function getAppIconPath() {
  const iconPaths = [
    getAssetPath("assets", "icons", "win", "aivora.ico"),
    getAssetPath("assets", "branding", "aivora-app-icon-256.png"),
  ]
  const iconPath = iconPaths.find((candidate) => fs.existsSync(candidate))
  if (iconPath) {
    return iconPath
  }
  console.warn("⚠️ 找不到客户端图标，使用默认图标:", iconPaths)
  return undefined
}

const appIconPath = getAppIconPath()

let shortcutTestTimeout: NodeJS.Timeout | null = null

function isIntelMac(): boolean {
  return process.platform === "darwin" && process.arch === "x64"
}

function getRendererUrl(hash?: string) {
  if (isDev) {
    const rendererUrl = process.env.ELECTRON_RENDERER_URL || "http://127.0.0.1:54321"
    const suffix = hash ? (hash.startsWith('#') ? hash : `#${hash}`) : ''
    return `${rendererUrl.replace(/\/$/, '')}/${suffix}`
  }
  const fileUrl = pathToFileURL(path.join(__dirname, "../../dist/index.html")).toString()
  if (!hash) {
    return fileUrl
  }
  return `${fileUrl}${hash.startsWith('#') ? hash : `#${hash}`}`
}

function getPreloadPath() {
  return path.join(__dirname, "preload.js")
}

// Add interfaces for helper classes
// 🆕 轻量级处理助手接口 - 只包含必需的方法
export interface IProcessingHelperDeps {
  getScreenshotHelper: () => ScreenshotHelper | null
  getMainWindow: () => BrowserWindow | null
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
}

export interface IShortcutsHelperDeps {
  getMainWindow: () => BrowserWindow | null
  getScreenshotHelper: () => ScreenshotHelper | null
  takeScreenshot: () => Promise<string>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: LightweightProcessingHelper | null
  clearQueues: () => void
  getView: () => "queue" | "solutions" | "debug"
  setView: (view: "queue" | "solutions" | "debug") => void
  isVisible: () => boolean
  toggleMainWindow: () => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  setUserManuallyResized: (resized: boolean) => void // 🆕 添加标记函数
  isExamClientReady: () => boolean
  handleQuitShortcut?: () => void
  openConfigWindow?: () => Promise<void> | void
  createRemotePairing?: () => Promise<void>
}

export interface IIpcHandlerDeps {
  getMainWindow: () => BrowserWindow | null
  setWindowDimensions: (width: number, height: number) => void
  getScreenshotQueue: () => string[]
  getExtraScreenshotQueue: () => string[]
  deleteScreenshot: (
    path: string
  ) => Promise<{ success: boolean; error?: string }>
  getImagePreview: (filepath: string) => Promise<string>
  processingHelper: LightweightProcessingHelper | null
  PROCESSING_EVENTS: typeof state.PROCESSING_EVENTS
  takeScreenshot: () => Promise<string>
  getView: () => "queue" | "solutions" | "debug"
  toggleMainWindow: () => void
  clearQueues: () => void
  setView: (view: "queue" | "solutions" | "debug") => void
  moveWindowLeft: () => void
  moveWindowRight: () => void
  moveWindowUp: () => void
  moveWindowDown: () => void
  shortcutsHelper?: ShortcutsHelper | null // 添加 ShortcutsHelper 支持
  remoteControlClient?: RemoteControlClient | null
}

// Initialize Web Authentication
async function initializeWebAuth() {
  try {
    // Set up Web authentication event listeners
    simpleAuthManager.on('authenticated', (user) => {
      console.log('User authenticated:', user.username)
      broadcastToRenderers('web-auth-status', {
        authenticated: true,
        user
      })
    })

    simpleAuthManager.on('authentication-cleared', () => {
      console.log('User authentication cleared')
      broadcastToRenderers('web-auth-status', {
        authenticated: false,
        user: null
      })
      state.remoteControlClient?.disconnect()
      closeConfigWindow()
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.skipRestoreOnClose = true
        state.overlayLocked = false
        state.mainWindow.close()
      }
      createLoginWindow()
    })

    simpleAuthManager.on('config-synced', (config) => {
      console.log('Configuration synced from web')
      broadcastToRenderers('config-updated', config)
    })

    simpleAuthManager.on('auth-required', () => {
      console.log('Authentication required - opening web login')
      simpleAuthManager.openWebLogin()
    })

    console.log("Web Authentication Manager initialized with event listeners")
  } catch (error) {
    console.error('Failed to initialize web auth:', error)
  }
}

/**
 * 启动检查 - 确保用户登录
 */
async function performSimpleStartupCheck() {
  try {
    console.log("🔐 执行启动时认证检查...")
    
    // 使用新的认证初始化方法，它会自动检查共享会话
    const isAuthenticated = await simpleAuthManager.initializeAuth()
    if (isAuthenticated) {
      const user = simpleAuthManager.getCurrentUser()
      console.log(`✅ 用户已认证: ${user?.username}`)
      return true
    } else {
      console.log("❌ 用户未登录，需要登录后才能使用")
      return false // 返回false表示需要登录
    }
  } catch (error) {
    console.error("❌ 认证检查失败:", error)
    return false
  }
}

// Initialize helpers
function initializeHelpers() {
  state.screenshotHelper = new ScreenshotHelper(state.view, getMainWindow())
  state.processingHelper = new LightweightProcessingHelper({
    getScreenshotHelper,
    getMainWindow,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    takeScreenshot,
    getImagePreview
  } as IProcessingHelperDeps)
  state.shortcutsHelper = new ShortcutsHelper({
    getMainWindow,
    getScreenshotHelper,
    takeScreenshot,
    getImagePreview,
    processingHelper: state.processingHelper,
    clearQueues,
    getView,
    setView,
    isVisible: () => state.isWindowVisible,
    toggleMainWindow,
    moveWindowLeft: () =>
      moveWindowHorizontal((x) =>
        Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
      ),
    moveWindowRight: () =>
      moveWindowHorizontal((x) =>
        Math.min(
          state.screenWidth - (state.windowSize?.width || 0) / 2,
          x + state.step
        )
      ),
    moveWindowUp: () => moveWindowVertical((y) => y - state.step),
    moveWindowDown: () => moveWindowVertical((y) => y + state.step),
    setUserManuallyResized: (resized: boolean) => {
      state.userManuallyResized = resized
      console.log(`🔄 设置用户手动调整状态: ${resized}`)
    },
    isExamClientReady: () => state.overlayLocked,
    handleQuitShortcut,
    openConfigWindow: returnToConfigWindow,
    createRemotePairing: async () => {
      try {
        if (!state.remoteControlClient) throw new Error('远程控制尚未就绪')
        await state.remoteControlClient.showPairing()
      } catch (error) {
        broadcastToRenderers('remote-control-state', {
          connected: false,
          error: error instanceof Error ? error.message : '生成连接码失败'
        })
        throw error
      }
    }
  } as IShortcutsHelperDeps)
}

// Auth callback handler

// 注册认证回调协议；协议字符串保持兼容远程服务
if (process.platform === "darwin") {
  app.setAsDefaultProtocolClient("interview-coder")
} else {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1] || "")
  ])
}

// Handle the protocol for authentication callbacks
if (process.defaultApp && process.argv.length >= 2) {
  app.setAsDefaultProtocolClient("interview-coder", process.execPath, [
    path.resolve(process.argv[1])
  ])
}

// Force Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on("second-instance", (event, commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      try {
        if (state.mainWindow.isMinimized()) state.mainWindow.restore()
        state.mainWindow.focus()
      } catch (error) {
        console.error("Error focusing main window:", error)
        state.mainWindow = null
        createWindow()
      }

      // Handle authentication callback from protocol
      const url = commandLine.find((arg) => arg.startsWith("interview-coder://"))
      if (url) {
        console.log("Received auth callback:", url)
        simpleAuthManager.handleAuthCallback(url)
      }
    }
  })
}

// Auth callback removed as we no longer use Supabase authentication

// Window management functions
function closeLoginWindow() {
  if (state.loginWindow && !state.loginWindow.isDestroyed()) {
    state.loginWindow.close()
  }
  state.loginWindow = null
}

function closeConfigWindow() {
  if (state.configWindow && !state.configWindow.isDestroyed()) {
    state.configWindow.close()
  }
  state.configWindow = null
}

function closeEntryWindows() {
  closeLoginWindow()
  closeConfigWindow()
}

function closeTestOverlay() {
  if (state.testOverlay && !state.testOverlay.isDestroyed()) {
    state.testOverlay.close()
  }
  state.testOverlay = null
}

function createLoginWindow() {
  if (state.overlayLocked) {
    return
  }
  if (state.loginWindow && !state.loginWindow.isDestroyed()) {
    state.loginWindow.focus()
    return
  }

  state.loginWindow = new BrowserWindow({
    width: 520,
    height: 640,
    resizable: true,
    fullscreenable: false,
    backgroundColor: '#f5f6fb',
    title: '登录考试客户端',
    icon: appIconPath,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath()
    }
  })
  state.loginWindow.setMenu(null)

  state.loginWindow.loadURL(getRendererUrl('#/login'))
  state.loginWindow.once('ready-to-show', () => state.loginWindow?.show())
  state.loginWindow.on('closed', () => {
    state.loginWindow = null
  })
}

function createConfigWindow() {
  if (state.overlayLocked) {
    return
  }
  if (state.configWindow && !state.configWindow.isDestroyed()) {
    state.configWindow.focus()
    return
  }

  state.configWindow = new BrowserWindow({
    width: 1100,
    height: 780,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#f5f6fb',
    title: '考试客户端配置',
    icon: appIconPath,
    frame: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath()
    }
  })
  state.configWindow.setMenu(null)

  state.configWindow.loadURL(getRendererUrl('#/config'))
  state.configWindow.once('ready-to-show', () => state.configWindow?.show())
  state.configWindow.on('closed', () => {
    state.configWindow = null
  })
}

async function launchExamClient(options?: { preserveEntryWindows?: boolean }): Promise<{ success: boolean; error?: string }> {
  if (state.isTestModeActive) {
    await stopTestMode({ preserveEntryWindows: true })
  }
  if (state.overlayLocked) {
    return { success: false, error: '考试客户端已在运行' }
  }
  state.overlayLocked = true
  if (!options?.preserveEntryWindows) {
    closeEntryWindows()
  }
  await createWindow()
  state.shortcutsHelper?.registerGlobalShortcuts()
  return { success: true }
}

async function createWindow(): Promise<void> {
  if (state.mainWindow) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore()
    state.mainWindow.focus()
    return
  }

  const primaryDisplay = screen.getPrimaryDisplay()
  const workArea = primaryDisplay.workAreaSize
  state.screenWidth = workArea.width
  state.screenHeight = workArea.height
  state.step = 60
  state.currentY = 50

  // 🆕 从配置中加载保存的背景透明度和窗口宽度
  const config = configHelper.loadConfig()
  const savedBackgroundOpacity = config.clientSettings?.backgroundOpacity ?? 0.8
  const savedWindowWidth = config.clientSettings?.windowWidth || 800
  const savedWindowHeight = config.clientSettings?.windowHeight || 600
  state.currentTheme = config.clientSettings?.theme === 'light' ? 'light' : 'dark'
  console.log(`Loading saved background opacity: ${savedBackgroundOpacity}`)
  console.log(`Loading saved window width: ${savedWindowWidth}px`)
  console.log(`Loading saved window height: ${savedWindowHeight}px`)
  
  const hasSavedWidth = Boolean(config.clientSettings?.windowWidth && config.clientSettings.windowWidth !== 800)
  const hasSavedHeight = Boolean(config.clientSettings?.windowHeight && config.clientSettings.windowHeight !== 600)

  if (hasSavedWidth || hasSavedHeight) {
    state.userManuallyResized = true
    console.log('🔒 检测到保存的自定义尺寸，标记为用户手动调整状态')
  }

  const windowSettings: Electron.BrowserWindowConstructorOptions = {
    width: savedWindowWidth,
    height: savedWindowHeight || 600,
    minHeight: 40,
    x: state.currentX,
    y: 50,
    alwaysOnTop: true,
    icon: appIconPath,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: getPreloadPath(),
      scrollBounce: true
    },
    show: true,
    frame: false,
    thickFrame: false,
    transparent: true,
    fullscreenable: false,
    hasShadow: false,
    opacity: 1.0,  // 窗口保持完全不透明，背景透明度通过CSS控制
    backgroundColor: "#00000000",
    focusable: true,
    skipTaskbar: true,
    resizable: true,
    paintWhenInitiallyHidden: true,
    titleBarStyle: "hidden",
    titleBarOverlay: false,  // 禁用标题栏覆盖
    enableLargerThanScreen: true,
    movable: true
  }

  if (!isIntelMac()) {
    windowSettings.type = "panel"
  }

  state.mainWindow = new BrowserWindow(windowSettings)
  // Frameless windows still inherit the application menu unless it is removed.
  state.mainWindow.setMenu(null)
  state.mainWindow.setTitle(' ')
  state.mainWindow.on('page-title-updated', (event) => {
    event.preventDefault()
  })


  // 不在这里设置全局穿透，而是通过IPC消息来控制
  // state.mainWindow.setIgnoreMouseEvents(true, { forward: true });

  ensurePointerHandlers()

  if (!state.windowSize) {
    const bounds = state.mainWindow.getBounds()
    state.windowSize = { width: bounds.width, height: bounds.height }
  }

  // Add more detailed logging for window events
  state.mainWindow.webContents.on("did-finish-load", () => {
    console.log("Window finished loading")
    broadcastTheme(state.currentTheme)
  })
  state.mainWindow.webContents.on(
    "did-fail-load",
    async (event, errorCode, errorDescription) => {
      console.error("Window failed to load:", errorCode, errorDescription)
      if (isDev) {
        // In development, retry loading after a short delay
        console.log("Retrying to load development server...")
        setTimeout(() => {
          state.mainWindow?.loadURL(getRendererUrl("#/overlay")).catch((error) => {
            console.error("Failed to load dev server on retry:", error)
          })
        }, 1000)
      }
    }
  )

  const overlayHash = '#/overlay'
  if (isDev) {
    const rendererUrl = getRendererUrl(overlayHash)
    console.log("Loading from development server:", rendererUrl)
    state.mainWindow.loadURL(rendererUrl).catch((error) => {
      console.error("Failed to load dev server, falling back to local file:", error)
      // Fallback to local file if dev server is not available
      const indexPath = path.join(__dirname, "../../dist/index.html")
      console.log("Falling back to:", indexPath)
      if (fs.existsSync(indexPath)) {
        state.mainWindow.loadURL(`${pathToFileURL(indexPath).toString()}${overlayHash}`)
      } else {
        console.error("Could not find index.html in dist folder")
      }
    })
  } else {
    // In production, load from the built files
    const indexPath = path.join(__dirname, "../../dist/index.html")
    console.log("Loading production build:", indexPath)

    if (fs.existsSync(indexPath)) {
      state.mainWindow.loadURL(`${pathToFileURL(indexPath).toString()}${overlayHash}`)
    } else {
      console.error("Could not find index.html in dist folder")
    }
  }

  // Configure window behavior
  state.mainWindow.webContents.setZoomFactor(1)
  if (isDev && process.env.AIVORA_OPEN_DEVTOOLS === "1") {
    state.mainWindow.webContents.openDevTools()
  }
  state.mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("Attempting to open URL:", url)
    try {
      const parsedURL = new URL(url);
      const hostname = parsedURL.hostname;
      const allowedHosts = ["google.com", "supabase.co"];
      if (allowedHosts.includes(hostname) || hostname.endsWith(".google.com") || hostname.endsWith(".supabase.co")) {
        shell.openExternal(url);
        return { action: "deny" }; // Do not open this URL in a new Electron window
      }
    } catch (error) {
      console.error("Invalid URL %d in setWindowOpenHandler: %d" , url , error);
      return { action: "deny" }; // Deny access as URL string is malformed or invalid
    }
    return { action: "allow" };
  })

  // 🆕 使用优化的反录屏保护模块
  state.antiCapture = new PerformantAntiCapture(state.mainWindow, {
    enableContentProtection: true,
    enableFrameRateControl: true,
    enableVisibilityControl: true,
    enablePlatformSpecific: true,
    adaptiveMode: true // 启用自适应性能调整
  })

  // Set up window listeners
  state.mainWindow.on("move", handleWindowMove)
  state.mainWindow.on("resize", handleWindowResize)
  state.mainWindow.on("closed", () => {
    handleWindowClosed()
    closeTestOverlay()
  })

  // Initialize window state
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.windowSize = { width: bounds.width, height: bounds.height }
  state.currentX = bounds.x
  state.currentY = bounds.y
  state.isWindowVisible = true
  
  // Set initial window state
  const clientSettings = configHelper.getClientSettings();
  console.log(`Initial background opacity from config: ${savedBackgroundOpacity}`);
  
  // Force window to be visible initially (without stealing focus)
  state.mainWindow.showInactive();
  state.isWindowVisible = true;
  
  // 发送初始背景透明度到前端
  setTimeout(() => {
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send("background-opacity-changed", savedBackgroundOpacity);
      console.log(`Sent initial background opacity ${savedBackgroundOpacity} to frontend`);
    }
  }, 1000); // 等待前端加载完成
  
  
  console.log(`Window created and shown. Visible: ${state.isWindowVisible}, Position: (${state.currentX}, ${state.currentY})`);
  
  // 窗口创建后处理认证状态
  handlePostWindowAuthCheck()

  // Event listeners for webContents messages
  state.mainWindow.webContents.on('console-message', (event, level, message) => {
    console.log(`Frontend console: ${message}`)
  })

  state.mainWindow.on('closed', () => {
    state.mainWindow = null
    state.isWindowVisible = false
    state.windowPosition = null
    state.windowSize = null
    closeTestOverlay()
  })

  // 监听登录需求事件
  state.mainWindow.webContents.on('ipc-message', (event, channel, ...args) => {
    if (channel === 'show-login-required') {
      const [loginData] = args;
      console.log('🔐 收到登录需求事件:', loginData);
      
      // 显示登录提示通知
      state.mainWindow?.webContents.send('show-notification', {
        type: 'warning',
        title: loginData.title || '需要登录',
        message: loginData.message || '请先登录以使用AI功能',
        duration: 8000,
        actions: [{
          text: '立即登录',
          action: 'open-web-login'
        }]
      });
    }
  });
}

/**
 * 窗口创建后处理认证状态（优化用户体验）
 */
async function handlePostWindowAuthCheck() {
  // 延迟1秒后检查登录状态
  setTimeout(async () => {
    try {
      console.log("🔐 窗口创建后重新检查登录状态...")
      
      // 使用完整的认证初始化，包括检查共享会话
      const isAuthenticated = await simpleAuthManager.initializeAuth()
      if (isAuthenticated) {
        // 用户已登录，显示简洁的欢迎信息
        const user = simpleAuthManager.getCurrentUser()
        console.log(`✅ 用户已登录: ${user?.username}`)
        if (state.mainWindow) {
          state.mainWindow.webContents.send('show-notification', {
            type: 'success',
            title: '系统就绪',
            message: `欢迎回来，${user?.username}！`,
            duration: 2500
          })
        }
      } else {
        // 未登录时由认证清理事件统一打开客户端登录页，不再发送登录提示弹窗。
        console.log("❌ 用户未登录，保持客户端登录页")
      }
    } catch (error) {
      console.error("❌ 登录检查失败:", error)
    }
  }, 1000)
}

function handleWindowMove(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowPosition = { x: bounds.x, y: bounds.y }
  state.currentX = bounds.x
  state.currentY = bounds.y
}

function handleWindowResize(): void {
  if (!state.mainWindow) return
  const bounds = state.mainWindow.getBounds()
  state.windowSize = { width: bounds.width, height: bounds.height }
}

function handleWindowClosed(): void {
  state.mainWindow = null
  state.isWindowVisible = false
  state.windowPosition = null
  state.windowSize = null
  if (state.overlayLocked) {
    const shouldRestore = !state.skipRestoreOnClose
    state.overlayLocked = false
    state.skipRestoreOnClose = false
    if (shouldRestore) {
      simpleAuthManager.isAuthenticated().then((authed) => {
        if (authed) {
          createConfigWindow()
        } else {
          createLoginWindow()
        }
      })
    }
  }
}

// Window visibility functions
function hideMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    const bounds = state.mainWindow.getBounds();
    state.windowPosition = { x: bounds.x, y: bounds.y };
    state.windowSize = { width: bounds.width, height: bounds.height };
    state.mainWindow.setIgnoreMouseEvents(true, { forward: true });
    
    if (isIntelMac()) {
      state.mainWindow.hide();
    } else {
      state.mainWindow.setOpacity(0);
    }
    state.mainWindow.setSkipTaskbar(true);
    
    state.isWindowVisible = false;
    console.log(`Window hidden (${isIntelMac() ? 'hide' : 'opacity'} method)`);
  }
}

function showMainWindow(): void {
  if (!state.mainWindow?.isDestroyed()) {
    try {
      // 确保窗口位置在屏幕范围内
      const { screen } = require('electron')
      const primaryDisplay = screen.getPrimaryDisplay()
      const workArea = primaryDisplay.workArea
      
      if (state.windowPosition && state.windowSize) {
        const { x, y } = state.windowPosition
        const { width, height } = state.windowSize
        
        // 检查窗口是否在屏幕范围内
        const adjustedX = Math.max(workArea.x, Math.min(x, workArea.x + workArea.width - width))
        const adjustedY = Math.max(workArea.y, Math.min(y, workArea.y + workArea.height - height))
        
        state.mainWindow.setBounds({
          x: adjustedX,
          y: adjustedY,
          width,
          height
        });
        
        // 更新状态
        state.currentX = adjustedX
        state.currentY = adjustedY
      }
      
      state.mainWindow.setIgnoreMouseEvents(false);
      state.mainWindow.setAlwaysOnTop(
        true,
        isIntelMac() ? "floating" : "screen-saver",
        1
      );
      state.mainWindow.setVisibleOnAllWorkspaces(true, {
        visibleOnFullScreen: true
      });
      state.mainWindow.setContentProtection(true);
      
      if (!isIntelMac()) {
        state.mainWindow.setOpacity(1);
      }
      state.mainWindow.setSkipTaskbar(true);
      state.mainWindow.showInactive();
      
      state.isWindowVisible = true;
      console.log(`Window shown (inactive) at position (${state.currentX}, ${state.currentY})`);
    } catch (error) {
      console.error('Error showing main window:', error)
      if (!isIntelMac()) {
        state.mainWindow.setOpacity(1)
      }
      state.mainWindow.showInactive()
      state.isWindowVisible = true
    }
  }
}

function toggleMainWindow(): void {
  console.log(`Toggling window. Current state: ${state.isWindowVisible ? 'visible' : 'hidden'}`);
  if (state.isWindowVisible) {
    hideMainWindow();
  } else {
    showMainWindow();
  }
}

async function returnToConfigWindow(): Promise<void> {
  if (state.isTestModeActive) {
    await stopTestMode({ preserveEntryWindows: true })
  }

  // Overlay shortcuts are only needed while the exam window is active.
  globalShortcut.unregisterAll()
  state.overlayLocked = false
  state.skipRestoreOnClose = true

  const mainWindow = state.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    await new Promise<void>((resolve) => {
      mainWindow.once('closed', resolve)
      mainWindow.close()
    })
  }

  state.antiCapture?.restoreDock()
  state.antiCapture = null
  state.skipRestoreOnClose = false
  createConfigWindow()
}

// Window movement functions
function moveWindowHorizontal(updateFn: (x: number) => number): void {
  if (!state.mainWindow) return
  state.currentX = updateFn(state.currentX)
  state.mainWindow.setPosition(
    Math.round(state.currentX),
    Math.round(state.currentY)
  )
}

function moveWindowVertical(updateFn: (y: number) => number): void {
  if (!state.mainWindow) return

  const newY = updateFn(state.currentY)

  // Log the current position
  console.log({
    newY,
    currentY: state.currentY,
    step: state.step
  })

  // 确保窗口可见且响应
  if (!state.isWindowVisible || !state.mainWindow.isVisible()) {
    console.log("Window was hidden, making it visible for movement")
    state.mainWindow.showInactive()  // 使用不抢夺焦点的方法
    state.mainWindow.setSkipTaskbar(true)  // 确保不在任务栏显示
    state.mainWindow.setIgnoreMouseEvents(false)
    state.isWindowVisible = true
  }

  // Allow unlimited vertical movement
  state.currentY = newY
  state.mainWindow.setPosition(
    Math.round(state.currentX),
    Math.round(state.currentY)
  )
  console.log(`Window moved to position: (${Math.round(state.currentX)}, ${Math.round(state.currentY)})`)
}

// Window dimension functions
function setWindowDimensions(width: number, height: number): void {
  if (!state.mainWindow?.isDestroyed()) {
    const config = configHelper.loadConfig()
    const savedWindowWidth = config.clientSettings?.windowWidth
    const savedWindowHeight = config.clientSettings?.windowHeight
    const hasSavedWidth = Boolean(savedWindowWidth && savedWindowWidth !== 800)
    const hasSavedHeight = Boolean(savedWindowHeight && savedWindowHeight !== 600)

    const [currentX, currentY] = state.mainWindow.getPosition()
    const primaryDisplay = screen.getPrimaryDisplay()
    const workArea = primaryDisplay.workAreaSize
    const maxWidth = Math.floor(workArea.width * 0.5)
    const autoWidth = Math.min(width + 32, maxWidth)
    const autoHeight = Math.ceil(height)

    if (hasSavedWidth || hasSavedHeight) {
      const targetWidth = hasSavedWidth ? savedWindowWidth! : autoWidth
      const targetHeight = hasSavedHeight ? savedWindowHeight! : autoHeight
      console.log('🔒 使用配置文件中保存的窗口尺寸', {
        width: targetWidth,
        height: targetHeight,
        fromConfig: { savedWindowWidth, savedWindowHeight }
      })
      state.mainWindow.setBounds({
        x: Math.min(currentX, workArea.width - targetWidth),
        y: currentY,
        width: targetWidth,
        height: targetHeight
      })
      return
    }

    if (state.userManuallyResized) {
      console.log("⚠️ 用户已手动调整窗口大小，跳过自动尺寸调整")
      return
    }

    state.mainWindow.setBounds({
      x: Math.min(currentX, workArea.width - maxWidth),
      y: currentY,
      width: autoWidth,
      height: autoHeight
    })
  }
}

// Environment setup
function loadEnvVariables() {
  if (isDev) {
    console.log("Loading env variables from:", path.join(process.cwd(), ".env"))
    dotenv.config({ path: path.join(process.cwd(), ".env") })
  } else {
    console.log(
      "Loading env variables from:",
      path.join(process.resourcesPath, ".env")
    )
    dotenv.config({ path: path.join(process.resourcesPath, ".env") })
  }
  console.log("Environment variables loaded for open-source version")
}

// Initialize application
async function initializeApp() {
  try {
    // Set custom cache directory to prevent permission issues
    const sessionPath = path.join(appDataPath, 'session')
    const tempPath = path.join(appDataPath, 'temp')
    const cachePath = path.join(appDataPath, 'cache')
    
    // Create directories if they don't exist
    for (const dir of [appDataPath, sessionPath, tempPath, cachePath]) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
    }
    
    app.setPath('userData', appDataPath)
    app.setPath('sessionData', sessionPath)      
    app.setPath('temp', tempPath)
    app.setPath('cache', cachePath)
      
    loadEnvVariables()
    
    // Configuration file setup (API key is now built-in)
    console.log("Using built-in API configuration.")
    
    // Initialize Web authentication manager
    await initializeWebAuth()
    
    // 智能认证检查 - 如果未登录则引导用户登录
    const isAuthenticated = await performSimpleStartupCheck()
    
    initializeHelpers()
    state.remoteControlClient = new RemoteControlClient({
      shortcutsHelper: state.shortcutsHelper!,
      quitApp: handleQuitShortcut,
      onState: (remoteState) => broadcastToRenderers('remote-control-state', remoteState)
    })
    initializeIpcHandlers({
      getMainWindow,
      setWindowDimensions,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      toggleMainWindow,
      clearQueues,
      setView,
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            state.screenWidth - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step),
      shortcutsHelper: state.shortcutsHelper,
      remoteControlClient: state.remoteControlClient
    })
    // 🆕 面试语音采集 IPC（ScreenCaptureKit 系统音频 + 断句，供面试模式使用）
    registerInterviewAudioIpc(getMainWindow)
    if (isAuthenticated) {
      createConfigWindow()
    } else {
      createLoginWindow()
    }

    // 注册兼容性检测处理器
    registerCompatibilityHandlers({
      getMainWindow,
      setWindowDimensions,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      toggleMainWindow,
      clearQueues,
      setView,
      shortcutsHelper: state.shortcutsHelper, // 添加 ShortcutsHelper 实例
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            state.screenWidth - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step)
    })

    // 注册反录屏保护控制处理器
    registerAntiCaptureHandlers({
      getMainWindow,
      setWindowDimensions,
      getScreenshotQueue,
      getExtraScreenshotQueue,
      deleteScreenshot,
      getImagePreview,
      processingHelper: state.processingHelper,
      PROCESSING_EVENTS: state.PROCESSING_EVENTS,
      takeScreenshot,
      getView,
      toggleMainWindow,
      clearQueues,
      setView,
      moveWindowLeft: () =>
        moveWindowHorizontal((x) =>
          Math.max(-(state.windowSize?.width || 0) / 2, x - state.step)
        ),
      moveWindowRight: () =>
        moveWindowHorizontal((x) =>
          Math.min(
            state.screenWidth - (state.windowSize?.width || 0) / 2,
            x + state.step
          )
        ),
      moveWindowUp: () => moveWindowVertical((y) => y - state.step),
      moveWindowDown: () => moveWindowVertical((y) => y + state.step),
      antiCapture: state.antiCapture
    })

    ipcMain.handle('auth:login-with-credentials', async (_event, payload: { email?: string; password?: string }) => {
      if (!payload?.email || !payload?.password) {
        return { success: false, error: '请输入完整的登录信息' }
      }
      if (state.overlayLocked) {
        return { success: false, error: '考试客户端运行中，无法切换账号' }
      }
      const result = await simpleAuthManager.loginWithCredentials(payload.email, payload.password)
      if (result.success) {
        closeLoginWindow()
        createConfigWindow()
      }
      return result
    })

    ipcMain.handle('ui:launch-exam-client', async () => {
      return launchExamClient()
    })

    ipcMain.handle('shortcuts:get-bindings', () => {
      return configHelper.getShortcutBindings()
    })

    ipcMain.handle('shortcuts:update-binding', async (_event, payload: { action?: string; accelerator?: string }) => {
      if (!payload?.action || !payload?.accelerator || !isShortcutAction(payload.action)) {
        return { success: false, error: '无效的快捷键信息' }
      }
      const bindings = configHelper.updateShortcutBinding(payload.action, payload.accelerator)
      if (state.overlayLocked) {
        state.shortcutsHelper?.registerGlobalShortcuts()
      }
      broadcastToRenderers('shortcuts-updated', bindings)

      let syncResult: { success: boolean; error?: string } | null = null
      if (typeof (simpleAuthManager as any).syncUserShortcuts === 'function') {
        try {
          syncResult = await (simpleAuthManager as any).syncUserShortcuts({
            [payload.action]: payload.accelerator
          })
          if (!syncResult?.success) {
            console.warn('同步快捷键到服务器失败:', syncResult?.error)
          }
        } catch (error: any) {
          console.error('同步快捷键时出现异常:', error)
          syncResult = { success: false, error: error?.message || '同步快捷键失败' }
        }
      } else {
        console.warn('当前认证管理器不支持同步快捷键')
      }

      return {
        success: true,
        bindings,
        synced: syncResult?.success ?? false,
        syncError: syncResult?.error
      }
    })

    ipcMain.handle('client-theme:get', () => {
      const theme = getStoredTheme()
      state.currentTheme = theme
      return { success: true, theme }
    })

    ipcMain.handle('client-theme:set', (_event, theme: 'dark' | 'light') => {
      if (theme !== 'dark' && theme !== 'light') {
        return { success: false, error: '无效的主题' }
      }
      setClientTheme(theme)
      return { success: true, theme }
    })

    ipcMain.handle('shortcuts:sync-user', async (_event, shortcuts: Record<string, string>) => {
      try {
        if (typeof (simpleAuthManager as any).syncUserShortcuts !== 'function') {
          return { success: false, error: '当前环境不支持同步快捷键' }
        }
        const result = await (simpleAuthManager as any).syncUserShortcuts(shortcuts)
        return result || { success: false, error: '同步失败' }
      } catch (error: any) {
        console.error('同步用户快捷键失败:', error)
        return { success: false, error: error?.message || '同步快捷键失败' }
      }
    })

    ipcMain.handle('shortcuts:start-test', () => {
      return { success: false, error: '快捷键测试方式已更新' }
    })

    ipcMain.handle('updates:download-latest', (_event, url: string) => {
      if (!url) {
        return { success: false, error: '没有可用的下载地址' }
      }
      shell.openExternal(url)
      return { success: true }
    })

    ipcMain.handle('openExternal', (_event, url: string) => {
      if (!url) {
        return { success: false, error: '无效的链接' }
      }
      try {
        shell.openExternal(url)
        return { success: true }
      } catch (error) {
        console.error('打开外部链接失败:', error)
        return { success: false, error: '无法打开链接' }
      }
    })

    ipcMain.handle('window-control', (event, action: 'minimize' | 'close' | 'toggle-maximize') => {
      const targetWindow = BrowserWindow.fromWebContents(event.sender)
      if (!targetWindow) {
        return { success: false, error: '无法获取窗口实例' }
      }
      if (action === 'minimize') {
        targetWindow.minimize()
        return { success: true }
      }
      if (action === 'close') {
        targetWindow.close()
        return { success: true }
      }
      if (action === 'toggle-maximize') {
        if (targetWindow.isMaximized()) {
          targetWindow.unmaximize()
        } else {
          targetWindow.maximize()
        }
        return { success: true }
      }
      return { success: false, error: '未知操作' }
    })

    ipcMain.handle('shortcuts:start-test-mode', async () => {
      if (!state.overlayLocked) {
        const launchResult = await launchExamClient({ preserveEntryWindows: true })
        if (!launchResult.success) {
          return launchResult
        }
      }
      state.isTestModeActive = true
      const searchActions: ShortcutAction[] = ['programming', 'debug', 'singleChoice', 'singleChoiceAlt', 'multipleChoice', 'universal']

      state.shortcutsHelper?.beginShortcutTest('any', {
        persistent: true,
        onBefore: (action) => {
          if (searchActions.includes(action)) {
            showTestOverlay({
              message: `${formatActionLabel(action)} 快捷键检测结果：正常`,
              success: true
            })
            return true
          }
          return false
        },
        onAfter: (action) => {
          showTestOverlay({
            message: `${formatActionLabel(action)} 快捷键检测结果：正常`,
            success: true
          })
        }
      })

      return { success: true }
    })

    ipcMain.handle('shortcuts:stop-test-mode', async () => {
      await stopTestMode({ preserveEntryWindows: true })
      return { success: true }
    })

    // Initialize auto-updater regardless of environment
    initAutoUpdater()
    console.log(
      "Auto-updater initialized in",
      isDev ? "development" : "production",
      "mode"
    )
  } catch (error) {
    console.error("Failed to initialize application:", error)
    app.quit()
  }
}

// Auth callback handling removed - no longer needed
app.on("open-url", (event, url) => {
  console.log("open-url event received:", url)
  event.preventDefault()
})

// Second instance handler already registered above, removing duplicate

// Prevent multiple instances of the app
if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      try {
        state.mainWindow = null
        app.quit()
      } catch (error) {
        console.error("Error during app quit:", error)
      }
    }
  })
}

app.on("activate", () => {
  try {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (state.overlayLocked) {
        createWindow()
      } else {
        simpleAuthManager.isAuthenticated().then((authed) => {
          if (authed) {
            createConfigWindow()
          } else {
            createLoginWindow()
          }
        })
      }
    }
  } catch (error) {
    console.error("Error during app activation:", error)
  }
})

// State getter/setter functions
function getMainWindow(): BrowserWindow | null {
  return state.mainWindow
}

function getActiveRendererWindows(): BrowserWindow[] {
  return [state.loginWindow, state.configWindow, state.mainWindow].filter(
    (win): win is BrowserWindow => Boolean(win) && !win!.isDestroyed()
  )
}

function broadcastToRenderers(channel: string, payload?: any) {
  getActiveRendererWindows().forEach((win) => {
    try {
      win.webContents.send(channel, payload)
    } catch (error) {
      console.error(`Failed to send ${channel} to window:`, error)
    }
  })
}

function getView(): "queue" | "solutions" | "debug" {
  return state.view
}

function setView(view: "queue" | "solutions" | "debug"): void {
  state.view = view
  state.screenshotHelper?.setView(view)
}

function getScreenshotHelper(): ScreenshotHelper | null {
  return state.screenshotHelper
}

function getProblemInfo(): any {
  return state.problemInfo
}

function setProblemInfo(problemInfo: any): void {
  state.problemInfo = problemInfo
}

function getScreenshotQueue(): string[] {
  return state.screenshotHelper?.getScreenshotQueue() || []
}

function getExtraScreenshotQueue(): string[] {
  return state.screenshotHelper?.getExtraScreenshotQueue() || []
}

function clearQueues(): void {
  state.screenshotHelper?.clearQueues()
  state.problemInfo = null
  // 🆕 不再重置 userManuallyResized 状态，保持用户的宽度设置
  setView("queue")
  console.log("🔄 已清除队列，保持窗口宽度设置")
}

async function takeScreenshot(): Promise<string> {
  if (!state.mainWindow) throw new Error("No main window available")
  return (
    state.screenshotHelper?.takeScreenshot(
      () => hideMainWindow(),
      () => showMainWindow()
    ) || ""
  )
}

async function getImagePreview(filepath: string): Promise<string> {
  return state.screenshotHelper?.getImagePreview(filepath) || ""
}

async function handleQuitShortcut() {
  if (state.isTestModeActive) {
    await stopTestMode({ preserveEntryWindows: true })
    return
  }
  app.quit()
}

async function deleteScreenshot(
  path: string
): Promise<{ success: boolean; error?: string }> {
  return (
    state.screenshotHelper?.deleteScreenshot(path) || {
      success: false,
      error: "Screenshot helper not initialized"
    }
  )
}

function setHasDebugged(value: boolean): void {
  state.hasDebugged = value
}

function getHasDebugged(): boolean {
  return state.hasDebugged
}

function isVisible(): boolean {
  return state.isWindowVisible
}

// Export state and functions for other modules
  export {
    state,
    createWindow,
    hideMainWindow,
    showMainWindow,
    toggleMainWindow,
    setWindowDimensions,
    moveWindowHorizontal,
    moveWindowVertical,
    getMainWindow,
    getView,
    setView,
    getScreenshotHelper,
    getProblemInfo,
    setProblemInfo,
    getScreenshotQueue,
    getExtraScreenshotQueue,
    clearQueues,
    takeScreenshot,
    getImagePreview,
    deleteScreenshot,
    setHasDebugged,
    getHasDebugged,
    isVisible
  }

app.whenReady().then(initializeApp)
function formatActionLabel(action: ShortcutAction) {
  const mapping: Record<ShortcutAction, string> = {
    screenshot: '截图',
    programming: '搜编程题',
    debug: '搜调试题',
    singleChoice: '搜单选',
    singleChoiceAlt: '搜单选',
    multipleChoice: '搜多选',
    universal: '通用搜题',
    partialScreenshot: '部分截图',
    reset: '重置',
    toggleWindow: '显示/隐藏',
    openConfig: '返回配置页',
    moveWindowLeft: '窗口左移',
    moveWindowRight: '窗口右移',
    moveWindowUp: '窗口上移',
    moveWindowDown: '窗口下移',
    decreaseWindowWidth: '减小窗口宽度',
    increaseWindowWidth: '增大窗口宽度',
    decreaseOpacity: '降低透明度',
    increaseOpacity: '提高透明度',
    decreaseOpacityAlt: '降低透明度',
    increaseOpacityAlt: '提高透明度',
    decreaseWindowHeight: '减小窗口高度',
    increaseWindowHeight: '增大窗口高度',
    zoomOut: '缩小界面',
    zoomIn: '放大界面',
    resetZoom: '重置缩放',
    toggleRawOutputView: '切换原始输出',
    deleteLastScreenshot: '删除截图',
    recoverWindow: '恢复窗口',
    refreshConfig: '刷新配置',
    createRemotePairing: '生成手机连接码',
    copyCode: '复制代码',
    scrollCodeLeft: '代码左移',
    scrollCodeRight: '代码右移',
    scrollCodeUp: '代码上移',
    scrollCodeDown: '代码下移'
  }
  return mapping[action] || action
}

function showTestOverlay(payload: { message: string; success: boolean }) {
  try {
    if (!state.testOverlay || state.testOverlay.isDestroyed()) {
      state.testOverlay = new BrowserWindow({
        width: 420,
        height: 160,
        frame: false,
        transparent: true,
        resizable: false,
        alwaysOnTop: true,
        skipTaskbar: true,
        focusable: false,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      const html = encodeURIComponent([
        '<!DOCTYPE html>',
        '<html>',
        '  <head>',
        '    <style>',
        "      body { margin:0; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif; background:transparent; display:flex; align-items:center; justify-content:center; height:100%; }",
        '      .toast { padding:20px 24px; border-radius:24px; font-size:20px; font-weight:600; box-shadow:0 25px 60px rgba(15,23,42,0.25); border:1px solid rgba(15,23,42,0.08); backdrop-filter:blur(10px); }',
        '      .success { background:rgba(16,185,129,0.95); color:white; border-color:rgba(16,185,129,0.4); }',
        '      .error { background:rgba(248,113,113,0.95); color:white; border-color:rgba(248,113,113,0.4); }',
        '    </style>',
        '  </head>',
        '  <body>',
        '    <div id="toast" class="toast"></div>',
        '    <script>',
        '      window.updateToast = function(payload) {',
        "        var toast = document.getElementById('toast');",
        '        toast.textContent = payload.message;',
        "        toast.className = 'toast ' + (payload.success ? 'success' : 'error');",
        '      };',
        '    </script>',
        '  </body>',
        '</html>'
      ].join(''))
      state.testOverlay.loadURL('data:text/html;charset=utf-8,' + html)

      state.testOverlay.once('ready-to-show', () => {
        const { width, height } = screen.getPrimaryDisplay().workAreaSize
        state.testOverlay?.setPosition(Math.round(width / 2 - 210), Math.round(height / 2 - 80))
        state.testOverlay?.showInactive()
      })

      state.testOverlay.on('closed', () => {
        state.testOverlay = null
      })
    }

    const script = 'window.updateToast(' + JSON.stringify(payload) + ')'
    state.testOverlay.webContents.executeJavaScript(script)
  } catch (error) {
    console.error('显示测试提示失败:', error)
  }
}
