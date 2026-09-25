import { globalShortcut, app } from "electron"
import { ChildProcessWithoutNullStreams, spawn } from "child_process"
import { IShortcutsHelperDeps } from "./main"
import { configHelper } from "./ConfigHelper"
import {
  defaultShortcutBindings,
  mergeShortcutBindings,
  ShortcutAction
} from "../shared/shortcuts"

const configData = require('../../config.json')
const API_BASE_URL = configData.api?.baseUrl || 'http://127.0.0.1:18000'

const mouseButtonHookScript = String.raw`
$code = @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public static class ShortcutMouseHook
{
    private const int WH_MOUSE_LL = 14;
    private const int WM_XBUTTONDOWN = 0x020B;
    private const int XBUTTON1 = 0x0001;
    private const int XBUTTON2 = 0x0002;
    private const int VK_CONTROL = 0x11;
    private const int VK_MENU = 0x12;
    private const int VK_SHIFT = 0x10;
    private const int VK_LWIN = 0x5B;
    private const int VK_RWIN = 0x5C;

    private static LowLevelMouseProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;

    public delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MSLLHOOKSTRUCT
    {
        public POINT pt;
        public int mouseData;
        public int flags;
        public int time;
        public IntPtr dwExtraInfo;
    }

    [StructLayout(LayoutKind.Sequential)]
    public struct MSG
    {
        public IntPtr hwnd;
        public uint message;
        public IntPtr wParam;
        public IntPtr lParam;
        public uint time;
        public POINT pt;
    }

    public static void Start()
    {
        _hookID = SetHook(_proc);
        if (_hookID == IntPtr.Zero)
        {
            Console.WriteLine("HOOK_FAILED");
            Console.Out.Flush();
            return;
        }

        Console.WriteLine("HOOK_READY");
        Console.Out.Flush();

        MSG msg;
        while (GetMessage(out msg, IntPtr.Zero, 0, 0) != 0)
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }

        UnhookWindowsHookEx(_hookID);
        Console.WriteLine("HOOK_EXIT");
        Console.Out.Flush();
    }

    private static IntPtr SetHook(LowLevelMouseProc proc)
    {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule)
        {
            return SetWindowsHookEx(WH_MOUSE_LL, proc, GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static bool IsKeyPressed(int key)
    {
        return (GetAsyncKeyState(key) & 0x8000) != 0;
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && wParam == (IntPtr)WM_XBUTTONDOWN)
        {
            MSLLHOOKSTRUCT hookStruct = (MSLLHOOKSTRUCT)Marshal.PtrToStructure(lParam, typeof(MSLLHOOKSTRUCT));
            int mouseData = hookStruct.mouseData >> 16;
            if (mouseData == XBUTTON1 || mouseData == XBUTTON2)
            {
                bool ctrl = IsKeyPressed(VK_CONTROL);
                bool alt = IsKeyPressed(VK_MENU);
                bool shift = IsKeyPressed(VK_SHIFT);
                bool win = IsKeyPressed(VK_LWIN) || IsKeyPressed(VK_RWIN);
                string button = mouseData == XBUTTON1 ? "XBUTTON1" : "XBUTTON2";
                Console.WriteLine($"BUTTON:{button}:{(ctrl ? 1 : 0)}:{(alt ? 1 : 0)}:{(shift ? 1 : 0)}:{(win ? 1 : 0)}");
                Console.Out.Flush();
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);

    [DllImport("user32.dll")]
    private static extern short GetAsyncKeyState(int vKey);

    [DllImport("user32.dll")]
    private static extern bool GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);

    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);

    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);
}
"@

Add-Type -TypeDefinition $code | Out-Null
[ShortcutMouseHook]::Start()
`

export class ShortcutsHelper {
  private deps: IShortcutsHelperDeps
  private activeTest:
    | {
        action: ShortcutAction | 'any'
        onBefore?: (action: ShortcutAction) => boolean
        onAfter?: (action: ShortcutAction) => void
        persistent?: boolean
      }
    | null = null
  private shortcutHandlers: Partial<Record<ShortcutAction, () => Promise<void> | void>> = {}
  private mouseHookProcess: ChildProcessWithoutNullStreams | null = null
  private mouseHookBuffer = ''
  private mouseAcceleratorMap = new Map<string, ShortcutAction>()

  constructor(deps: IShortcutsHelperDeps) {
    this.deps = deps
  }

  private getBindings() {
    try {
      return configHelper.getShortcutBindings()
    } catch (error) {
      console.error('Failed to load shortcut bindings, fallback to defaults:', error)
      return { ...defaultShortcutBindings }
    }
  }

  private consumeTestTrigger(action: ShortcutAction): boolean {
    if (this.activeTest && (this.activeTest.action === action || this.activeTest.action === 'any')) {
      let skip = false
      try {
        skip = this.activeTest.onBefore?.(action) ?? false
      } catch (error) {
        console.error('Shortcut test callback failed:', error)
      }
      if (!this.activeTest.persistent) {
        this.activeTest = null
      }
      return skip
    }
    return false
  }

  private notifyTestAfter(action: ShortcutAction): void {
    if (this.activeTest && (this.activeTest.action === action || this.activeTest.action === 'any')) {
      try {
        this.activeTest.onAfter?.(action)
      } catch (error) {
        console.error('Shortcut test after-callback failed:', error)
      }
      if (!this.activeTest.persistent) {
        this.activeTest = null
      }
    }
  }

  /** Execute the canonical action used by both global shortcuts and remote control. */
  public async executeAction(action: ShortcutAction): Promise<boolean> {
    const handler = this.shortcutHandlers[action]
    if (!handler) {
      console.warn(`No handler registered for action ${action}`)
      return false
    }
    if (this.consumeTestTrigger(action)) {
      return false
    }
    try {
      await handler()
      this.notifyTestAfter(action)
      return true
    } catch (error) {
      console.error(`Shortcut handler for ${action} failed:`, error)
      this.notifyTestAfter(action)
      return false
    }
  }

  public beginShortcutTest(
    action: ShortcutAction | 'any',
    options?: {
      onBefore?: (action: ShortcutAction) => boolean
      onAfter?: (action: ShortcutAction) => void
      persistent?: boolean
    }
  ) {
    this.activeTest = {
      action,
      onBefore: options?.onBefore,
      onAfter: options?.onAfter,
      persistent: options?.persistent ?? false
    }
  }

  public cancelShortcutTest() {
    this.activeTest = null
  }

  private registerShortcut(
    accelerator: string | undefined,
    action: ShortcutAction,
    handler: () => Promise<void> | void
  ) {
    this.shortcutHandlers[action] = handler
    if (!accelerator) {
      return
    }
    if (accelerator.includes('MouseButton4') || accelerator.includes('MouseButton5')) {
      console.log(`⚠️ Skipping globalShortcut registration for ${accelerator}, handled via native mouse hook`)
      return
    }
    const registered = globalShortcut.register(accelerator, () => {
      void this.executeAction(action)
    })

    if (!registered) {
      console.warn(`⚠️ Failed to register shortcut ${accelerator} for action ${action}`)
    } else {
      console.log(`✅ Registered shortcut ${accelerator} for action ${action}`)
    }
  }

  private setupMouseButtonShortcuts(bindings: Record<ShortcutAction, string>) {
    this.mouseAcceleratorMap.clear()
    ;(Object.keys(bindings) as ShortcutAction[]).forEach((action) => {
      const accelerator = bindings[action]
      if (!accelerator) {
        return
      }
      if (accelerator.includes('MouseButton4') || accelerator.includes('MouseButton5')) {
        this.mouseAcceleratorMap.set(accelerator, action)
      }
    })

    if (!this.mouseAcceleratorMap.size) {
      this.stopMouseHook()
      return
    }

    if (process.platform !== 'win32') {
      console.warn('Mouse button shortcuts currently only supported on Windows')
      return
    }

    if (!this.mouseHookProcess) {
      this.startMouseHookProcess()
    }
  }

  private startMouseHookProcess() {
    if (this.mouseHookProcess || process.platform !== 'win32') {
      return
    }

    try {
      this.mouseHookProcess = spawn('powershell.exe', [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-Command',
        mouseButtonHookScript
      ], {
        windowsHide: true
      })

      this.mouseHookProcess.stdout.on('data', (data) => {
        this.handleMouseHookOutput(data.toString())
      })

      this.mouseHookProcess.stderr.on('data', (data) => {
        console.error('Mouse hook stderr:', data.toString())
      })

      this.mouseHookProcess.on('exit', (code) => {
        console.log('Mouse hook process exited with code', code)
        this.mouseHookProcess = null
        this.mouseHookBuffer = ''
        if (this.mouseAcceleratorMap.size > 0) {
          setTimeout(() => this.startMouseHookProcess(), 1000)
        }
      })
    } catch (error) {
      console.error('Failed to start mouse hook process:', error)
    }
  }

  private stopMouseHook() {
    if (this.mouseHookProcess) {
      try {
        this.mouseHookProcess.kill()
      } catch (error) {
        console.error('Failed to stop mouse hook process:', error)
      }
      this.mouseHookProcess = null
    }
    this.mouseHookBuffer = ''
  }

  private handleMouseHookOutput(chunk: string) {
    this.mouseHookBuffer += chunk
    const lines = this.mouseHookBuffer.split(/\r?\n/)
    this.mouseHookBuffer = lines.pop() ?? ''
    lines.forEach((line) => this.processMouseHookLine(line.trim()))
  }

  private processMouseHookLine(line: string) {
    if (!line) return
    if (line.startsWith('BUTTON:')) {
      const parts = line.split(':')
      if (parts.length >= 6) {
        const button = parts[1] === 'XBUTTON1' ? 'XBUTTON1' : 'XBUTTON2'
        const modifiers = {
          ctrl: parts[2] === '1',
          alt: parts[3] === '1',
          shift: parts[4] === '1',
          meta: parts[5] === '1'
        }
        this.handleMouseButtonEvent(button, modifiers)
      }
    } else if (line.includes('HOOK_FAILED')) {
      console.error('Mouse hook failed to initialize')
    } else if (line.includes('HOOK_READY')) {
      console.log('Mouse hook ready')
    }
  }

  private handleMouseButtonEvent(
    button: 'XBUTTON1' | 'XBUTTON2',
    modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
  ) {
    const accelerator = this.buildMouseAccelerator(
      button === 'XBUTTON1' ? 'MouseButton4' : 'MouseButton5',
      modifiers
    )
    const action = this.mouseAcceleratorMap.get(accelerator)
    if (!action) {
      return
    }
    void this.executeAction(action)
  }

  private buildMouseAccelerator(
    button: 'MouseButton4' | 'MouseButton5',
    modifiers: { ctrl: boolean; alt: boolean; shift: boolean; meta: boolean }
  ): string {
    const parts: string[] = []
    if (modifiers.ctrl || modifiers.meta) {
      parts.push('CommandOrControl')
    } else if (modifiers.alt) {
      parts.push('Alt')
    }
    if (modifiers.shift) {
      parts.push('Shift')
    }
    parts.push(button)
    return parts.join('+')
  }

  private ensureExamReady(label: string): boolean {
    if (!this.deps.isExamClientReady()) {
      console.log(`⚠️ 忽略快捷键 ${label}，考试客户端尚未启动`)
      return false
    }
    return true
  }

  /**
   * 异步执行耗时的清理操作，不阻塞UI响应
   * （积分操作已在主流程中同步处理）
   */
  private async performAsyncCleanup(): Promise<void> {
    console.log("🔄 Starting background cleanup operations...")
    
    const mainWindow = this.deps.getMainWindow()
    
    try {
      // 异步操作1: 清理临时文件（使用异步版本避免重复）
      setTimeout(() => {
        try {
          console.log("🔄 Background async temp file cleanup...")
          const screenshotHelper = this.deps.getScreenshotHelper?.()
          if (screenshotHelper) {
            screenshotHelper.cleanupAllTempFilesAsync()
            console.log("✅ Background temp file cleanup initiated")
          }
        } catch (error) {
          console.error("❌ 后台文件清理失败:", error)
        }
      }, 300) // 延迟300ms避免与cmd+r的文件清理冲突

      // 异步操作2: 仅确保窗口可见（不再调整位置）
      setTimeout(() => {
        try {
          if (!mainWindow || mainWindow.isDestroyed()) return

          console.log("🔄 Checking window visibility in background...")

          if (!this.deps.isVisible()) {
            console.log("Window was hidden, restoring visibility...")
            mainWindow.setIgnoreMouseEvents(false)
            mainWindow.showInactive()
            if (typeof (this.deps as any).setVisible === 'function') {
              (this.deps as any).setVisible(true)
            }
          }

          console.log("✅ Window visibility check completed")
        } catch (error) {
          console.error("❌ 后台窗口可见性检查失败:", error)
        }
      }, 50)

      console.log("🚀 Background cleanup operations scheduled (files & window state)")
      
    } catch (error) {
      console.error("❌ 异步清理过程出错:", error)
    }
  }

  /**
   * 清空后端编程题历史记录（发送信号，不等待返回）
   */
  private clearBackendHistory(): void {
    // 异步发送清空信号，不阻塞主流程
    setTimeout(async () => {
      try {
        console.log('🗑️ 发送清空后端编程题历史记录信号...')
        
        // 获取认证信息
        const { simpleAuthManager } = require('./SimpleAuthManager')
        const currentUser = simpleAuthManager.getCurrentUser()
        const sessionId = simpleAuthManager.getToken()
        
        if (!currentUser || !sessionId) {
          console.warn('⚠️ 用户未认证，跳过清空后端历史记录')
          return
        }

        // 发送清空信号（fire and forget）
        fetch(`${API_BASE_URL.replace(/\/$/, '')}/api/ai/history`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Session-Id': sessionId
          }
        }).catch(error => {
          console.error('❌ 发送清空历史记录信号失败:', error)
          // 忽略错误，不影响主流程
        })

        console.log('📡 已发送清空历史记录信号（不等待响应）')

      } catch (error) {
        console.error('❌ 发送清空历史记录信号异常:', error)
        // 忽略异常，不影响主流程
      }
    }, 0) // 立即异步执行
  }

  /**
   * 统一的完整重置逻辑，可供快捷键、首次启动、自动截图等场景复用
   */
  public async performCompleteReset(
    reason: 'shortcut' | 'initial-launch' | 'auto-before-screenshot' | 'manual-trigger' = 'manual-trigger'
  ): Promise<void> {
    try {
      const mainWindow = this.deps.getMainWindow()

      // 1. 取消正在进行的请求
      this.deps.processingHelper?.cancelOngoingRequests()

      // 2. 清空截图和内部状态
      this.deps.clearQueues()
      const screenshotHelper = this.deps.getScreenshotHelper?.()
      if (screenshotHelper) {
        screenshotHelper.clearQueues()
        console.log(`🧹 [${reason}] 强制清空截图助手队列`)
      }

      // 3. 回到Queue视图
      this.deps.setView('queue')

      // 4. 通知前端执行重置，附带备用信号
      if (mainWindow && !mainWindow.isDestroyed()) {
        console.log(`🔄 [${reason}] 发送 reset-view 信号`)
        mainWindow.webContents.send('reset-view')
        setTimeout(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            console.log(`🔄 [${reason}] 发送备用 reset-view 信号`)
            mainWindow.webContents.send('reset-view')
          }
        }, 150)
      }

      // 5. 后台副作用
      this.clearBackendHistory()

      if (this.deps.processingHelper) {
        setTimeout(async () => {
          try {
            await this.deps.processingHelper?.cancelAllCreditReservations()
            console.log(`✅ [${reason}] Credit cancellations completed`)
          } catch (error) {
            console.error(`❌ [${reason}] 积分取消失败:`, error)
          }
        }, 0)
      }

      setTimeout(() => {
        try {
          const helper = this.deps.getScreenshotHelper?.()
          helper?.cleanupAllTempFilesAsync()
          console.log(`🧹 [${reason}] 异步截图文件清理已启动`)
        } catch (error) {
          console.error(`❌ [${reason}] 文件清理失败:`, error)
        }
      }, 200)

      console.log(`🚀 Complete one-time reset process initiated (${reason})`)
    } catch (error) {
      console.error(`❌ [${reason}] 完整重置流程失败:`, error)
    }
  }

  private adjustOpacity(delta: number): void {
    const mainWindow = this.deps.getMainWindow();
    if (!mainWindow) return;
    
    // 从配置获取当前背景透明度
    const config = configHelper.loadConfig();
    let currentOpacity = config.clientSettings?.backgroundOpacity ?? 0.8;
    let newOpacity = Math.max(0, Math.min(1.0, currentOpacity + delta));
    console.log(`Adjusting background opacity from ${currentOpacity} to ${newOpacity}`);
    
    // 发送背景透明度变更事件到前端
    mainWindow.webContents.send("background-opacity-changed", newOpacity);
    
    // Save the background opacity setting to config
    try {
      configHelper.updateClientSettings({ backgroundOpacity: newOpacity });
    } catch (error) {
      console.error('Error saving background opacity to config:', error);
    }
    
    // If we're making the window visible, also make sure it's shown and interaction is enabled
    if (newOpacity > 0 && !this.deps.isVisible()) {
      this.deps.toggleMainWindow();
    }
  }

  public registerGlobalShortcuts(): void {
    // 清理之前注册的快捷键，防止重复注册
    console.log("Cleaning up existing global shortcuts...")
    globalShortcut.unregisterAll()

    const bindings = this.getBindings()

    console.log("Registering global shortcuts...")
    this.registerShortcut(bindings.screenshot, 'screenshot', async () => {
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        if (!this.ensureExamReady('screenshot')) {
          return
        }
        console.log("Taking screenshot...")
        const currentView = this.deps.getView?.()
        if (currentView && currentView !== 'queue') {
          console.log(`🔄 [auto-before-screenshot] 当前视图 ${currentView}，执行完整重置`)
          await this.performCompleteReset('auto-before-screenshot')
        } else {
          console.log('ℹ️ [auto-before-screenshot] 当前为 queue 视图，直接截图')
        }
        try {
          const screenshotPath = await this.deps.takeScreenshot()
          const preview = await this.deps.getImagePreview(screenshotPath)
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview
          })
        } catch (error) {
          console.error("Error capturing screenshot:", error)
          throw error
        }
      }
    })

    // 编程题快捷键 - Ctrl+Enter (Command+Enter)
    this.registerShortcut(bindings.programming, 'programming', async () => {
      if (!this.ensureExamReady('programming')) {
        return
      }
      console.log("Programming shortcut triggered. Processing as programming questions...")
      await this.deps.processingHelper?.processScreenshots()
    })

    // 单选题快捷键 - Ctrl+M (Command+M)  
    this.registerShortcut(bindings.singleChoice, 'singleChoice', async () => {
      if (!this.ensureExamReady('singleChoice')) {
        return
      }
      console.log("Single choice shortcut triggered.")
      await this.deps.processingHelper?.processScreenshotsAsChoice()
    })

    // 单选题快捷键 - Ctrl+, (Command+,) - 与Ctrl+M功能相同
    this.registerShortcut(bindings.singleChoiceAlt, 'singleChoiceAlt', async () => {
      if (!this.ensureExamReady('singleChoiceAlt')) {
        return
      }
      console.log("Single choice alternate shortcut triggered.")
      await this.deps.processingHelper?.processScreenshotsAsChoice()
    })

    // 多选题快捷键 - Ctrl+Shift+Enter (Command+Shift+Enter)
    this.registerShortcut(bindings.multipleChoice, 'multipleChoice', async () => {
      if (!this.ensureExamReady('multipleChoice')) {
        return
      }
      const timestamp = Date.now()
      console.log(`🔥 Multiple choice shortcut pressed at ${timestamp}. Processing...`)
      console.log(`🔍 processingHelper exists: ${!!this.deps.processingHelper}`)
      await this.deps.processingHelper?.processScreenshotsAsMultipleChoice()
      console.log(`✅ Multiple choice processing completed at ${Date.now()}`)
    })

    // 🆕 通用搜题快捷键 - Ctrl+. (Command+.)
    this.registerShortcut(bindings.universal, 'universal', async () => {
      if (!this.ensureExamReady('universal')) {
        return
      }
      const timestamp = Date.now()
      console.log(`🎯 Universal shortcut pressed at ${timestamp}. Processing...`)
      console.log(`🔍 processingHelper exists: ${!!this.deps.processingHelper}`)
      await this.deps.processingHelper?.processScreenshotsAsUniversal()
      console.log(`✅ Universal search processing completed at ${Date.now()}`)
    })

    // 🆕 部分截图快捷键 - Ctrl+Shift+S (Command+Shift+S)
    this.registerShortcut(bindings.partialScreenshot, 'partialScreenshot', async () => {
      if (!this.ensureExamReady('partialScreenshot')) {
        return
      }
      const timestamp = Date.now()
      console.log(`🎯 Partial screenshot shortcut pressed at ${timestamp}. Starting partial screenshot...`)

      try {
        const screenshotHelper = this.deps.getScreenshotHelper?.()
        if (!screenshotHelper) {
          console.error("❌ ScreenshotHelper not available")
          return
        }
        
        console.log("🔄 启动部分截图功能...")
        const mainWindow = this.deps.getMainWindow()
        
        // 通知前端开始部分截图过程
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("partial-screenshot-started")
        }
        
        // 调用部分截图功能
        const screenshotPath = await screenshotHelper.takePartialScreenshot()
        console.log(`✅ 部分截图完成: ${screenshotPath}`)
        
        // 生成preview数据
        console.log("📸 开始生成preview数据...")
        const preview = await screenshotHelper.getImagePreview(screenshotPath)
        console.log(`📸 Preview生成完成，长度: ${preview.length}`)
        
        // 通知前端截图已完成
        if (mainWindow && !mainWindow.isDestroyed()) {
          console.log("📤 发送screenshot-taken事件到前端...")
          mainWindow.webContents.send("screenshot-taken", {
            path: screenshotPath,
            preview: preview,
            type: "partial",
            timestamp: Date.now()
          })
          
          console.log("📤 发送force-refresh-queue事件...")
          // 强制刷新截图队列
          mainWindow.webContents.send("force-refresh-queue")
          console.log("✅ 所有事件发送完成")
        } else {
          console.error("❌ mainWindow 不存在或已销毁")
        }
        
        console.log(`🎉 部分截图流程完成，用时: ${Date.now() - timestamp}ms`)
        
      } catch (error) {
        console.error("❌ 部分截图失败:", error)
        
        // 通知前端截图失败
        const mainWindow = this.deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("partial-screenshot-error", {
            error: error.message || "部分截图功能出现未知错误"
          })
        }
      }
    })

    this.registerShortcut(bindings.reset, 'reset', async () => {
      if (!this.ensureExamReady('reset')) {
        return
      }
      console.log("Command + R pressed. Starting COMPLETE one-time reset process...")
      await this.performCompleteReset('shortcut')
    })

    this.registerShortcut(bindings.createRemotePairing, 'createRemotePairing', async () => {
      if (!this.deps.createRemotePairing) {
        console.warn('Remote pairing is not available yet')
        return
      }
      console.log('Creating remote pairing code from shortcut')
      await this.deps.createRemotePairing()
    })

    // New shortcuts for moving the window
    this.registerShortcut(bindings.moveWindowLeft, 'moveWindowLeft', () => {
      console.log("Command/Ctrl + Left pressed. Moving window left.")
      this.deps.moveWindowLeft()
    })

    this.registerShortcut(bindings.moveWindowRight, 'moveWindowRight', () => {
      console.log("Command/Ctrl + Right pressed. Moving window right.")
      this.deps.moveWindowRight()
    })

    this.registerShortcut(bindings.moveWindowDown, 'moveWindowDown', () => {
      console.log("Command/Ctrl + Down pressed. Moving window down.")
      try {
        this.deps.moveWindowDown()
      } catch (error) {
        console.error("Error moving window down:", error)
      }
    })

    this.registerShortcut(bindings.moveWindowUp, 'moveWindowUp', () => {
      console.log("Command/Ctrl + Up pressed. Moving window up.")
      try {
        this.deps.moveWindowUp()
      } catch (error) {
        console.error("Error moving window up:", error)
      }
    })

    this.registerShortcut(bindings.toggleWindow, 'toggleWindow', () => {
      console.log("Toggle window shortcut triggered.")
      this.deps.toggleMainWindow()
    })

    globalShortcut.register("CommandOrControl+Q", () => {
      console.log("Command/Ctrl + Q pressed.")
      if (this.deps.handleQuitShortcut) {
        Promise.resolve(this.deps.handleQuitShortcut()).catch((error) => {
          console.error('Quit shortcut handler failed:', error)
        })
      } else {
        app.quit()
      }
    })

    // Adjust opacity shortcuts
    this.registerShortcut(bindings.decreaseOpacity, 'decreaseOpacity', () => {
      console.log("Command/Ctrl + [ pressed. Decreasing opacity.")
      this.adjustOpacity(-0.1)
    })

    this.registerShortcut(bindings.increaseOpacity, 'increaseOpacity', () => {
      console.log("Command/Ctrl + ] pressed. Increasing opacity.")
      this.adjustOpacity(0.1)
    })

    // 🆕 新增透明度快捷键 - Ctrl+Shift+1 调低透明度，Ctrl+Shift+2 调高透明度
    this.registerShortcut(bindings.decreaseOpacityAlt, 'decreaseOpacityAlt', () => {
      console.log("Command/Ctrl + Shift + 1 pressed. Decreasing opacity (alt).")
      this.adjustOpacity(-0.1)
    })

    this.registerShortcut(bindings.increaseOpacityAlt, 'increaseOpacityAlt', () => {
      console.log("Command/Ctrl + Shift + 2 pressed. Increasing opacity (alt).")
      this.adjustOpacity(0.1)
    })

    // Zoom controls
    this.registerShortcut(bindings.zoomOut, 'zoomOut', () => {
      console.log("Command/Ctrl + - pressed. Zooming out.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom - 0.5)
      }
    })

    this.registerShortcut(bindings.resetZoom, 'resetZoom', () => {
      console.log("Command/Ctrl + 0 pressed. Resetting zoom.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.setZoomLevel(0)
      }
    })

    this.registerShortcut(bindings.zoomIn, 'zoomIn', () => {
      console.log("Command/Ctrl + = pressed. Zooming in.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        const currentZoom = mainWindow.webContents.getZoomLevel()
        mainWindow.webContents.setZoomLevel(currentZoom + 0.5)
      }
    })

    // 🆕 显示原始AI输出快捷键 - Ctrl+L/Cmd+L
    this.registerShortcut(bindings.toggleRawOutputView, 'toggleRawOutputView', () => {
      console.log("Command/Ctrl + L pressed. Toggling raw output view.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("toggle-raw-output-view")

        if (this.deps.processingHelper) {
          this.deps.processingHelper.sendLatestRawOutputToFrontend()
        }
      }
    })

    // Delete last screenshot shortcut (moved to Ctrl+D)
    this.registerShortcut(bindings.deleteLastScreenshot, 'deleteLastScreenshot', () => {
      console.log("Command/Ctrl + D pressed. Deleting last screenshot.")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow) {
        mainWindow.webContents.send("delete-last-screenshot")
      }
    })

    // Emergency window recovery shortcut (Ctrl+Shift+R)
    this.registerShortcut(bindings.recoverWindow, 'recoverWindow', () => {
      console.log("Emergency window recovery shortcut activated!")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        try {
          const { screen } = require('electron')
          const primaryDisplay = screen.getPrimaryDisplay()
          const workArea = primaryDisplay.workArea

          const bounds = mainWindow.getBounds()
          const centerX = workArea.x + (workArea.width - bounds.width) / 2
          const centerY = workArea.y + (workArea.height - bounds.height) / 2

          mainWindow.setPosition(Math.round(centerX), Math.round(centerY))
          mainWindow.setIgnoreMouseEvents(false)
          mainWindow.showInactive()

          console.log("Window recovered to center of screen")
        } catch (error) {
          console.error("Error during emergency window recovery:", error)
        }
      }
    })

    // Manual config refresh shortcut (Ctrl+Shift+C)
    this.registerShortcut(bindings.refreshConfig, 'refreshConfig', async () => {
      console.log("Manual config refresh shortcut activated!")
      try {
        const { simpleAuthManager } = require('./SimpleAuthManager')
        console.log("🔄 手动刷新用户配置...")
        await simpleAuthManager.refreshUserConfig(true)
        console.log("✅ 配置刷新完成")

        const mainWindow = this.deps.getMainWindow()
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send("config-refreshed")
        }
      } catch (error) {
        console.error("Error during manual config refresh:", error)
      }
    })

    // Copy code shortcut (Ctrl/Cmd+J) - 直接在主进程中处理复制
    this.registerShortcut(bindings.copyCode, 'copyCode', () => {
      console.log("🔥 Command/Ctrl + J pressed. Copying code directly...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("request-code-for-copy")
      } else {
        console.error("❌ MainWindow is null or destroyed")
      }
    })

    // 🆕 水平滚动快捷键
    this.registerShortcut(bindings.scrollCodeLeft, 'scrollCodeLeft', () => {
      console.log("🔥 Command/Ctrl + Shift + Left pressed. Scrolling code left...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scroll-code-horizontal", { direction: "left" })
      }
    })

    this.registerShortcut(bindings.scrollCodeRight, 'scrollCodeRight', () => {
      console.log("🔥 Command/Ctrl + Shift + Right pressed. Scrolling code right...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scroll-code-horizontal", { direction: "right" })
      }
    })

    this.registerShortcut(bindings.scrollCodeUp, 'scrollCodeUp', () => {
      console.log("🔥 Command/Ctrl + Shift + Up pressed. Scrolling code up...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scroll-code-vertical", { direction: "up" })
      }
    })

    this.registerShortcut(bindings.scrollCodeDown, 'scrollCodeDown', () => {
      console.log("🔥 Command/Ctrl + Shift + Down pressed. Scrolling code down...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("scroll-code-vertical", { direction: "down" })
      }
    })

    // 🆕 窗口宽度调整快捷键
    this.registerShortcut(bindings.decreaseWindowWidth, 'decreaseWindowWidth', () => {
      console.log("🔥 Command/Ctrl + Shift + 3 pressed. Decreasing window width...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        const oldBounds = mainWindow.getBounds()
        console.log(`📏 当前窗口尺寸: ${oldBounds.width}x${oldBounds.height} at (${oldBounds.x}, ${oldBounds.y})`)

        const minSize = mainWindow.getMinimumSize()
        const maxSize = mainWindow.getMaximumSize()
        console.log(`🔍 窗口尺寸限制: 最小 ${minSize[0]}x${minSize[1]}, 最大 ${maxSize[0]}x${maxSize[1]}`)

        const newWidth = oldBounds.width - 50
        console.log(`📏 计算新宽度: ${newWidth}px (原宽度: ${oldBounds.width}px)`)

        if (newWidth !== oldBounds.width) {
          console.log(`🔄 尝试设置窗口尺寸为: ${newWidth}x${oldBounds.height}`)

          mainWindow.setResizable(true)
          mainWindow.setSize(newWidth, oldBounds.height)

          if ((this.deps as any).setUserManuallyResized) {
            (this.deps as any).setUserManuallyResized(true)
            console.log("🔒 标记窗口为用户手动调整状态")
          }

          try {
            configHelper.updateClientSettings({ windowWidth: newWidth })
            console.log(`💾 窗口宽度已保存到配置: ${newWidth}px`)
          } catch (error) {
            console.error('保存窗口宽度失败:', error)
          }

          setTimeout(() => {
            const newBounds = mainWindow.getBounds()
            console.log(`🎯 最终窗口尺寸: ${newBounds.width}x${newBounds.height}`)
            if (newBounds.width === newWidth) {
              console.log("✅ 窗口宽度调整成功!")
            } else {
              console.log(`❌ 窗口宽度调整失败 (期望: ${newWidth}px, 实际: ${newBounds.width}px)`)
            }
          }, 100)
        }
      }
    })

    this.registerShortcut(bindings.increaseWindowWidth, 'increaseWindowWidth', () => {
      console.log("🔥 Command/Ctrl + Shift + 4 pressed. Increasing window width...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        const oldBounds = mainWindow.getBounds()
        console.log(`📏 当前窗口尺寸: ${oldBounds.width}x${oldBounds.height} at (${oldBounds.x}, ${oldBounds.y})`)

        const minSize = mainWindow.getMinimumSize()
        const maxSize = mainWindow.getMaximumSize()
        console.log(`🔍 窗口尺寸限制: 最小 ${minSize[0]}x${minSize[1]}, 最大 ${maxSize[0]}x${maxSize[1]}`)

        const { screen } = require('electron')
        const primaryDisplay = screen.getPrimaryDisplay()
        const workArea = primaryDisplay.workArea
        const systemMaxWidth = workArea.width - 100
        const windowMaxWidth = maxSize[0] > 0 ? maxSize[0] : systemMaxWidth
        const effectiveMaxWidth = Math.min(systemMaxWidth, windowMaxWidth)

        const newWidth = Math.min(effectiveMaxWidth, oldBounds.width + 50)
        console.log(`📏 计算新宽度: ${newWidth}px (原宽度: ${oldBounds.width}px, 有效最大宽度: ${effectiveMaxWidth}px)`)

        if (newWidth !== oldBounds.width) {
          console.log(`🔄 尝试设置窗口尺寸为: ${newWidth}x${oldBounds.height}`)

          mainWindow.setResizable(true)
          mainWindow.setSize(newWidth, oldBounds.height)

          if ((this.deps as any).setUserManuallyResized) {
            (this.deps as any).setUserManuallyResized(true)
            console.log("🔒 标记窗口为用户手动调整状态")
          }

          try {
            configHelper.updateClientSettings({ windowWidth: newWidth })
            console.log(`💾 窗口宽度已保存到配置: ${newWidth}px`)
          } catch (error) {
            console.error('保存窗口宽度失败:', error)
          }

          setTimeout(() => {
            const newBounds = mainWindow.getBounds()
            console.log(`🎯 最终窗口尺寸: ${newBounds.width}x${newBounds.height}`)
            if (newBounds.width === newWidth) {
              console.log("✅ 窗口宽度调整成功!")
            } else {
              console.log(`❌ 窗口宽度调整失败 (期望: ${newWidth}px, 实际: ${newBounds.width}px)`)
            }
          }, 100)
        }
      }
    })

    this.registerShortcut(bindings.decreaseWindowHeight, 'decreaseWindowHeight', () => {
      console.log("🔥 Command/Ctrl + Shift + 5 pressed. Decreasing window height...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
      const oldBounds = mainWindow.getBounds()
      const newHeight = Math.max(40, oldBounds.height - 40)

        if (newHeight !== oldBounds.height) {
          mainWindow.setResizable(true)
          mainWindow.setSize(oldBounds.width, newHeight)

          if ((this.deps as any).setUserManuallyResized) {
            (this.deps as any).setUserManuallyResized(true)
          }

          try {
            configHelper.updateClientSettings({ windowHeight: newHeight })
          } catch (error) {
            console.error('保存窗口高度失败:', error)
          }
        }
      }
    })

    this.registerShortcut(bindings.increaseWindowHeight, 'increaseWindowHeight', () => {
      console.log("🔥 Command/Ctrl + Shift + 6 pressed. Increasing window height...")
      const mainWindow = this.deps.getMainWindow()
      if (mainWindow && !mainWindow.isDestroyed()) {
        const oldBounds = mainWindow.getBounds()
        const { screen } = require('electron')
        const display = screen.getDisplayMatching(oldBounds)
        const workAreaRect = display?.workArea || screen.getPrimaryDisplay().workArea
        const workAreaBottom = workAreaRect.y + workAreaRect.height
        const maxHeight = 1800
        const step = 40

        // 目标高度最多 1800px
        const newHeight = Math.min(maxHeight, oldBounds.height + step)

        if (newHeight !== oldBounds.height) {
          mainWindow.setResizable(true)

          // 当窗口即将超过屏幕底部时，自动上移保持完整可见
          let targetY = oldBounds.y
          if (targetY + newHeight > workAreaBottom) {
            targetY = Math.max(workAreaRect.y, workAreaBottom - newHeight)
          }

          mainWindow.setBounds({
            x: oldBounds.x,
            y: Math.round(targetY),
            width: oldBounds.width,
            height: Math.round(newHeight)
          })

          if ((this.deps as any).setUserManuallyResized) {
            (this.deps as any).setUserManuallyResized(true)
          }

          try {
            configHelper.updateClientSettings({ windowHeight: newHeight })
          } catch (error) {
            console.error('保存窗口高度失败:', error)
          }
        }
      }
    })

    this.setupMouseButtonShortcuts(bindings)

    // Unregister shortcuts when quitting
    app.on("will-quit", () => {
      globalShortcut.unregisterAll()
      this.stopMouseHook()
    })
  }
}
