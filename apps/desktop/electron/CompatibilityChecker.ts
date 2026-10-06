// CompatibilityChecker.ts - 兼容性检测核心模块

import { app, screen, globalShortcut, systemPreferences, shell, net, session } from 'electron'
import { execFile, exec, spawn } from 'child_process'
import { promisify } from 'util'
import os from 'os'
import fs from 'fs'
import path from 'path'
import screenshot from 'screenshot-desktop'

const execAsync = promisify(exec)
const execFileAsync = promisify(execFile)

export interface CompatibilityResult {
  category: 'shortcuts' | 'permissions' | 'security' | 'system'
  name: string
  status: 'pass' | 'warning' | 'fail' | 'checking'
  message: string
  details?: string
  solution?: string
}

export interface CompatibilityReport {
  overall: 'pass' | 'warning' | 'fail'
  results: CompatibilityResult[]
  timestamp: number
  systemInfo: {
    platform: string
    version: string
    arch: string
    electronVersion: string
  }
}

export class CompatibilityChecker {
  private results: CompatibilityResult[] = []
  private onProgress?: (result: CompatibilityResult) => void
  private shortcutsHelper?: any // ShortcutsHelper实例

  constructor(onProgress?: (result: CompatibilityResult) => void, shortcutsHelper?: any) {
    this.onProgress = onProgress
    this.shortcutsHelper = shortcutsHelper
  }

  // 执行完整的兼容性检测
  async runFullCheck(): Promise<CompatibilityReport> {
    console.log('🔍 开始执行兼容性检测...')
    this.results = []

    try {
      // 系统基础检测
      await this.checkSystemCompatibility()
      
      // 快捷键检测
      await this.checkShortcutCompatibility()
      
      // 权限检测
      await this.checkPermissions()
      
      // 安全软件检测
      await this.checkSecuritySoftware()
      
      // 网络连接检测
      await this.checkNetworkConnectivity()

    } catch (error) {
      console.error('兼容性检测过程中出现错误:', error)
      this.addResult({
        category: 'system',
        name: '检测过程',
        status: 'fail',
        message: '检测过程中出现未知错误',
        details: error instanceof Error ? error.message : String(error)
      })
    }

    const overall = this.calculateOverallStatus()
    
    return {
      overall,
      results: this.results,
      timestamp: Date.now(),
      systemInfo: {
        platform: process.platform,
        version: os.release(),
        arch: process.arch,
        electronVersion: process.versions.electron
      }
    }
  }

  // 系统基础兼容性检测
  private async checkSystemCompatibility(): Promise<void> {
    console.log('🖥️ 检测系统兼容性...')

    // 检测操作系统版本
    await this.checkOSVersion()
    
    // 检测内存
    await this.checkMemory()
    
    // 检测屏幕分辨率
    await this.checkScreenResolution()
    
    // 检测截图功能
    await this.checkScreenshotCapability()
  }

  // 操作系统版本检测
  private async checkOSVersion(): Promise<void> {
    const platform = process.platform
    const version = os.release()
    
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = '操作系统版本支持'
    let solution = ''

    try {
      if (platform === 'win32') {
        // Windows 版本检测
        const majorVersion = parseInt(version.split('.')[0])
        if (majorVersion < 10) {
          status = 'fail'
          message = `Windows ${majorVersion} 不受支持，需要 Windows 10 或更高版本`
          solution = '请升级到 Windows 10 或 Windows 11'
        } else if (majorVersion === 10) {
          const buildNumber = parseInt(version.split('.')[2])
          if (buildNumber < 17763) {
            status = 'warning'
            message = 'Windows 10 版本较旧，建议更新'
            solution = '建议更新到 Windows 10 1809 或更高版本'
          }
        }
      } else if (platform === 'darwin') {
        // macOS 版本检测
        const majorVersion = parseInt(version.split('.')[0])
        if (majorVersion < 17) { // macOS 10.13
          status = 'fail'
          message = 'macOS 版本过低，需要 macOS 10.13 或更高版本'
          solution = '请升级到 macOS 10.13 或更高版本'
        }
      } else if (platform === 'linux') {
        // Linux 基础检测
        try {
          const { stdout } = await execAsync('lsb_release -r')
          const ubuntuVersion = parseFloat(stdout.split('\t')[1])
          if (ubuntuVersion < 18.04) {
            status = 'warning'
            message = 'Linux 发行版版本较旧'
            solution = '建议使用 Ubuntu 18.04 或更新版本'
          }
        } catch {
          status = 'warning'
          message = '无法检测 Linux 版本，可能存在兼容性问题'
        }
      }
    } catch (error) {
      status = 'warning'
      message = '无法完全检测操作系统兼容性'
    }

    this.addResult({
      category: 'system',
      name: '操作系统版本',
      status,
      message,
      details: `${platform} ${version}`,
      solution
    })
  }

  // 内存检测
  private async checkMemory(): Promise<void> {
    const totalMem = os.totalmem()
    const freeMem = os.freemem()
    const totalGB = Math.round(totalMem / (1024 * 1024 * 1024))
    const freeGB = Math.round(freeMem / (1024 * 1024 * 1024))

    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = `内存充足 (${totalGB}GB 总计, ${freeGB}GB 可用)`
    let solution = ''

    if (totalGB < 4) {
      status = 'fail'
      message = `内存不足 (${totalGB}GB)，应用可能无法正常运行`
      solution = '建议至少 4GB 内存'
    } else if (freeGB < 1) {
      status = 'warning'
      message = `可用内存较少 (${freeGB}GB)，可能影响性能`
      solution = '关闭一些不必要的程序以释放内存'
    }

    this.addResult({
      category: 'system',
      name: '内存检测',
      status,
      message,
      details: `总计: ${totalGB}GB, 可用: ${freeGB}GB`,
      solution
    })
  }

  // 屏幕分辨率检测
  private async checkScreenResolution(): Promise<void> {
    try {
      const displays = screen.getAllDisplays()
      const primaryDisplay = screen.getPrimaryDisplay()
      const { width, height } = primaryDisplay.workAreaSize

      let status: 'pass' | 'warning' | 'fail' = 'pass'
      let message = `屏幕分辨率正常 (${width}x${height})`
      let solution = ''

      if (width < 1280 || height < 720) {
        status = 'warning'
        message = `屏幕分辨率较低 (${width}x${height})，可能影响界面显示`
        solution = '建议使用至少 1280x720 分辨率'
      }

      this.addResult({
        category: 'system',
        name: '屏幕分辨率',
        status,
        message,
        details: `主显示器: ${width}x${height}, 总显示器数: ${displays.length}`,
        solution
      })
    } catch (error) {
      this.addResult({
        category: 'system',
        name: '屏幕分辨率',
        status: 'warning',
        message: '无法检测屏幕信息',
        details: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // 截图功能检测
  private async checkScreenshotCapability(): Promise<void> {
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = '截图功能正常'
    let solution = ''

    try {
      // 尝试获取截图列表（不实际截图，避免权限弹窗）
      const displays = await screenshot.listDisplays()
      
      if (!displays || displays.length === 0) {
        status = 'fail'
        message = '无法检测到可用的显示器'
        solution = '检查显示器连接和驱动程序'
      } else {
        message = `检测到 ${displays.length} 个显示器，截图功能应该正常`
      }
    } catch (error) {
      status = 'fail'
      message = '截图功能不可用'
      solution = '检查屏幕录制权限或安装相关驱动程序'
    }

    this.addResult({
      category: 'permissions',
      name: '截图功能',
      status,
      message,
      solution
    })
  }

  // 快捷键兼容性检测
  private async checkShortcutCompatibility(): Promise<void> {
    console.log('⌨️ 检测快捷键兼容性...')
    console.log('🔄 开始快捷键检测，暂时清除现有注册...')

    // 保存当前注册状态，稍后恢复
    const wasRegistered = globalShortcut.isRegistered('CommandOrControl+Shift+H')
    console.log(`📋 应用快捷键当前状态: ${wasRegistered ? '已注册' : '未注册'}`)

    // 测试所有项目中使用的快捷键
    const testShortcuts = [
      // 基础功能快捷键
      { keys: 'CommandOrControl+Shift+H', name: '截图' },
      { keys: 'CommandOrControl+B', name: '切换窗口可见性' },
      { keys: 'CommandOrControl+Q', name: '退出应用' },
      { keys: 'CommandOrControl+R', name: '重置/刷新' },
      { keys: 'CommandOrControl+D', name: '删除最后截图' },
      { keys: 'CommandOrControl+J', name: '复制代码' },
      { keys: 'CommandOrControl+L', name: '切换原始输出视图' },
      
      // AI处理快捷键
      { keys: 'CommandOrControl+Enter', name: '编程题处理' },
      { keys: 'CommandOrControl+Shift+M', name: '单选题处理' },
      { keys: 'CommandOrControl+Shift+,', name: '单选题处理(备用)' },
      { keys: 'CommandOrControl+Shift+Enter', name: '多选题处理' },
      { keys: 'CommandOrControl+.', name: '通用搜题' },
      { keys: 'CommandOrControl+Shift+D', name: '调试题' },
      { keys: 'CommandOrControl+Shift+S', name: '部分截图' },
      
      // 窗口移动快捷键
      { keys: 'CommandOrControl+Left', name: '窗口左移' },
      { keys: 'CommandOrControl+Right', name: '窗口右移' },
      { keys: 'CommandOrControl+Up', name: '窗口上移' },
      { keys: 'CommandOrControl+Down', name: '窗口下移' },
      
      // 透明度调整快捷键
      { keys: 'CommandOrControl+[', name: '降低透明度' },
      { keys: 'CommandOrControl+]', name: '提高透明度' },
      { keys: 'CommandOrControl+Shift+1', name: '降低透明度(备用)' },
      { keys: 'CommandOrControl+Shift+2', name: '提高透明度(备用)' },
      
      // 缩放快捷键
      { keys: 'CommandOrControl+-', name: '缩小' },
      { keys: 'CommandOrControl+0', name: '重置缩放' },
      { keys: 'CommandOrControl+=', name: '放大' },
      
      // 高级功能快捷键
      { keys: 'CommandOrControl+Shift+R', name: '紧急窗口恢复' },
      { keys: 'CommandOrControl+Shift+C', name: '手动配置刷新' },
      { keys: 'CommandOrControl+Shift+Left', name: '代码左滚动' },
      { keys: 'CommandOrControl+Shift+Right', name: '代码右滚动' },
      { keys: 'CommandOrControl+Shift+Up', name: '代码上滚动' },
      { keys: 'CommandOrControl+Shift+Down', name: '代码下滚动' },
      { keys: 'CommandOrControl+Shift+5', name: '减小解决方案高度' },
      { keys: 'CommandOrControl+Shift+6', name: '增大解决方案高度' },
      { keys: 'CommandOrControl+Shift+3', name: '减小窗口宽度' },
      { keys: 'CommandOrControl+Shift+4', name: '增加窗口宽度' }
    ]

    // 如果应用快捷键已注册，先临时清除以避免冲突
    if (wasRegistered) {
      console.log('🧹 临时清除应用快捷键以进行检测...')
      globalShortcut.unregisterAll()
    }

    // 执行快捷键测试
    for (const shortcut of testShortcuts) {
      await this.testShortcut(shortcut.keys, shortcut.name)
    }

    // 检测全局快捷键冲突
    await this.checkShortcutConflicts()

    // 检测完成后，恢复应用的正常快捷键注册
    if (wasRegistered) {
      console.log('🔄 快捷键检测完成，恢复应用正常快捷键...')
      this.restoreApplicationShortcuts()
    }
  }

  // 测试单个快捷键
  private async testShortcut(keys: string, name: string): Promise<void> {
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = `快捷键 ${keys} 可正常注册`
    let solution = ''

    try {
      // 尝试注册快捷键
      const success = globalShortcut.register(keys, () => {
        // 测试回调，不执行实际操作
      })

      if (!success) {
        status = 'warning'
        message = `快捷键 ${keys} 可能被其他应用占用`
        solution = '关闭可能冲突的应用或更改快捷键设置'
      }

      // 立即取消注册测试快捷键
      globalShortcut.unregister(keys)

    } catch (error) {
      status = 'fail'
      message = `快捷键 ${keys} 注册失败`
      solution = '检查系统快捷键设置或重启应用'
    }

    this.addResult({
      category: 'shortcuts',
      name: `${name} (${keys})`,
      status,
      message,
      solution
    })
  }

  // 检测快捷键冲突
  private async checkShortcutConflicts(): Promise<void> {
    let conflictApps: string[] = []
    
    try {
      if (process.platform === 'win32') {
        // Windows: 检测常见冲突应用
        const processes = await execAsync('tasklist /fo csv')
        const commonConflictApps = [
          'Discord.exe',
          'Skype.exe', 
          'TeamViewer.exe',
          'AnyDesk.exe',
          'Steam.exe'
        ]
        
        for (const app of commonConflictApps) {
          if (processes.stdout.includes(app)) {
            conflictApps.push(app.replace('.exe', ''))
          }
        }
      } else if (process.platform === 'darwin') {
        // macOS: 检测运行的应用
        try {
          const { stdout } = await execAsync('ps aux | grep -E "(Discord|Skype|TeamViewer|Steam)" | grep -v grep')
          const lines = stdout.split('\n').filter(line => line.trim())
          conflictApps = lines.map(line => {
            const parts = line.split(/\s+/)
            return parts[parts.length - 1].split('/').pop() || ''
          }).filter(app => app)
        } catch {
          // 忽略检测错误
        }
      }
    } catch (error) {
      console.log('快捷键冲突检测失败:', error)
    }

    let status: 'pass' | 'warning' = 'pass'
    let message = '未检测到明显的快捷键冲突'
    let solution = ''

    if (conflictApps.length > 0) {
      status = 'warning'
      message = `检测到可能冲突的应用: ${conflictApps.join(', ')}`
      solution = '如果快捷键不工作，请尝试关闭这些应用'
    }

    this.addResult({
      category: 'shortcuts',
      name: '快捷键冲突检测',
      status,
      message,
      solution
    })
  }

  // 权限检测
  private async checkPermissions(): Promise<void> {
    console.log('🔐 检测系统权限...')

    // 检测辅助功能权限 (macOS)
    if (process.platform === 'darwin') {
      await this.checkAccessibilityPermission()
      await this.checkScreenRecordingPermission()
    }

    // 检测文件系统权限
    await this.checkFileSystemPermissions()

    // 检测网络权限
    await this.checkNetworkPermissions()
  }

  // 检测辅助功能权限 (macOS)
  private async checkAccessibilityPermission(): Promise<void> {
    try {
      const trusted = systemPreferences.isTrustedAccessibilityClient(false)
      
      this.addResult({
        category: 'permissions',
        name: 'macOS 辅助功能权限',
        status: trusted ? 'pass' : 'fail',
        message: trusted ? '辅助功能权限已授予' : '需要辅助功能权限才能正常工作',
        solution: trusted ? '' : '前往系统偏好设置 > 安全性与隐私 > 隐私 > 辅助功能，添加本应用'
      })
    } catch (error) {
      this.addResult({
        category: 'permissions',
        name: 'macOS 辅助功能权限',
        status: 'warning',
        message: '无法检测辅助功能权限状态'
      })
    }
  }

  // 检测屏幕录制权限 (macOS)
  private async checkScreenRecordingPermission(): Promise<void> {
    try {
      // 在 macOS 上，我们无法直接检测屏幕录制权限
      // 但可以通过系统偏好设置检查
      const mediaAccess = systemPreferences.getMediaAccessStatus('screen')
      
      let status: 'pass' | 'warning' | 'fail' = 'pass'
      let message = '屏幕录制权限正常'
      let solution = ''

      if (mediaAccess === 'denied') {
        status = 'fail'
        message = '屏幕录制权限被拒绝'
        solution = '前往系统偏好设置 > 安全性与隐私 > 隐私 > 屏幕录制，添加本应用'
      } else if (mediaAccess === 'not-determined') {
        status = 'warning'
        message = '屏幕录制权限未确定，首次截图时会请求权限'
        solution = '首次使用截图功能时请允许权限请求'
      }

      this.addResult({
        category: 'permissions',
        name: 'macOS 屏幕录制权限',
        status,
        message,
        solution
      })
    } catch (error) {
      this.addResult({
        category: 'permissions',
        name: 'macOS 屏幕录制权限',
        status: 'warning',
        message: '无法检测屏幕录制权限状态'
      })
    }
  }

  // 检测文件系统权限
  private async checkFileSystemPermissions(): Promise<void> {
    const testDir = path.join(app.getPath('userData'), 'permission-test')
    
    try {
      // 测试创建目录
      if (!fs.existsSync(testDir)) {
        fs.mkdirSync(testDir, { recursive: true })
      }

      // 测试写入文件
      const testFile = path.join(testDir, 'test.txt')
      fs.writeFileSync(testFile, 'test')
      
      // 测试读取文件
      const content = fs.readFileSync(testFile, 'utf8')
      
      // 清理测试文件
      fs.unlinkSync(testFile)
      fs.rmdirSync(testDir)

      this.addResult({
        category: 'permissions',
        name: '文件系统权限',
        status: 'pass',
        message: '文件系统读写权限正常'
      })
    } catch (error) {
      this.addResult({
        category: 'permissions',
        name: '文件系统权限',
        status: 'fail',
        message: '文件系统权限不足',
        details: error instanceof Error ? error.message : String(error),
        solution: '检查应用安装目录权限或以管理员身份运行'
      })
    }
  }

  // 检测网络权限
  private async checkNetworkPermissions(): Promise<void> {
    try {
      // 测试网络连接能力
      const request = net.request('https://www.google.com')
      
      const result = await new Promise<boolean>((resolve) => {
        const timeout = setTimeout(() => resolve(false), 5000)
        
        request.on('response', (response) => {
          clearTimeout(timeout)
          resolve(response.statusCode === 200)
        })
        
        request.on('error', () => {
          clearTimeout(timeout)
          resolve(false)
        })
        
        request.end()
      })

      this.addResult({
        category: 'permissions',
        name: '网络访问权限',
        status: result ? 'pass' : 'warning',
        message: result ? '网络访问正常' : '网络访问可能受限',
        solution: result ? '' : '检查防火墙设置和网络连接'
      })
    } catch (error) {
      this.addResult({
        category: 'permissions',
        name: '网络访问权限',
        status: 'warning',
        message: '无法测试网络权限',
        solution: '检查网络连接和防火墙设置'
      })
    }
  }

  // 安全软件检测
  private async checkSecuritySoftware(): Promise<void> {
    console.log('🛡️ 检测安全软件...')

    await this.checkFirewall()
    await this.checkAntivirus()
    await this.checkWindowsDefender()
  }

  // 防火墙检测
  private async checkFirewall(): Promise<void> {
    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = '防火墙状态正常'
    let solution = ''

    try {
      if (process.platform === 'win32') {
        // Windows 防火墙检测
        const { stdout } = await execAsync('netsh advfirewall show allprofiles state')
        
        if (stdout.includes('ON') || stdout.includes('已启用')) {
          status = 'warning'
          message = 'Windows 防火墙已启用，可能阻止网络连接'
          solution = '如果遇到网络问题，请在防火墙中添加应用例外'
        }
      } else if (process.platform === 'darwin') {
        // macOS 防火墙检测
        try {
          const { stdout } = await execAsync('sudo /usr/libexec/ApplicationFirewall/socketfilterfw --getglobalstate')
          if (stdout.includes('enabled')) {
            status = 'warning'
            message = 'macOS 防火墙已启用'
            solution = '如果遇到网络问题，请在系统偏好设置中添加应用例外'
          }
        } catch {
          // 无 sudo 权限时忽略
          message = '无法检测 macOS 防火墙状态'
        }
      } else if (process.platform === 'linux') {
        // Linux 防火墙检测 (ufw)
        try {
          const { stdout } = await execAsync('ufw status')
          if (stdout.includes('active')) {
            status = 'warning'
            message = 'UFW 防火墙已启用'
            solution = '如果遇到网络问题，请使用 ufw allow 添加例外'
          }
        } catch {
          // ufw 未安装或无权限
        }
      }
    } catch (error) {
      status = 'warning'
      message = '无法检测防火墙状态'
    }

    this.addResult({
      category: 'security',
      name: '防火墙检测',
      status,
      message,
      solution
    })
  }

  // 杀毒软件检测
  private async checkAntivirus(): Promise<void> {
    let detectedAV: string[] = []

    try {
      if (process.platform === 'win32') {
        // Windows 杀毒软件检测
        const processes = await execAsync('tasklist /fo csv')
        const commonAV = [
          { process: 'McShield.exe', name: 'McAfee' },
          { process: 'avp.exe', name: 'Kaspersky' },
          { process: 'avgnt.exe', name: 'Avira' },
          { process: 'avguard.exe', name: 'Avira' },
          { process: 'bdagent.exe', name: 'Bitdefender' },
          { process: 'AvastSvc.exe', name: 'Avast' },
          { process: 'mbamservice.exe', name: 'Malwarebytes' },
          { process: '360safe.exe', name: '360安全卫士' },
          { process: 'KSafeSvc.exe', name: '金山毒霸' },
          { process: 'QQPCTray.exe', name: '腾讯电脑管家' }
        ]

        for (const av of commonAV) {
          if (processes.stdout.includes(av.process)) {
            detectedAV.push(av.name)
          }
        }

        // 通过 WMI 检测杀毒软件
        try {
          const wmiResult = await execAsync('wmic /namespace:\\\\root\\SecurityCenter2 path AntiVirusProduct get displayName /value')
          const avNames = wmiResult.stdout.match(/displayName=(.+)/g)
          if (avNames) {
            avNames.forEach(match => {
              const name = match.replace('displayName=', '').trim()
              if (name && !detectedAV.includes(name)) {
                detectedAV.push(name)
              }
            })
          }
        } catch {
          // WMI 查询失败时忽略
        }
      }
    } catch (error) {
      console.log('杀毒软件检测失败:', error)
    }

    let status: 'pass' | 'warning' = 'pass'
    let message = '未检测到可能干扰的杀毒软件'
    let solution = ''

    if (detectedAV.length > 0) {
      status = 'warning'
      message = `检测到杀毒软件: ${detectedAV.join(', ')}`
      solution = '如果应用被误报，请将应用添加到杀毒软件的白名单中'
    }

    this.addResult({
      category: 'security',
      name: '杀毒软件检测',
      status,
      message,
      solution
    })
  }

  // Windows Defender 检测
  private async checkWindowsDefender(): Promise<void> {
    if (process.platform !== 'win32') {
      return
    }

    try {
      const { stdout } = await execAsync('powershell "Get-MpPreference | Select-Object -Property DisableRealtimeMonitoring"')
      
      let status: 'pass' | 'warning' = 'pass'
      let message = 'Windows Defender 状态正常'
      let solution = ''

      if (stdout.includes('False')) {
        status = 'warning'
        message = 'Windows Defender 实时保护已启用，可能影响应用性能'
        solution = '如果应用运行缓慢，可以考虑将应用目录添加到 Defender 排除列表'
      }

      this.addResult({
        category: 'security',
        name: 'Windows Defender',
        status,
        message,
        solution
      })
    } catch (error) {
      this.addResult({
        category: 'security',
        name: 'Windows Defender',
        status: 'warning',
        message: '无法检测 Windows Defender 状态'
      })
    }
  }

  // 网络连接检测
  private async checkNetworkConnectivity(): Promise<void> {
    console.log('🌐 检测网络连接...')

    // 测试基本网络连接
    await this.testBasicConnectivity()
    
    // 测试后端服务连接
    await this.testBackendConnectivity()
  }

  // 测试基本网络连接
  private async testBasicConnectivity(): Promise<void> {
    const testUrls = [
      'https://www.google.com',
      'https://www.baidu.com',
      'https://8.8.8.8'
    ]

    let successCount = 0
    const totalTests = testUrls.length

    for (const url of testUrls) {
      try {
        const request = net.request(url)
        const success = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 3000)
          
          request.on('response', () => {
            clearTimeout(timeout)
            resolve(true)
          })
          
          request.on('error', () => {
            clearTimeout(timeout)
            resolve(false)
          })
          
          request.end()
        })

        if (success) successCount++
      } catch {
        // 忽略单个测试失败
      }
    }

    let status: 'pass' | 'warning' | 'fail' = 'pass'
    let message = '网络连接正常'
    let solution = ''

    if (successCount === 0) {
      status = 'fail'
      message = '网络连接失败，无法访问外部网络'
      solution = '检查网络连接、代理设置和防火墙配置'
    } else if (successCount < totalTests) {
      status = 'warning'
      message = `网络连接部分正常 (${successCount}/${totalTests})`
      solution = '网络可能不稳定，建议检查网络设置'
    }

    this.addResult({
      category: 'system',
      name: '网络连接测试',
      status,
      message,
      solution
    })
  }

  // 测试后端服务连接
  private async testBackendConnectivity(): Promise<void> {
    // 这里应该测试应用的后端服务
    // 暂时使用本地端口测试
    const backendPorts = [3002, 3003] // 根据你的后端配置调整

    let connectedPorts = 0

    for (const port of backendPorts) {
      try {
        const result = await new Promise<boolean>((resolve) => {
          const timeout = setTimeout(() => resolve(false), 2000)
          
          try {
            const request = net.request(`http://localhost:${port}/health`)
            
            request.on('response', (response) => {
              clearTimeout(timeout)
              resolve(response.statusCode === 200)
            })
            
            request.on('error', () => {
              clearTimeout(timeout)
              resolve(false)
            })
            
            request.end()
          } catch {
            clearTimeout(timeout)
            resolve(false)
          }
        })

        if (result) connectedPorts++
      } catch {
        // 忽略连接失败
      }
    }

    let status: 'pass' | 'warning' | 'fail' = 'warning'
    let message = '后端服务未运行'
    let solution = '请确保后端服务已启动'

    if (connectedPorts > 0) {
      status = 'pass'
      message = `后端服务运行正常 (${connectedPorts}/${backendPorts.length} 个端口)`
      solution = ''
    }

    this.addResult({
      category: 'system',
      name: '后端服务连接',
      status,
      message,
      solution
    })
  }

  // 恢复应用的正常快捷键注册
  private restoreApplicationShortcuts(): void {
    try {
      console.log('🔄 开始恢复应用快捷键注册...')
      
      if (this.shortcutsHelper && typeof this.shortcutsHelper.registerGlobalShortcuts === 'function') {
        // 延迟一点时间确保之前的注册已清除
        setTimeout(() => {
          console.log('🎯 直接调用 ShortcutsHelper 重新注册快捷键...')
          this.shortcutsHelper.registerGlobalShortcuts()
          console.log('✅ 快捷键已重新注册')
          
          this.addResult({
            category: 'shortcuts',
            name: '快捷键恢复',
            status: 'pass',
            message: '快捷键已成功恢复注册'
          })
        }, 200)
      } else {
        console.warn('⚠️ ShortcutsHelper 不可用，无法自动恢复快捷键')
        
        this.addResult({
          category: 'shortcuts',
          name: '快捷键恢复',
          status: 'warning',
          message: '无法自动恢复快捷键，请重启应用',
          solution: '请重启应用以确保快捷键正常工作'
        })
      }
      
    } catch (error) {
      console.error('❌ 恢复快捷键失败:', error)
      
      this.addResult({
        category: 'shortcuts',
        name: '快捷键恢复',
        status: 'fail',
        message: '快捷键恢复失败',
        solution: '请重启应用以确保快捷键正常工作'
      })
    }
  }

  // 添加检测结果
  private addResult(result: CompatibilityResult): void {
    this.results.push(result)
    this.onProgress?.(result)
  }

  // 计算总体状态
  private calculateOverallStatus(): 'pass' | 'warning' | 'fail' {
    const failCount = this.results.filter(r => r.status === 'fail').length
    const warningCount = this.results.filter(r => r.status === 'warning').length

    if (failCount > 0) {
      return 'fail'
    } else if (warningCount > 0) {
      return 'warning'
    } else {
      return 'pass'
    }
  }

  // 生成兼容性报告
  generateReport(report: CompatibilityReport): string {
    let reportText = `兼容性检测报告 - ${new Date(report.timestamp).toLocaleString()}\n`
    reportText += `系统: ${report.systemInfo.platform} ${report.systemInfo.version} (${report.systemInfo.arch})\n`
    reportText += `Electron: ${report.systemInfo.electronVersion}\n`
    reportText += `总体状态: ${report.overall === 'pass' ? '✅ 通过' : report.overall === 'warning' ? '⚠️ 警告' : '❌ 失败'}\n\n`

    const categories = ['system', 'shortcuts', 'permissions', 'security']
    for (const category of categories) {
      const categoryResults = report.results.filter(r => r.category === category)
      if (categoryResults.length === 0) continue

      reportText += `${this.getCategoryName(category)}:\n`
      for (const result of categoryResults) {
        const statusIcon = result.status === 'pass' ? '✅' : result.status === 'warning' ? '⚠️' : '❌'
        reportText += `  ${statusIcon} ${result.name}: ${result.message}\n`
        if (result.solution) {
          reportText += `     解决方案: ${result.solution}\n`
        }
      }
      reportText += '\n'
    }

    return reportText
  }

  private getCategoryName(category: string): string {
    const names = {
      'system': '系统兼容性',
      'shortcuts': '快捷键',
      'permissions': '权限',
      'security': '安全软件'
    }
    return names[category as keyof typeof names] || category
  }
}
