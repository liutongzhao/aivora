// ScreenshotHelper.ts

import path from "node:path"
import fs from "node:fs"
import { app } from "electron"
import { v4 as uuidv4 } from "uuid"
import { execFile } from "child_process"
import { promisify } from "util"
import screenshot from "screenshot-desktop"
import os from "os"
import { spawn } from "child_process"
import { clipboard, nativeImage, screen, BrowserWindow, ipcMain } from "electron"
// Removed sharp import - using native methods instead

const execFileAsync = promisify(execFile)

export class ScreenshotHelper {
  private screenshotQueue: string[] = []
  private extraScreenshotQueue: string[] = []
  private readonly MAX_SCREENSHOTS = 5

  private readonly screenshotDir: string
  private readonly extraScreenshotDir: string
  private readonly tempDir: string

  private view: "queue" | "solutions" | "debug" = "queue"
  private mainWindow: BrowserWindow | null = null

  // 资源管理相关
  private lastScreenshotTime = 0
  private pendingNativeCapture: Promise<string> | null = null
  private readonly MIN_SCREENSHOT_INTERVAL = 1000 // 1秒间隔
  
  // 部分截图相关
  private isWaitingForPartialScreenshot = false
  private partialScreenshotTimeout: NodeJS.Timeout | null = null
  private clipboardWatcher: NodeJS.Timeout | null = null
  
  // 两点定位截图相关
  private selectionState: 'waiting' | 'selecting_start' | 'selecting_end' | 'capturing' = 'waiting'
  private startPoint: { x: number, y: number } | null = null
  private endPoint: { x: number, y: number } | null = null
  private selectionWindow: BrowserWindow | null = null
  private partialScreenshotResolve: ((path: string) => void) | null = null
  private partialScreenshotReject: ((error: Error) => void) | null = null
  private ipcClickHandler: ((event: any, data: any) => void) | null = null
  private selectionDisplay: Electron.Display | null = null
  
  // 已移除亮度控制相关功能
  
  // 原生鼠标钩子进程
  private mouseHookProcess: any = null
  private macOverlayCleanup: (() => void) | null = null

  constructor(view: "queue" | "solutions" | "debug" = "queue", mainWindow?: BrowserWindow) {
    this.view = view
    this.mainWindow = mainWindow || null

    // Initialize directories
    this.screenshotDir = path.join(app.getPath("userData"), "screenshots")
    this.extraScreenshotDir = path.join(
      app.getPath("userData"),
      "extra_screenshots"
    )
    this.tempDir = path.join(app.getPath("temp"), "QuizCoze-screenshots")

    // Create directories if they don't exist
    this.ensureDirectoriesExist();
    
    // Clean existing screenshot directories when starting the app
    this.cleanScreenshotDirectories();
  }
  
  private ensureDirectoriesExist(): void {
    const directories = [this.screenshotDir, this.extraScreenshotDir, this.tempDir];
    
    for (const dir of directories) {
      if (!fs.existsSync(dir)) {
        try {
          fs.mkdirSync(dir, { recursive: true });
          console.log(`Created directory: ${dir}`);
        } catch (err) {
          console.error(`Error creating directory ${dir}:`, err);
        }
      }
    }
  }
  
  // This method replaces loadExistingScreenshots() to ensure we start with empty queues
  private cleanScreenshotDirectories(): void {
    try {
      // Clean main screenshots directory
      if (fs.existsSync(this.screenshotDir)) {
        const files = fs.readdirSync(this.screenshotDir)
          .filter(file => file.endsWith('.png'))
          .map(file => path.join(this.screenshotDir, file));
        
        // Delete each screenshot file
        for (const file of files) {
          try {
            fs.unlinkSync(file);
            console.log(`Deleted existing screenshot: ${file}`);
          } catch (err) {
            console.error(`Error deleting screenshot ${file}:`, err);
          }
        }
      }
      
      // Clean extra screenshots directory
      if (fs.existsSync(this.extraScreenshotDir)) {
        const files = fs.readdirSync(this.extraScreenshotDir)
          .filter(file => file.endsWith('.png'))
          .map(file => path.join(this.extraScreenshotDir, file));
        
        // Delete each screenshot file
        for (const file of files) {
          try {
            fs.unlinkSync(file);
            console.log(`Deleted existing extra screenshot: ${file}`);
          } catch (err) {
            console.error(`Error deleting extra screenshot ${file}:`, err);
          }
        }
      }
      
      console.log("Screenshot directories cleaned successfully");
    } catch (err) {
      console.error("Error cleaning screenshot directories:", err);
    }
  }

  public getView(): "queue" | "solutions" | "debug" {
    return this.view
  }

  public setView(view: "queue" | "solutions" | "debug"): void {
    console.log("Setting view in ScreenshotHelper:", view)
    console.log(
      "Current queues - Main:",
      this.screenshotQueue,
      "Extra:",
      this.extraScreenshotQueue
    )
    this.view = view
  }

  public getScreenshotQueue(): string[] {
    return this.screenshotQueue
  }

  public getExtraScreenshotQueue(): string[] {
    console.log("Getting extra screenshot queue:", this.extraScreenshotQueue)
    return this.extraScreenshotQueue
  }

  public clearQueues(): void {
    // Clear screenshotQueue
    this.screenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(`Error deleting screenshot at ${screenshotPath}:`, err)
      })
    })
    this.screenshotQueue = []

    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      fs.unlink(screenshotPath, (err) => {
        if (err)
          console.error(
            `Error deleting extra screenshot at ${screenshotPath}:`,
            err
          )
      })
    })
    this.extraScreenshotQueue = []
  }

  private async captureScreenshot(): Promise<Buffer> {
    try {
      console.log("Starting screenshot capture...");
      
      // For Windows, try multiple methods
      if (process.platform === 'win32') {
        return await this.captureWindowsScreenshot();
      } 
      
      // For macOS and Linux, use buffer directly
      console.log("Taking screenshot on non-Windows platform");
      const buffer = await screenshot({ format: 'png' });
      console.log(`Screenshot captured successfully, size: ${buffer.length} bytes`);
      return buffer;
    } catch (error) {
      console.error("Error capturing screenshot:", error);
      throw new Error(`截图失败: ${error.message}`);
    }
  }

  /**
   * Windows-specific screenshot capture with multiple fallback mechanisms
   */
  private async withCaptureTimeout<T>(operation: Promise<T>, milliseconds: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        operation,
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('截图步骤超时')), milliseconds)
        })
      ])
    } finally {
      if (timer) clearTimeout(timer)
    }
  }

  private async captureWindowsScreenshot(): Promise<Buffer> {
    console.log("Attempting Windows screenshot with multiple methods");
    
    // Method 1: Try screenshot-desktop with filename first
    try {
      const tempFile = path.join(this.tempDir, `temp-${uuidv4()}.png`);
      console.log(`Taking Windows screenshot to temp file (Method 1): ${tempFile}`);
      
      // Avoid accumulating native processes if one capture stops responding.
      if (this.pendingNativeCapture) throw new Error('原生截图仍未返回，使用备用截图')
      const capture = screenshot({ filename: tempFile, format: 'png' }) as unknown as Promise<string>
      this.pendingNativeCapture = capture
      let timedOut = false
      void capture.finally(() => {
        if (this.pendingNativeCapture === capture) this.pendingNativeCapture = null
        if (timedOut) void fs.promises.unlink(tempFile).catch(() => undefined)
      }).catch(() => undefined)
      try {
        await this.withCaptureTimeout(capture, 6000)
      } catch (error) {
        timedOut = true
        void fs.promises.unlink(tempFile).catch(() => undefined)
        throw error
      }
      
      if (fs.existsSync(tempFile)) {
        const buffer = await fs.promises.readFile(tempFile);
        console.log(`Method 1 successful, screenshot size: ${buffer.length} bytes`);
        
        // Cleanup temp file
        try {
          await fs.promises.unlink(tempFile);
        } catch (cleanupErr) {
          console.warn("Failed to clean up temp file:", cleanupErr);
        }
        
        return buffer;
      } else {
        console.log("Method 1 failed: File not created");
        throw new Error("Screenshot file not created");
      }
    } catch (error) {
      console.warn("Windows screenshot Method 1 failed:", error);
      
      // Method 2: Try using PowerShell
      try {
        console.log("Attempting Windows screenshot with PowerShell (Method 2)");
        const tempFile = path.join(this.tempDir, `ps-temp-${uuidv4()}.png`);
        
        // PowerShell command to take screenshot using .NET classes with DPI awareness
        const sanitizedTempFile = tempFile.replace(/'/g, "''")
        const psScript = `
        Add-Type -AssemblyName System.Windows.Forms,System.Drawing
        Add-Type @"
        using System;
        using System.Runtime.InteropServices;
        public class DPIHelper {
            [DllImport("user32.dll")]
            public static extern bool SetProcessDPIAware();
            [DllImport("user32.dll")]
            public static extern int GetSystemMetrics(int nIndex);
        }
"@
        
        # Set DPI awareness
        [DPIHelper]::SetProcessDPIAware()
        
        # Get virtual screen dimensions (handles multiple monitors and DPI)
        $left = [DPIHelper]::GetSystemMetrics(76)    # SM_XVIRTUALSCREEN
        $top = [DPIHelper]::GetSystemMetrics(77)     # SM_YVIRTUALSCREEN  
        $width = [DPIHelper]::GetSystemMetrics(78)   # SM_CXVIRTUALSCREEN
        $height = [DPIHelper]::GetSystemMetrics(79)  # SM_CYVIRTUALSCREEN
        
        Write-Host "Virtual screen: Left=$left, Top=$top, Width=$width, Height=$height"
        
        $bmp = New-Object System.Drawing.Bitmap $width, $height
        $graphics = [System.Drawing.Graphics]::FromImage($bmp)
        $graphics.CopyFromScreen($left, $top, 0, 0, [System.Drawing.Size]::new($width, $height))
        $bmp.Save('${sanitizedTempFile}', [System.Drawing.Imaging.ImageFormat]::Png)
        $graphics.Dispose()
        $bmp.Dispose()
        `;
        
        // Execute PowerShell
        await execFileAsync('powershell', [
          '-NoProfile', 
          '-ExecutionPolicy', 'Bypass',
          '-Command', psScript
        ], { timeout: 8000, windowsHide: true });
        
        // Check if file exists and read it
        if (fs.existsSync(tempFile)) {
          const buffer = await fs.promises.readFile(tempFile);
          console.log(`Method 2 successful, screenshot size: ${buffer.length} bytes`);
          
          // Cleanup
          try {
            await fs.promises.unlink(tempFile);
          } catch (err) {
            console.warn("Failed to clean up PowerShell temp file:", err);
          }
          
          return buffer;
        } else {
          throw new Error("PowerShell screenshot file not created");
        }
      } catch (psError) {
        console.warn("Windows PowerShell screenshot failed:", psError);
        
        // Method 3: Last resort - create a tiny placeholder image
        console.log("All screenshot methods failed, creating placeholder image");
        
        // Create a 1x1 transparent PNG as fallback
        const fallbackBuffer = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
        console.log("Created placeholder image as fallback");
        
        // Show the error but return a valid buffer so the app doesn't crash
        throw new Error("无法使用任何方法捕获屏幕截图。请检查您的Windows安全设置并重试。");
      }
    }
  }

  public async takeScreenshot(
    hideMainWindow: () => void,
    showMainWindow: () => void
  ): Promise<string> {
    console.log("Taking screenshot in view:", this.view)
    
    // 检查截图频率限制
    const now = Date.now()
    if (now - this.lastScreenshotTime < this.MIN_SCREENSHOT_INTERVAL) {
      const remainingTime = this.MIN_SCREENSHOT_INTERVAL - (now - this.lastScreenshotTime)
      throw new Error(`截图过于频繁，请等待 ${Math.ceil(remainingTime / 1000)} 秒后再试`)
    }
    this.lastScreenshotTime = now
    
    // 🆕 临时降低反录屏保护以提升截图性能
    if (this.mainWindow?.webContents) {
      try {
        await this.withCaptureTimeout(this.mainWindow.webContents.executeJavaScript(`
          if (window.electronAPI && window.electronAPI.antiCapture) {
            window.electronAPI.antiCapture.temporaryReduce(2000)
          }
        `), 800)
      } catch (error) {
        console.warn('⚠️ 无法临时降低反录屏保护:', error)
      }
    }
    
    hideMainWindow()
    
    // 优化延迟时间，减少等待
    const hideDelay = process.platform === 'win32' ? 300 : 200;
    await new Promise((resolve) => setTimeout(resolve, hideDelay))

    let screenshotPath = ""
    try {
      // Get screenshot buffer using cross-platform method
      const screenshotBuffer = await this.captureScreenshot();
      
      if (!screenshotBuffer || screenshotBuffer.length === 0) {
        throw new Error("截图捕获返回了空缓冲区");
      }

      // Save and manage the screenshot based on current view
      if (this.view === "queue") {
        screenshotPath = path.join(this.screenshotDir, `${uuidv4()}.png`)
        await fs.promises.writeFile(screenshotPath, screenshotBuffer)
        console.log("Adding screenshot to main queue:", screenshotPath)
        this.screenshotQueue.push(screenshotPath)
        if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.screenshotQueue.shift()
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath)
              console.log(
                "Removed old screenshot from main queue:",
                removedPath
              )
            } catch (error) {
              console.error("Error removing old screenshot:", error)
            }
          }
        }
      } else {
        // In solutions view, only add to extra queue
        screenshotPath = path.join(this.extraScreenshotDir, `${uuidv4()}.png`)
        await fs.promises.writeFile(screenshotPath, screenshotBuffer)
        console.log("Adding screenshot to extra queue:", screenshotPath)
        this.extraScreenshotQueue.push(screenshotPath)
        if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
          const removedPath = this.extraScreenshotQueue.shift()
          if (removedPath) {
            try {
              await fs.promises.unlink(removedPath)
              console.log(
                "Removed old screenshot from extra queue:",
                removedPath
              )
            } catch (error) {
              console.error("Error removing old screenshot:", error)
            }
          }
        }
      }
    } catch (error) {
      console.error("Screenshot error:", error)
      throw error
    } finally {
      // Increased delay for showing window again
      await new Promise((resolve) => setTimeout(resolve, 200))
      // 注意：showMainWindow()已经在main.ts中被修改为使用showInactive()
      // 来避免抢夺焦点，所以这里仍然调用原函数
      showMainWindow()
    }

    return screenshotPath
  }

  public async getImagePreview(filepath: string): Promise<string> {
    try {
      if (!fs.existsSync(filepath)) {
        console.error(`Image file not found: ${filepath}`);
        return '';
      }
      
      const data = await fs.promises.readFile(filepath)
      const base64Data = data.toString("base64")
      
      // 🔧 修复：根据文件内容检测实际的MIME类型
      let mimeType = 'image/png' // 默认PNG
      
      // 检查文件头部字节来确定实际格式
      if (data.length >= 4) {
        // JPEG文件以 FF D8 FF 开头
        if (data[0] === 0xFF && data[1] === 0xD8 && data[2] === 0xFF) {
          mimeType = 'image/jpeg'
        }
        // PNG文件以 89 50 4E 47 开头
        else if (data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47) {
          mimeType = 'image/png'
        }
        // WebP文件包含 'WEBP' 标识
        else if (data.toString('ascii', 8, 12) === 'WEBP') {
          mimeType = 'image/webp'
        }
      }
      
      // 也可以通过base64头部进行二次验证
      if (base64Data.startsWith('/9j/')) {
        mimeType = 'image/jpeg'
      } else if (base64Data.startsWith('iVBORw0KGgo')) {
        mimeType = 'image/png'
      } else if (base64Data.startsWith('UklGR')) {
        mimeType = 'image/webp'
      }
      
      console.log(`🔍 [SCREENSHOT] 文件格式检测: ${filepath}`)
      console.log(`  - 检测到的MIME类型: ${mimeType}`)
      console.log(`  - 文件大小: ${data.length} bytes`)
      console.log(`  - Base64长度: ${base64Data.length}`)
      console.log(`  - Base64数据格式: ${base64Data.startsWith('data:') ? 'data URL' : 'raw base64'}`)
      
      return `data:${mimeType};base64,${base64Data}`
    } catch (error) {
      console.error("Error reading image:", error)
      return ''
    }
  }

  public async deleteScreenshot(
    path: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      if (fs.existsSync(path)) {
        await fs.promises.unlink(path)
      }
      
      if (this.view === "queue") {
        this.screenshotQueue = this.screenshotQueue.filter(
          (filePath) => filePath !== path
        )
      } else {
        this.extraScreenshotQueue = this.extraScreenshotQueue.filter(
          (filePath) => filePath !== path
        )
      }
      return { success: true }
    } catch (error) {
      console.error("Error deleting file:", error)
      return { success: false, error: error.message }
    }
  }

  public clearExtraScreenshotQueue(): void {
    // Clear extraScreenshotQueue
    this.extraScreenshotQueue.forEach((screenshotPath) => {
      if (fs.existsSync(screenshotPath)) {
        fs.unlink(screenshotPath, (err) => {
          if (err)
            console.error(
              `Error deleting extra screenshot at ${screenshotPath}:`,
              err
            )
        })
      }
    })
    this.extraScreenshotQueue = []
  }

  /**
   * 异步清理所有临时文件和缓存（避免阻塞主线程）
   */
  public cleanupAllTempFilesAsync(): void {
    // 使用异步操作避免阻塞主线程
    setTimeout(async () => {
      console.log("🧹 开始异步清理所有临时文件和缓存...")
      
      try {
        // 1. 异步清理临时目录中的所有文件
        if (fs.existsSync(this.tempDir)) {
          const tempFiles = await fs.promises.readdir(this.tempDir)
          let cleanedCount = 0
          
          // 分批处理文件，每批处理5个文件后让出线程
          for (let i = 0; i < tempFiles.length; i++) {
            try {
              const file = tempFiles[i]
              const filePath = path.join(this.tempDir, file)
              const stats = await fs.promises.stat(filePath)
              
              // 删除所有临时文件(包括temp-*.png和ps-temp-*.png)
              if (file.includes('temp-') && file.endsWith('.png')) {
                await fs.promises.unlink(filePath)
                console.log(`🗑️ 删除临时文件: ${file}`)
                cleanedCount++
              }
              // 删除PowerShell相关的临时文件
              else if (file.includes('partial_screenshot_') && file.endsWith('.png')) {
                // 检查是否是失败的部分截图临时文件（超过10分钟的）
                if (Date.now() - stats.mtime.getTime() > 10 * 60 * 1000) {
                  await fs.promises.unlink(filePath)
                  console.log(`🗑️ 删除过期部分截图: ${file}`)
                  cleanedCount++
                }
              }
              // 删除超过1小时的其他文件
              else if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
                await fs.promises.unlink(filePath)
                console.log(`🗑️ 删除过期文件: ${file}`)
                cleanedCount++
              }
              
              // 每处理5个文件让出线程，避免长时间阻塞
              if (i % 5 === 0 && i > 0) {
                await new Promise(resolve => setTimeout(resolve, 1))
              }
              
            } catch (err) {
              console.warn(`⚠️ 删除临时文件失败 ${tempFiles[i]}:`, err.message)
            }
          }
          
          console.log(`✅ 异步临时目录清理完成，删除了 ${cleanedCount} 个文件`)
        }
        
        // 2. 让出线程后再继续清理截图目录
        await new Promise(resolve => setTimeout(resolve, 10))
        this.cleanScreenshotDirectories()
        
        // 3. 让出线程后再清理队列
        await new Promise(resolve => setTimeout(resolve, 10))
        this.clearQueues()
        
        console.log("✅ 异步清理所有临时文件和缓存完成")
        
      } catch (error) {
        console.error("❌ 异步清理临时文件时出错:", error)
      }
    }, 0)
  }

  /**
   * 清理所有临时文件和缓存 (Ctrl+R调用)
   */
  public cleanupAllTempFiles(): void {
    console.log("🧹 开始清理所有临时文件和缓存...")
    
    try {
      // 1. 清理临时目录中的所有文件
      if (fs.existsSync(this.tempDir)) {
        const tempFiles = fs.readdirSync(this.tempDir)
        let cleanedCount = 0
        
        for (const file of tempFiles) {
          try {
            const filePath = path.join(this.tempDir, file)
            const stats = fs.statSync(filePath)
            
            // 删除所有临时文件(包括temp-*.png和ps-temp-*.png)
            if (file.includes('temp-') && file.endsWith('.png')) {
              fs.unlinkSync(filePath)
              console.log(`🗑️ 删除临时文件: ${file}`)
              cleanedCount++
            }
            // 删除超过1小时的其他文件
            else if (Date.now() - stats.mtime.getTime() > 60 * 60 * 1000) {
              fs.unlinkSync(filePath)
              console.log(`🗑️ 删除过期文件: ${file}`)
              cleanedCount++
            }
          } catch (err) {
            console.warn(`⚠️ 删除临时文件失败 ${file}:`, err.message)
          }
        }
        
        console.log(`✅ 临时目录清理完成，删除了 ${cleanedCount} 个文件`)
      }
      
      // 2. 重新清理截图目录
      this.cleanScreenshotDirectories()
      
      // 3. 清理队列
      this.clearQueues()
      
      console.log("✅ 所有临时文件和缓存清理完成")
      
    } catch (error) {
      console.error("❌ 清理临时文件时出错:", error)
    }
  }

  /**
   * 🆕 隐蔽部分截图功能 - 两点定位方式
   * 用户先点击左上角，再点击右下角，完全隐蔽，不会被录屏检测到
   */
  public async takePartialScreenshot(): Promise<string> {
    console.log("🎯 启动隐蔽部分截图功能...")
    
    // 检查截图频率限制
    const now = Date.now()
    if (now - this.lastScreenshotTime < this.MIN_SCREENSHOT_INTERVAL) {
      const remainingTime = this.MIN_SCREENSHOT_INTERVAL - (now - this.lastScreenshotTime)
      throw new Error(`截图过于频繁，请等待 ${Math.ceil(remainingTime / 1000)} 秒后再试`)
    }
    this.lastScreenshotTime = now
    
    if (process.platform === 'darwin') {
      if (this.isWaitingForPartialScreenshot) {
        console.warn("⚠️ 上一次macOS截图尚未完成，正在重新初始化...")
        this.cleanupSelection()
      }

      this.isWaitingForPartialScreenshot = true

      try {
        const filepath = await this.takeMacPartialScreenshot()
        return filepath
      } finally {
        this.isWaitingForPartialScreenshot = false
      }
    }

    // 防止重复调用，但允许强制重置
    if (this.isWaitingForPartialScreenshot) {
      console.warn("⚠️ 检测到之前的截图进程未完成，强制清理...")
      this.cleanupSelection()
      // 短暂延迟确保清理完成
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    
    return new Promise<string>((resolve, reject) => {
      this.isWaitingForPartialScreenshot = true
      this.partialScreenshotResolve = resolve
      this.partialScreenshotReject = reject
      
      console.log("🔄 启动两点定位模式...")
      
      // 设置60秒超时
      this.partialScreenshotTimeout = setTimeout(() => {
        console.warn("⏰ 截图选择超时，自动清理资源")
        this.cleanupSelection()
        reject(new Error("截图选择超时，请重新尝试"))
      }, 60000)
      
      // 开始等待第一个点击（左上角）
      this.startPointSelection()
    })
  }
  

  /**
   * 开始点选模式 - 使用原生鼠标钩子（无窗口方案）
   */
  private startPointSelection(): void {
    console.log("📍 启动原生鼠标监听（无窗口）...")
    this.selectionState = 'selecting_start'
    this.startPoint = null
    this.endPoint = null
    this.selectionDisplay = null

    try {
      if (process.platform === 'win32') {
        // 使用原生鼠标钩子替代透明窗口 (Windows)
        this.setupNativeMouseHook()
        console.log("✅ 原生鼠标监听已启动")
      } else {
        // 非 Windows 平台使用覆盖层方案
        this.setupMacOverlaySelection()
        console.log("✅ 使用覆盖层进行两点选择")
      }
      
    } catch (error) {
      console.error("❌ 启动鼠标监听失败:", error)
      this.cleanupSelection()
      if (this.partialScreenshotReject) {
        this.partialScreenshotReject(new Error(`启动鼠标监听失败: ${error.message}`))
      }
    }
  }

  private getActiveWindow(): BrowserWindow | null {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      return this.mainWindow
    }

    const availableWindows = BrowserWindow.getAllWindows()
    const fallbackWindow = availableWindows.find(win => !win.isDestroyed()) || null
    if (fallbackWindow) {
      this.mainWindow = fallbackWindow
    }
    return fallbackWindow
  }

  private setupMacOverlaySelection(): void {
    const activeDisplay = screen.getDisplayNearestPoint(screen.getCursorScreenPoint())

    const overlay = new BrowserWindow({
      x: activeDisplay.bounds.x,
      y: activeDisplay.bounds.y,
      width: activeDisplay.bounds.width,
      height: activeDisplay.bounds.height,
      frame: false,
      transparent: true,
      resizable: false,
      movable: false,
      show: true,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      focusable: false,
      hasShadow: false,
      backgroundColor: '#00000000',
      acceptFirstMouse: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false
      }
    })

    this.selectionWindow = overlay

    const html = `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.05);
        cursor: crosshair;
        user-select: none;
      }
      #message {
        position: absolute;
        top: 40px;
        left: 50%;
        transform: translateX(-50%);
        padding: 12px 20px;
        border-radius: 20px;
        background: rgba(0, 0, 0, 0.6);
        color: #fff;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        font-size: 16px;
        letter-spacing: 0.5px;
        pointer-events: none;
        box-shadow: 0 4px 12px rgba(0,0,0,0.25);
        transition: opacity 0.2s ease;
      }
    </style>
  </head>
  <body>
    <div id="message">请点击截图区域的左上角</div>
    <script>
      const { ipcRenderer } = require('electron');
      const messageEl = document.getElementById('message');

      window.addEventListener('mousedown', (event) => {
        event.preventDefault();
        ipcRenderer.send('mac-overlay-click', {
          x: event.clientX,
          y: event.clientY
        });
      }, { capture: true });

      window.addEventListener('contextmenu', (event) => {
        event.preventDefault();
      });

      window.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
          ipcRenderer.send('mac-overlay-cancel');
          window.close();
        }
      });

      ipcRenderer.on('mac-overlay-message', (_event, text) => {
        if (messageEl) {
          messageEl.textContent = text;
        }
      });
    </script>
  </body>
</html>`

    overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
    overlay.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })

    const sendOverlayMessage = (text: string) => {
      if (!overlay.isDestroyed()) {
        overlay.webContents.send('mac-overlay-message', text)
      }
    }

    overlay.webContents.once('did-finish-load', () => {
      sendOverlayMessage('请点击截图区域的左上角')
    })

    const handleClick = (_event: Electron.IpcMainEvent, data: { x: number; y: number }) => {
      const globalPoint = {
        x: data.x + activeDisplay.bounds.x,
        y: data.y + activeDisplay.bounds.y
      }

      this.handleMouseClick(globalPoint.x, globalPoint.y).then(() => {
        if (this.selectionState === 'selecting_end') {
          sendOverlayMessage('请点击截图区域的右下角')
        }
      }).catch(error => {
        console.error('❌ 处理macOS覆盖层点击失败:', error)
      })
    }

    const handleCancel = () => {
      if (this.partialScreenshotReject) {
        this.partialScreenshotReject(new Error('截图被取消'))
      }
      this.cleanupSelection()
    }

    ipcMain.on('mac-overlay-click', handleClick)
    ipcMain.on('mac-overlay-cancel', handleCancel)

    overlay.on('closed', () => {
      ipcMain.removeListener('mac-overlay-click', handleClick)
      ipcMain.removeListener('mac-overlay-cancel', handleCancel)
      if (this.selectionWindow === overlay) {
        this.selectionWindow = null
      }
      this.macOverlayCleanup = null
    })

    this.macOverlayCleanup = () => {
      ipcMain.removeListener('mac-overlay-click', handleClick)
      ipcMain.removeListener('mac-overlay-cancel', handleCancel)
      if (!overlay.isDestroyed()) {
        overlay.close()
      }
      if (this.selectionWindow === overlay) {
        this.selectionWindow = null
      }
      this.macOverlayCleanup = null
    }
  }

  private async takeMacPartialScreenshot(): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      this.partialScreenshotResolve = resolve
      this.partialScreenshotReject = reject

      this.selectionState = 'selecting_start'
      this.startPoint = null
      this.endPoint = null

      try {
        this.setupMacOverlaySelection()
        console.log('✅ macOS 覆盖层选择已启动')
      } catch (error) {
        console.error('❌ 启动macOS覆盖层失败:', error)
        this.cleanupSelection()
        reject(error)
      }
    })
  }
  
  /**
   * 设置原生鼠标钩子（替代透明窗口）
   */
  private async setupNativeMouseHook(): Promise<void> {
    const hookScript = `
# 使用更简单的方法 - 直接调用Windows API而不依赖Windows.Forms
Add-Type @"
using System;
using System.Diagnostics;
using System.Runtime.InteropServices;

public class MouseHook
{
    private const int WH_MOUSE_LL = 14;
    private const int WM_LBUTTONDOWN = 0x0201;
    
    private static LowLevelMouseProc _proc = HookCallback;
    private static IntPtr _hookID = IntPtr.Zero;
    private static int clickCount = 0;
    private static bool shouldExit = false;
    private static bool dpiAwareInitialized = false;
    private static bool dpiAware = false;
    
    public delegate IntPtr LowLevelMouseProc(int nCode, IntPtr wParam, IntPtr lParam);

    public static void StartHook()
    {
        EnsureDpiAware();
        Console.WriteLine("HOOK_STARTED");
        Console.Out.Flush();
        
        _hookID = SetHook(_proc);
        if (_hookID == IntPtr.Zero)
        {
            Console.WriteLine("HOOK_FAILED");
            Console.Out.Flush();
            return;
        }
        
        // 简单的消息循环，不依赖Windows.Forms
        MSG msg = new MSG();
        while (!shouldExit && GetMessage(out msg, IntPtr.Zero, 0, 0) != 0)
        {
            TranslateMessage(ref msg);
            DispatchMessage(ref msg);
        }
        
        UnhookWindowsHookEx(_hookID);
        Console.WriteLine("HOOK_ENDED");
        Console.Out.Flush();
    }

    private static IntPtr SetHook(LowLevelMouseProc proc)
    {
        using (Process curProcess = Process.GetCurrentProcess())
        using (ProcessModule curModule = curProcess.MainModule)
        {
            return SetWindowsHookEx(WH_MOUSE_LL, proc,
                GetModuleHandle(curModule.ModuleName), 0);
        }
    }

    private static IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode >= 0 && wParam == (IntPtr)WM_LBUTTONDOWN)
        {
            POINT p;
            GetCursorPos(out p);
            Console.WriteLine("CLICK:" + p.X + "," + p.Y);
            Console.Out.Flush();
            clickCount++;
            if (clickCount >= 2)
            {
                Console.WriteLine("CLICK_COMPLETE");
                Console.Out.Flush();
                shouldExit = true;
                PostQuitMessage(0);
            }
        }
        return CallNextHookEx(_hookID, nCode, wParam, lParam);
    }

    private static void EnsureDpiAware()
    {
        if (dpiAwareInitialized)
        {
            return;
        }

        dpiAwareInitialized = true;

        try
        {
            int result = SetProcessDpiAwareness(PROCESS_PER_MONITOR_DPI_AWARE);
            if (result == 0)
            {
                dpiAware = true;
                return;
            }
        }
        catch
        {
            // 忽略不支持的情况，继续尝试后备方案
        }

        if (!dpiAware)
        {
            try
            {
                int result = SetProcessDpiAwareness(PROCESS_SYSTEM_DPI_AWARE);
                if (result == 0)
                {
                    dpiAware = true;
                    return;
                }
            }
            catch
            {
                // 忽略不支持的情况，继续尝试后备方案
            }
        }

        if (!dpiAware)
        {
            try
            {
                dpiAware = SetProcessDPIAware();
            }
            catch
            {
                dpiAware = false;
            }
        }

        Console.WriteLine("DPI_AWARE_INITIALIZED:" + dpiAware.ToString());
        Console.Out.Flush();
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

    [StructLayout(LayoutKind.Sequential)]
    public struct POINT
    {
        public int X;
        public int Y;
    }

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook,
        LowLevelMouseProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode,
        IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Auto, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string lpModuleName);
    
    [DllImport("user32.dll")]
    private static extern bool GetCursorPos(out POINT lpPoint);
    
    [DllImport("user32.dll")]
    private static extern int GetMessage(out MSG lpMsg, IntPtr hWnd, uint wMsgFilterMin, uint wMsgFilterMax);
    
    [DllImport("user32.dll")]
    private static extern bool TranslateMessage(ref MSG lpMsg);
    
    [DllImport("user32.dll")]
    private static extern IntPtr DispatchMessage(ref MSG lpMsg);
    
    [DllImport("user32.dll")]
    private static extern void PostQuitMessage(int nExitCode);

    [DllImport("shcore.dll")]
    private static extern int SetProcessDpiAwareness(int value);

    [DllImport("user32.dll")]
    private static extern bool SetProcessDPIAware();

    private const int PROCESS_SYSTEM_DPI_AWARE = 1;
    private const int PROCESS_PER_MONITOR_DPI_AWARE = 2;
}
"@

[MouseHook]::StartHook()
    `
    
    try {
      // 在后台执行鼠标钩子
      const process = spawn('powershell.exe', ['-Command', hookScript], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      
      // 监听输出来获取点击坐标
      process.stdout.on('data', (data: Buffer) => {
        const output = data.toString().trim()
        console.log(`📥 鼠标钩子输出: ${output}`)
        
        if (output.startsWith('CLICK:')) {
          const coords = output.replace('CLICK:', '').split(',')
          const x = parseInt(coords[0])
          const y = parseInt(coords[1])
          
          console.log(`🖱️ 原生鼠标点击: (${x}, ${y})`)
          this.handleMouseClick(x, y)
        } else if (output === 'HOOK_STARTED') {
          console.log('🔗 鼠标钩子已成功启动并开始监听')
        } else if (output === 'CLICK_COMPLETE') {
          console.log('✅ 两次点击已完成，钩子即将退出')
        } else if (output === 'HOOK_ENDED') {
          console.log('🔚 鼠标钩子正常结束')
        }
      })
      
      // 监听错误输出
      process.stderr.on('data', (data: Buffer) => {
        const error = data.toString().trim()
        console.error(`❌ 鼠标钩子错误: ${error}`)
      })
      
      // 监听进程结束
      process.on('close', (code) => {
        console.log(`🔚 鼠标钩子进程结束，退出码: ${code}`)
        this.mouseHookProcess = null
      })
      
      process.on('error', (error) => {
        console.error(`❌ 鼠标钩子进程错误:`, error)
        this.mouseHookProcess = null
      })
      
      // 保存进程引用以便清理
      this.mouseHookProcess = process
      
      console.log("✅ 原生鼠标钩子已启动")
      
    } catch (error) {
      console.error("❌ 启动鼠标钩子失败:", error)
      this.cleanupSelection()
      if (this.partialScreenshotReject) {
        this.partialScreenshotReject(new Error(`启动鼠标钩子失败: ${error.message}`))
      }
    }
  }
  
  /**
   * 处理鼠标点击事件
   */
  private async handleMouseClick(rawX: number, rawY: number): Promise<void> {
    try {
      console.log(`🖱️ 检测到点击位置: (${rawX}, ${rawY})`)

      const { dipX, dipY, display } = this.normalizeClickCoordinates(rawX, rawY)
      console.log(`🖱️ 归一化后的坐标(DIP): (${dipX}, ${dipY})，显示器: ${display.id}`)

      if (this.selectionState === 'selecting_start') {
        this.startPoint = { x: dipX, y: dipY }
        this.selectionDisplay = display
        console.log(`📍 左上角已选择: (${this.startPoint.x}, ${this.startPoint.y})`)
        this.selectionState = 'selecting_end'

        const activeWindow = this.getActiveWindow()
        if (activeWindow) {
          try {
            activeWindow.webContents.send('partial-screenshot-step', {
              stage: 'awaiting-end',
              timestamp: Date.now(),
              displayId: display.id
            })
          } catch (error) {
            console.warn('⚠️ 发送partial-screenshot-step事件失败:', error)
          }
        }

      } else if (this.selectionState === 'selecting_end') {
        if (this.selectionDisplay && display.id !== this.selectionDisplay.id) {
          console.warn(`⚠️ 第二个点位于不同显示器 (expected ${this.selectionDisplay.id}, got ${display.id})，重新开始选择`)
          this.startPointSelection()
          return
        }

        this.endPoint = { x: dipX, y: dipY }
        this.selectionDisplay = display
        console.log(`📍 右下角已选择: (${this.endPoint.x}, ${this.endPoint.y})`)

        if (this.startPoint && this.endPoint) {
          const width = Math.abs(this.endPoint.x - this.startPoint.x)
          const height = Math.abs(this.endPoint.y - this.startPoint.y)

          if (width < 5 || height < 5) {
            console.warn(`⚠️ 选择区域太小 (${width}x${height})，请重新选择`)
            this.startPointSelection()
            return
          }

          console.log(`📐 选择区域: ${width}x${height}`)

          this.selectionState = 'capturing'
          await this.captureSelectedArea()
        }
      }

    } catch (error) {
      console.error("❌ 处理点击事件失败:", error)
      this.cleanupSelection()
      if (this.partialScreenshotReject) {
        this.partialScreenshotReject(new Error(`点击处理失败: ${error.message}`))
      }
    }
  }

  private normalizeClickCoordinates(rawX: number, rawY: number): { dipX: number; dipY: number; display: Electron.Display } {
    if (process.platform === 'win32') {
      const display = this.getDisplayForPoint(rawX, rawY, { isPhysical: true })
      const scale = display.scaleFactor || 1
      const originDipX = display.bounds.x
      const originDipY = display.bounds.y
      const originPhysicalX = Math.round(originDipX * scale)
      const originPhysicalY = Math.round(originDipY * scale)

      const localDipX = (rawX - originPhysicalX) / scale
      const localDipY = (rawY - originPhysicalY) / scale
      const dipX = originDipX + localDipX
      const dipY = originDipY + localDipY

      return { dipX, dipY, display }
    }

    const display = this.getDisplayForPoint(rawX, rawY, { isPhysical: false })
    return { dipX: rawX, dipY: rawY, display }
  }

  private getDisplayForPoint(x: number, y: number, options?: { isPhysical: boolean }): Electron.Display {
    const isPhysical = options?.isPhysical ?? process.platform === 'win32'

    if (!isPhysical) {
      return screen.getDisplayNearestPoint({ x, y })
    }

    const displays = screen.getAllDisplays()
    for (const display of displays) {
      const scale = display.scaleFactor || 1
      const left = Math.round(display.bounds.x * scale)
      const top = Math.round(display.bounds.y * scale)
      const right = left + Math.round(display.bounds.width * scale)
      const bottom = top + Math.round(display.bounds.height * scale)

      if (x >= left && x <= right && y >= top && y <= bottom) {
        return display
      }
    }

    return screen.getPrimaryDisplay()
  }
  
  /**
   * 截取选定区域 - 使用直接区域截图
   */
  private async captureSelectedArea(): Promise<void> {
    try {
      console.log("📸 开始截取选定区域...")
      
      if (!this.startPoint || !this.endPoint) {
        throw new Error("缺少选择点信息")
      }
      
      // 先隐藏选择窗口，避免被截入
      if (this.selectionWindow && !this.selectionWindow.isDestroyed()) {
        this.selectionWindow.hide()
        // 等待窗口完全隐藏
        await new Promise(resolve => setTimeout(resolve, 100))
      }
      
      // 确保坐标正确（左上角 -> 右下角）
      const leftDip = Math.min(this.startPoint.x, this.endPoint.x)
      const topDip = Math.min(this.startPoint.y, this.endPoint.y)
      const rightDip = Math.max(this.startPoint.x, this.endPoint.x)
      const bottomDip = Math.max(this.startPoint.y, this.endPoint.y)

      const widthDip = rightDip - leftDip
      const heightDip = bottomDip - topDip

      console.log(`📐 截图区域 (DIP): x=${leftDip}, y=${topDip}, width=${widthDip}, height=${heightDip}`)
      
      // 生成临时文件路径
      const filename = `partial_screenshot_${Date.now()}_${uuidv4()}.png`
      const filepath = path.join(
        this.view === "queue" ? this.screenshotDir : this.extraScreenshotDir, 
        filename
      )
      
      // 获取屏幕缩放比例并调整坐标
      console.log("📷 使用系统命令直接截取指定区域...")
      console.log(`🔍 原始截图区域 (DIP): x=${leftDip}, y=${topDip}, width=${widthDip}, height=${heightDip}`)

      const baseDisplay = this.selectionDisplay
        ?? this.getDisplayForPoint(Math.round(leftDip + widthDip / 2), Math.round(topDip + heightDip / 2), { isPhysical: false })
      const scaleFactor = baseDisplay?.scaleFactor ?? 1
      const originDipX = baseDisplay?.bounds.x ?? 0
      const originDipY = baseDisplay?.bounds.y ?? 0
      const originPhysicalX = Math.round(originDipX * scaleFactor)
      const originPhysicalY = Math.round(originDipY * scaleFactor)

      const localDipLeft = leftDip - originDipX
      const localDipTop = topDip - originDipY

      const physicalLeft = originPhysicalX + Math.round(localDipLeft * scaleFactor)
      const physicalTop = originPhysicalY + Math.round(localDipTop * scaleFactor)
      const physicalWidth = Math.max(1, Math.round(widthDip * scaleFactor))
      const physicalHeight = Math.max(1, Math.round(heightDip * scaleFactor))

      console.log(`🔍 选中显示器: ${baseDisplay?.id ?? 'primary'} (scale=${scaleFactor})`)
      console.log(`🔍 截图区域 (物理像素): x=${physicalLeft}, y=${physicalTop}, width=${physicalWidth}, height=${physicalHeight}`)
      
      if (process.platform === 'win32') {
        await this.takeWindowsRegionScreenshot(physicalLeft, physicalTop, physicalWidth, physicalHeight, filepath)
      } else if (process.platform === 'darwin') {
        await this.takeMacRegionScreenshot(physicalLeft, physicalTop, physicalWidth, physicalHeight, filepath)
      } else {
        await this.takeLinuxRegionScreenshot(physicalLeft, physicalTop, physicalWidth, physicalHeight, filepath)
      }
      
      // 验证文件是否创建成功
      if (!fs.existsSync(filepath)) {
        throw new Error("截图文件未能成功创建")
      }
      
      const stats = fs.statSync(filepath)
      console.log(`✅ 部分截图已保存: ${filepath}`)
      console.log(`📊 文件大小: ${(stats.size / 1024).toFixed(2)} KB`)
      
      // 🔍 使用nativeImage验证图片尺寸
      try {
        const savedImageBuffer = await fs.promises.readFile(filepath)
        const savedImage = nativeImage.createFromBuffer(savedImageBuffer)
        const savedSize = savedImage.getSize()
        
        console.log(`🔍 图片实际尺寸: ${savedSize.width}x${savedSize.height}`)
        console.log(`🔍 期望物理尺寸: ${physicalWidth}x${physicalHeight}`)
        console.log(`🔍 期望DIP尺寸: ${widthDip}x${heightDip}`)

        const sizeDiffW = Math.abs(savedSize.width - physicalWidth)
        const sizeDiffH = Math.abs(savedSize.height - physicalHeight)

        if (sizeDiffW > 5 || sizeDiffH > 5) {
          console.warn(`⚠️ 图片尺寸可能不准确！实际: ${savedSize.width}x${savedSize.height}, 期望物理尺寸: ${physicalWidth}x${physicalHeight}`)
        } else {
          console.log(`✅ 图片尺寸验证通过（考虑缩放因素）`)
        }
      } catch (metadataError) {
        console.warn(`⚠️ 无法读取图片元数据:`, metadataError)
      }
      
      // 添加到队列
      this.addToQueue(filepath)
      
      const activeWindow = this.getActiveWindow()
      if (activeWindow) {
        console.log("📤 发送screenshot-taken事件到前端...")
        const preview = await this.getImagePreview(filepath)
        activeWindow.webContents.send("screenshot-taken", {
          path: filepath,
          preview: preview,
          type: "partial",
          timestamp: Date.now()
        })
        console.log("✅ IPC事件已发送")
      } else {
        console.warn("⚠️ mainWindow不可用，无法发送IPC事件")
      }
      
      // 保存resolve函数在清理前
      const resolveFunction = this.partialScreenshotResolve
      
      // 清理并返回结果
      this.cleanupSelection()
      
      console.log("🎉 准备resolve Promise...")
      if (resolveFunction) {
        resolveFunction(filepath)
        console.log("✅ Promise已resolve，路径:", filepath)
      } else {
        console.error("❌ resolveFunction 为空")
      }
      
    } catch (error) {
      console.error("❌ 截取选定区域失败:", error)
      this.cleanupSelection()
      if (this.partialScreenshotReject) {
        this.partialScreenshotReject(new Error(`截图失败: ${error.message}`))
      }
    }
  }
  
  /**
   * Windows区域截图 - 使用PowerShell直接截取指定区域
   */
  private async takeWindowsRegionScreenshot(x: number, y: number, width: number, height: number, filepath: string): Promise<void> {
    // 将路径转换为PowerShell友好格式并正确转义
    const escapedPath = filepath.replace(/\\/g, '\\\\').replace(/'/g, "''")
    
    const powershellScript = `
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

$bounds = New-Object Drawing.Rectangle ${x}, ${y}, ${width}, ${height}
$bmp = New-Object Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [Drawing.Graphics]::FromImage($bmp)

$graphics.CopyFromScreen($bounds.Location, [Drawing.Point]::Empty, $bounds.Size)

$outputPath = '${escapedPath}'
$bmp.Save($outputPath, [Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bmp.Dispose()

Write-Host "Screenshot saved to: $outputPath"
`

    console.log("🖥️ 执行Windows区域截图命令...")
    console.log(`📝 截图路径: ${filepath}`)
    console.log(`📝 转义后路径: ${escapedPath}`)
    
    try {
      const result = await execFileAsync('powershell.exe', ['-Command', powershellScript], {
        windowsHide: true,
        windowsVerbatimArguments: true
      })
      
      console.log(`✅ Windows区域截图完成: ${filepath}`)
      if (result.stdout) {
        console.log(`📥 PowerShell输出: ${result.stdout}`)
      }
    } catch (error) {
      console.error(`❌ Windows区域截图失败:`, error)
      throw new Error(`Windows区域截图失败: ${error.message}`)
    }
  }

  /**
   * macOS区域截图 - 使用screencapture命令
   */
  private async takeMacRegionScreenshot(x: number, y: number, width: number, height: number, filepath: string): Promise<void> {
    console.log("🍎 执行macOS区域截图命令...")
    
    try {
      // macOS screencapture -R x,y,w,h filename
      await execFileAsync('screencapture', ['-R', `${x},${y},${width},${height}`, filepath])
      
      console.log(`✅ macOS区域截图完成: ${filepath}`)
    } catch (error) {
      console.error(`❌ macOS区域截图失败:`, error)
      throw new Error(`macOS区域截图失败: ${error.message}`)
    }
  }

  /**
   * Linux区域截图 - 使用import命令
   */
  private async takeLinuxRegionScreenshot(x: number, y: number, width: number, height: number, filepath: string): Promise<void> {
    console.log("🐧 执行Linux区域截图命令...")
    
    try {
      // Linux import -window root -crop WIDTHxHEIGHT+X+Y filename
      const cropString = `${width}x${height}+${x}+${y}`
      await execFileAsync('import', ['-window', 'root', '-crop', cropString, filepath])
      
      console.log(`✅ Linux区域截图完成: ${filepath}`)
    } catch (error) {
      console.error(`❌ Linux区域截图失败:`, error)
      throw new Error(`Linux区域截图失败: ${error.message}`)
    }
  }

  /**
   * 添加截图到队列
   */
  private addToQueue(filepath: string): void {
    if (this.view === "queue") {
      this.screenshotQueue.push(filepath)
      if (this.screenshotQueue.length > this.MAX_SCREENSHOTS) {
        const oldScreenshot = this.screenshotQueue.shift()
        if (oldScreenshot && fs.existsSync(oldScreenshot)) {
          fs.unlinkSync(oldScreenshot)
          console.log(`🗑️ 删除旧截图: ${oldScreenshot}`)
        }
      }
    } else {
      this.extraScreenshotQueue.push(filepath)
      if (this.extraScreenshotQueue.length > this.MAX_SCREENSHOTS) {
        const oldScreenshot = this.extraScreenshotQueue.shift()
        if (oldScreenshot && fs.existsSync(oldScreenshot)) {
          fs.unlinkSync(oldScreenshot)
          console.log(`🗑️ 删除旧额外截图: ${oldScreenshot}`)
        }
      }
    }
  }
  
  /**
   * 强制重置部分截图状态（公共方法）
   */
  public forceResetPartialScreenshot(): void {
    console.log("🔄 强制重置部分截图状态...")
    this.cleanupSelection()
  }

  /**
   * 测试鼠标钩子是否正常工作（调试用）
   */
  public async testMouseHook(): Promise<void> {
    console.log("🧪 开始测试鼠标钩子...")
    
    try {
      await this.setupNativeMouseHook()
      console.log("✅ 鼠标钩子测试启动成功，请尝试点击任意位置")
      
      // 10秒后自动停止测试
      setTimeout(() => {
        if (this.mouseHookProcess) {
          console.log("🛑 鼠标钩子测试结束")
          this.cleanupSelection()
        }
      }, 10000)
      
    } catch (error) {
      console.error("❌ 鼠标钩子测试失败:", error)
    }
  }

  /**
   * 清理两点选择相关的资源
   */
  private cleanupSelection(): void {
    console.log("🧹 清理两点选择资源...")
    
    
    this.isWaitingForPartialScreenshot = false
    this.selectionState = 'waiting'
    this.startPoint = null
    this.endPoint = null
    this.selectionDisplay = null
    this.partialScreenshotResolve = null
    this.partialScreenshotReject = null
    
    if (this.partialScreenshotTimeout) {
      clearTimeout(this.partialScreenshotTimeout)
      this.partialScreenshotTimeout = null
    }

    if (this.macOverlayCleanup) {
      this.macOverlayCleanup()
    }

    // 终止鼠标钩子进程
    if (this.mouseHookProcess) {
      try {
        // Windows上使用kill()方法，不需要指定信号
        if (process.platform === 'win32') {
          this.mouseHookProcess.kill()
        } else {
          this.mouseHookProcess.kill('SIGTERM')
        }
        this.mouseHookProcess = null
        console.log("✅ 鼠标钩子进程已终止")
      } catch (error) {
        console.warn("⚠️ 终止鼠标钩子进程失败:", error)
        // 强制设为null，防止状态卡住
        this.mouseHookProcess = null
      }
    }
    
    console.log("✅ 两点选择资源清理完成")
  }
  
  /**
   * 清理部分截图相关的资源 (兼容性方法)
   */
  private cleanup(): void {
    this.cleanupSelection()
  }
}
