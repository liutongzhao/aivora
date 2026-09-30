// PerformantAntiCapture.ts - 高性能反录屏保护模块
import { BrowserWindow, app } from 'electron'

export interface AntiCaptureOptions {
  enableContentProtection?: boolean
  enableFrameRateControl?: boolean
  enableVisibilityControl?: boolean
  enablePlatformSpecific?: boolean
  adaptiveMode?: boolean // 自适应模式，根据系统负载调整
}

function isIntelMac(): boolean {
  return process.platform === "darwin" && process.arch === "x64"
}

export class PerformantAntiCapture {
  private window: BrowserWindow
  private options: Required<AntiCaptureOptions>
  private dockHideTimer: NodeJS.Timeout | null = null
  private protectionLevel: 'high' | 'medium' | 'low' = 'high'
  private isApplying: boolean = false
  private lastApplyTime: number = 0
  private readonly APPLY_COOLDOWN = 200 // 200ms冷却时间
  
  // 性能监控
  private performanceMetrics = {
    frameDrops: 0,
    lastFrameTime: 0,
    avgFrameTime: 16.67 // 60fps baseline
  }

  constructor(window: BrowserWindow, options: AntiCaptureOptions = {}) {
    this.window = window
    this.options = {
      enableContentProtection: options.enableContentProtection ?? true,
      enableFrameRateControl: options.enableFrameRateControl ?? true,
      enableVisibilityControl: options.enableVisibilityControl ?? true,
      enablePlatformSpecific: options.enablePlatformSpecific ?? true,
      adaptiveMode: options.adaptiveMode ?? true
    }
    
    console.log('🛡️ 初始化高性能反录屏保护')
    this.initializeProtection()
  }

  /**
   * 初始化保护措施 - 使用分批应用避免性能峰值
   */
  private async initializeProtection(): Promise<void> {
    if (this.isApplying) return
    this.isApplying = true

    try {
      // 阶段1: 核心内容保护 (立即应用)
      if (this.options.enableContentProtection) {
        this.applyCoreContentProtection()
      }

      // 阶段2: 可见性控制 (延迟100ms)
      setTimeout(() => {
        if (this.options.enableVisibilityControl) {
          this.applyVisibilityControl()
        }
      }, 100)

      // 阶段3: 平台特定保护 (延迟200ms)
      setTimeout(() => {
        if (this.options.enablePlatformSpecific) {
          this.applyPlatformSpecificProtection()
        }
      }, 200)

      // 阶段4: 帧率控制 (延迟300ms，最后应用避免冲突)
      setTimeout(() => {
        if (this.options.enableFrameRateControl) {
          this.applyFrameRateControl()
        }
        this.isApplying = false
      }, 300)

      // 阶段5: 启动自适应监控 (延迟500ms)
      setTimeout(() => {
        if (this.options.adaptiveMode) {
          this.startAdaptiveMonitoring()
        }
      }, 500)

    } catch (error) {
      console.error('❌ 反录屏保护初始化失败:', error)
      this.isApplying = false
    }
  }

  /**
   * 核心内容保护 - 最重要的保护
   */
  private applyCoreContentProtection(): void {
    try {
      // 内容保护是最核心的，必须立即应用
      this.window.setContentProtection(true)
      console.log('✅ 核心内容保护已启用')
    } catch (error) {
      console.error('❌ 核心内容保护失败:', error)
    }
  }

  /**
   * 可见性控制 - 窗口层级和工作区设置
   */
  private applyVisibilityControl(): void {
    try {
      this.window.setAlwaysOnTop(
        true,
        isIntelMac() ? "floating" : "screen-saver",
        1
      )
      
      // 稍微延迟应用工作区设置
      setTimeout(() => {
        this.window.setVisibleOnAllWorkspaces(true, {
          visibleOnFullScreen: true
        })
      }, 50)
      
      console.log('✅ 可见性控制已启用')
    } catch (error) {
      console.error('❌ 可见性控制失败:', error)
    }
  }

  /**
   * 平台特定保护
   */
  private applyPlatformSpecificProtection(): void {
    try {
      if (process.platform === "darwin") {
        // macOS 特定保护措施 - 分批应用
        this.window.setHiddenInMissionControl(true)
        
        setTimeout(() => {
          this.window.setWindowButtonVisibility(false)
          this.window.setSkipTaskbar(true)
        }, 50)
        
        setTimeout(() => {
          this.window.setHasShadow(false)
          this.window.setBackgroundColor("#00000000")
        }, 100)

        if (isIntelMac()) {
          setTimeout(() => {
            this.window.setContentProtection(true)
            try {
              ;(this.window as any).setExcludedFromShownWindowsMenu?.(true)
            } catch (error) {
              console.warn('⚠️ Intel Mac 窗口菜单排除设置失败:', error)
            }
          }, 200)
        }
        
        // Dock隐藏最后执行。保留定时器，避免返回配置页时延迟任务继续生效。
        this.dockHideTimer = setTimeout(() => {
          this.dockHideTimer = null
          try {
            app.dock?.hide()
          } catch (dockError) {
            console.warn('⚠️ Dock隐藏失败:', dockError)
          }
        }, 150)
        
        console.log('✅ macOS特定保护已启用')
      } else if (process.platform === "win32") {
        // Windows 特定优化
        this.window.setSkipTaskbar(true)
        console.log('✅ Windows特定保护已启用')
      }
    } catch (error) {
      console.error('❌ 平台特定保护失败:', error)
    }
  }

  /**
   * 退出考试窗口时恢复 macOS Dock，并取消尚未执行的隐藏任务。
   */
  restoreDock(): void {
    if (this.dockHideTimer) {
      clearTimeout(this.dockHideTimer)
      this.dockHideTimer = null
    }

    if (process.platform === 'darwin') {
      try {
        app.dock?.show()
      } catch (dockError) {
        console.warn('⚠️ Dock恢复失败:', dockError)
      }
    }
  }

  /**
   * 智能帧率控制 - 根据系统性能动态调整
   */
  private applyFrameRateControl(): void {
    try {
      // 根据保护级别设置不同的帧率
      const frameRates = {
        high: 60,
        medium: 45,
        low: 30
      }
      
      const targetFrameRate = frameRates[this.protectionLevel]
      
      // 禁用背景节流 - 但要监控性能影响
      this.window.webContents.setBackgroundThrottling(false)
      
      // 设置帧率
      this.window.webContents.setFrameRate(targetFrameRate)
      
      console.log(`✅ 帧率控制已启用: ${targetFrameRate}fps (${this.protectionLevel}级别)`)
    } catch (error) {
      console.error('❌ 帧率控制失败:', error)
    }
  }

  /**
   * 启动自适应性能监控
   */
  private startAdaptiveMonitoring(): void {
    if (!this.options.adaptiveMode) return

    console.log('🔄 启动自适应性能监控')
    
    // 每5秒检查一次性能状态
    const monitorInterval = setInterval(() => {
      this.checkPerformanceAndAdapt()
    }, 5000)

    // 清理监控器
    this.window.on('closed', () => {
      clearInterval(monitorInterval)
    })
  }

  /**
   * 性能检查和自适应调整
   */
  private checkPerformanceAndAdapt(): void {
    try {
      // 获取窗口性能指标
      const webContents = this.window.webContents
      
      // 检查是否有明显的性能问题迹象
      const currentTime = Date.now()
      const memoryUsage = process.memoryUsage()
      
      // 根据内存使用情况调整保护级别
      const memoryMB = memoryUsage.heapUsed / 1024 / 1024
      
      let newProtectionLevel: 'high' | 'medium' | 'low' = 'high'
      
      if (memoryMB > 500) {
        newProtectionLevel = 'low'
      } else if (memoryMB > 300) {
        newProtectionLevel = 'medium'
      }
      
      // 如果保护级别需要调整
      if (newProtectionLevel !== this.protectionLevel) {
        console.log(`🔄 自适应调整: ${this.protectionLevel} -> ${newProtectionLevel} (内存: ${memoryMB.toFixed(1)}MB)`)
        this.protectionLevel = newProtectionLevel
        this.adaptProtectionLevel()
      }
      
    } catch (error) {
      console.warn('⚠️ 性能监控出错:', error)
    }
  }

  /**
   * 根据保护级别调整设置
   */
  private adaptProtectionLevel(): void {
    const now = Date.now()
    if (now - this.lastApplyTime < this.APPLY_COOLDOWN) {
      return // 防止过于频繁的调整
    }
    this.lastApplyTime = now

    try {
      // 根据保护级别调整帧率
      const frameRates = {
        high: 60,
        medium: 45,
        low: 30
      }
      
      this.window.webContents.setFrameRate(frameRates[this.protectionLevel])
      
      // 低性能模式下，临时降低一些非关键保护
      if (this.protectionLevel === 'low') {
        // 保持核心内容保护，但降低其他开销
        console.log('⚡ 低性能模式: 保持核心保护，降低辅助开销')
      }
      
    } catch (error) {
      console.error('❌ 保护级别调整失败:', error)
    }
  }

  /**
   * 手动调整保护级别
   */
  public setProtectionLevel(level: 'high' | 'medium' | 'low'): void {
    if (level !== this.protectionLevel) {
      console.log(`🎛️ 手动设置保护级别: ${level}`)
      this.protectionLevel = level
      this.adaptProtectionLevel()
    }
  }

  /**
   * 临时禁用某些保护措施（比如在截图时）
   */
  public temporaryReduce(duration: number = 1000): void {
    const originalLevel = this.protectionLevel
    console.log('🔄 临时降低保护级别')
    
    this.setProtectionLevel('low')
    
    setTimeout(() => {
      console.log('🔄 恢复原保护级别')
      this.setProtectionLevel(originalLevel)
    }, duration)
  }

  /**
   * 获取当前保护状态
   */
  public getStatus(): {
    level: string
    contentProtection: boolean
    frameRate: number
    memoryUsage: number
  } {
    const memoryMB = process.memoryUsage().heapUsed / 1024 / 1024
    
    return {
      level: this.protectionLevel,
      contentProtection: this.options.enableContentProtection,
      frameRate: this.protectionLevel === 'high' ? 60 : this.protectionLevel === 'medium' ? 45 : 30,
      memoryUsage: Math.round(memoryMB * 100) / 100
    }
  }

  /**
   * 清理资源
   */
  public dispose(): void {
    console.log('🧹 清理反录屏保护资源')
    // 这里可以添加清理逻辑
  }
}
