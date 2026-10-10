// SimpleAuthManager.ts - Cursor式认证管理器
import { BrowserWindow, shell } from 'electron'
import { EventEmitter } from 'events'
import axios, { AxiosInstance } from 'axios'
import { configHelper } from './ConfigHelper'
import {Simulate} from "react-dom/test-utils";
import waiting = Simulate.waiting;
import configData from './runtimeConfig'
// 🆕 导入版本信息
const packageJson = require('../../package.json');
const configuredApiBaseUrl = configData.api?.baseUrl || 'http://127.0.0.1:18000'
const configuredWebBaseUrl = configData.web?.baseUrl || configuredApiBaseUrl

// Set UTF-8 encoding for console output in this module
if (process.stdout.setEncoding) {
  process.stdout.setEncoding('utf8')
}
if (process.stderr.setEncoding) {
  process.stderr.setEncoding('utf8')
}

interface User {
  id: string
  username: string
  email: string
  createdAt: string
}

interface UserConfig {
  aiModel: string
  programmingModel?: string  // 编程题模型
  multipleChoiceModel?: string  // 选择题模型
  universalModel?: string  // 通用搜题模型
  language: string
  theme: 'light' | 'dark' | 'system'
  selectedProvider?: string
  shortcuts: {
    takeScreenshot: string
    openQueue: string
    openSettings: string
  }
  display: {
    opacity: number
    position: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'
    autoHide: boolean
    hideDelay: number
  }
  processing: {
    autoProcess: boolean
    saveScreenshots: boolean
    compressionLevel: number
  }
}

/**
 * 简化的认证管理器 - 采用Cursor式设计
 * 核心原则：
 * 1. 单一认证源（统一token）
 * 2. 简单的状态管理（已登录/未登录）
 * 3. 直接的OAuth流程
 */
export class SimpleAuthManager extends EventEmitter {
  private token: string | null = null
  private user: User | null = null
  private userConfig: UserConfig | null = null
  private versionInfo: any | null = null // 🆕 存储版本信息
  private apiBaseUrl: string
  private apiClient: AxiosInstance
  // 配置缓存已移除，每次都从数据库实时读取
  private isAutoReloginInProgress: boolean = false // 防止并发自动重新登录


  constructor(apiBaseUrl?: string) {

    super()
    // 🆕 优先使用配置文件中的API URL
    this.apiBaseUrl = apiBaseUrl || configuredApiBaseUrl
    console.log('🌐 [SimpleAuthManager] 使用API地址:', this.apiBaseUrl)

    // 创建API客户端
    this.apiClient = axios.create({
      baseURL: this.apiBaseUrl,
      timeout: 10000,
      headers: {
        'Content-Type': 'application/json',
        // 🆕 添加客户端版本信息
        'X-Client-Version': packageJson.version,
        'X-Client-Type': 'electron',
        'X-Client-Name': packageJson.name,
        'X-Client-Platform': process.platform
      }
    })

    // 启动时加载本地token (异步操作，但不等待以避免阻塞构造函数)
    this.loadStoredToken().catch(error => 
      console.error('构造函数中加载token失败:', error)
    )
  }

  /**
   * 核心方法1：登录
   * 简单直接的OAuth流程（改进用户体验）
   */
  public async login(): Promise<boolean> {
    try {
      console.log('🔐 开始OAuth登录流程...')
      this.emit('login-progress', { step: 'starting', message: '正在启动登录...' })

      // 检查服务器连接
      this.emit('login-progress', { step: 'checking-server', message: '正在检查服务器连接...' })
      const serverOnline = await this.checkServerConnection()
      if (!serverOnline) {
        throw new Error('无法连接到服务器，请确保网络连接正常')
      }

      // 打开OAuth登录窗口
      this.emit('login-progress', { step: 'opening-browser', message: '正在打开登录页面...' })
      const token = await this.openOAuthWindow()
      console.log('🔑 OAuth窗口返回结果:', token ? `token长度${token.length}` : 'null')

      if (!token) {
        this.emit('login-cancelled')
        throw new Error('登录被取消')
      }

      // 保存token并获取用户信息
      this.emit('login-progress', { step: 'saving-token', message: '正在保存登录信息...' })
      console.log('🔑 开始保存token到内存和本地...')
      this.token = token
      console.log('🔑 Token已保存到内存')
      await this.saveToken(token)
      this.setupApiClient()
      console.log('🔑 API客户端已设置认证头')

      // 获取用户信息
      this.emit('login-progress', { step: 'fetching-user', message: '正在获取用户信息...' })
      await this.fetchUserInfo()

      // 获取用户配置
      this.emit('login-progress', { step: 'fetching-config', message: '正在同步用户配置...' })
      await this.fetchUserConfig()

      console.log(`✅ 登录成功: ${this.user?.username}`)
      this.emit('login-success', {
        user: this.user,
        message: `欢迎回来，${this.user?.username}！`
      })
      this.emit('authenticated', this.user)
      return true

    } catch (error: any) {
      const friendlyMessage = this.getFriendlyErrorMessage(error.message)
      console.error('❌ 登录失败:', friendlyMessage)
      this.clearAuthData()
      this.emit('login-error', {
        error: friendlyMessage,
        technical: error.message
      })
      this.emit('authentication-error', error)
      return false
    }
  }

  /**
   * 账号密码登录（增强认证）
   */
  public async loginWithCredentials(username: string, password: string): Promise<{ success: boolean; error?: string }> {
    console.log('🔐 开始账号密码登录...')

    const emailBody = { email: username, password }
    try {
      console.log('🔗 登录接口: /api/auth/login')
      const response = await this.apiClient.post('/api/auth/login', emailBody)
      const sessionId = response.data?.session_id

      if (!sessionId) {
        throw new Error(response.data?.error || '服务器未返回会话信息')
      }

      this.token = sessionId
      console.log('✅ 获取到会话凭证，保存中...')
      await this.saveToken(this.token)
      this.setupApiClient()

      if (response.data.version) {
        this.versionInfo = response.data.version
        console.log(`🏷️ 登录时获取版本信息: 当前${this.versionInfo.current} -> 最新${this.versionInfo.latest}`)
      }

      await this.fetchUserInfo()
      await this.fetchUserConfig()

      if (this.user) {
        this.emit('login-success', { user: this.user })
        this.emit('authenticated', this.user)
      }

      if (this.userConfig) {
        this.emit('config-synced', this.userConfig)
      }

      console.log('✅ 账号密码登录成功')
      return { success: true }
    } catch (error: any) {
      console.error('❌ 登录接口失败:', error)
      const detail = error.response?.data?.detail
      const serverMessage =
        (typeof detail === 'string' ? detail : detail?.message) ||
        error.response?.data?.error ||
        error.response?.data?.message
      const message = serverMessage || error.message || '登录失败'
      return { success: false, error: serverMessage || this.getFriendlyErrorMessage(message) }
    }
  }

  /**
   * 将技术错误转换为用户友好的消息
   */
  private getFriendlyErrorMessage(technicalError: string): string {
    if (technicalError.includes('服务器连接失败') || technicalError.includes('ECONNREFUSED')) {
      return '无法连接到服务器，请检查网络连接或稍后重试'
    }
    if (technicalError.includes('登录被取消')) {
      return '登录已取消'
    }
    if (technicalError.includes('token') || technicalError.includes('401')) {
      return '登录验证失败，请重新登录'
    }
    if (technicalError.includes('timeout') || technicalError.includes('超时')) {
      return '登录超时，请检查网络连接后重试'
    }
    if (technicalError.includes('用户信息') || technicalError.includes('配置')) {
      return '登录成功但获取用户信息失败，请重试'
    }

    // 默认友好消息
    return '登录失败，请稍后重试'
  }

  /**
   * 🆕 核心方法2：登出（适配增强认证）
   */
  public async logout(): Promise<void> {
    try {
      console.log('🚪 正在登出...')

      // 🆕 通知服务器登出（使用增强认证API）
      if (this.token) {
        try {
          await this.apiClient.post('/api/auth/logout')
        } catch (error) {
          console.warn('服务器登出请求失败，但继续本地登出')
        }
      }

      // 清除本地数据
      this.clearAuthData()

      console.log('✅ 登出成功')
      this.emit('logged-out')
    } catch (error) {
      console.error('❌ 登出失败:', error)
    }
  }

  /**
   * 核心方法3：检查认证状态
   * 增强逻辑：验证token并确保用户信息和配置都已加载
   */
  public async isAuthenticated(): Promise<boolean> {
    console.log('🔐 开始检查认证状态...')

    // 没有token，肯定未认证
    if (!this.token) {
      console.log('❌ 没有token，未认证')
      return false
    }

    console.log('✅ 找到token，开始验证...')

    // 有token，验证其有效性
    try {
      await this.verifyToken()
      console.log('✅ Token验证成功')

      // 确保用户信息已加载
      if (!this.user) {
        console.log('📋 Token有效但用户信息未加载，开始获取...')
        await this.fetchUserInfo()
      }

      // 确保用户配置已加载
      if (!this.userConfig) {
        console.log('📋 Token有效但用户配置未加载，开始获取...')
        await this.fetchUserConfig()
      }

      console.log('✅ 认证状态验证成功')
      return true
    } catch (error) {
      console.error('❌ Token验证失败:', error.message)
      
      // 会话明确过期时直接回到客户端登录页，不尝试静默或自动登录。
      if (error.message?.includes('已过期') || error.message?.includes('过期')) {
        console.log('❌ 会话已过期，清除认证数据并显示客户端登录页')
        this.clearAuthData()
      } else {
        console.log('⚠️ 可能是网络或服务器问题，保留认证数据等待重试')
      }
      
      return false
    }
  }

  /**
   * 获取当前用户
   */
  public getCurrentUser(): User | null {
    return this.user
  }

  /**
   * 获取当前token（sessionId）
   */
  public getToken(): string | null {
    return this.token
  }

  /**
   * 获取用户配置
   */
  public getUserConfig(): UserConfig | null {
    return this.userConfig
  }

  /**
   * 🆕 获取版本信息
   */
  public getVersionInfo(): any | null {
    return this.versionInfo
  }

  public async syncUserShortcuts(shortcuts: Record<string, string>): Promise<{ success: boolean; error?: string }> {
    if (!this.user || !this.token) {
      return { success: false, error: '用户未登录' }
    }

    try {
      await this.apiClient.post('/api/config/shortcuts', { shortcuts })
      return { success: true }
    } catch (error: any) {
      console.error('同步用户快捷键失败:', error)
      const serverMessage = error?.response?.data?.error || error?.response?.data?.message
      if (serverMessage) {
        return { success: false, error: serverMessage }
      }
      const message = this.getFriendlyErrorMessage(error?.message || '同步快捷键失败')
      return { success: false, error: message }
    }
  }

  /**
   * 🆕 自动重新登录机制
   * 当检测到登录态丢失时，尝试使用本地存储的凭据自动重新登录
   */
  public async attemptAutoRelogin(): Promise<boolean> {
    if (this.isAutoReloginInProgress) {
      console.log('⚠️ 自动重新登录已在进行中，跳过')
      return false
    }

    this.isAutoReloginInProgress = true

    try {
      console.log('🔄 开始尝试自动重新登录...')
      this.emit('auto-relogin-started')

      // 1. 首先尝试从共享会话文件重新加载
      console.log('📋 尝试从共享会话文件恢复...')
      await this.loadTokenFromSharedSession()
      
      if (this.token) {
        console.log('✅ 从共享会话文件找到token，验证有效性...')
        try {
          await this.verifyToken()
          console.log('✅ 共享会话token验证成功，自动重新登录完成')
          this.emit('auto-relogin-success', { method: 'shared-session', user: this.user })
          return true
        } catch (error) {
          console.log('❌ 共享会话token验证失败:', error.message)
          this.token = null
        }
      }

      // 2. 如果共享会话失败，尝试静默的OAuth重新登录
      console.log('🔄 共享会话恢复失败，尝试静默OAuth重新登录...')
      
      // 检查服务器连接
      const serverOnline = await this.checkServerConnection()
      if (!serverOnline) {
        console.log('❌ 服务器无法连接，自动重新登录失败')
        this.emit('auto-relogin-failed', { reason: 'server-offline' })
        return false
      }

      // 尝试静默登录（不显示登录窗口，直接使用可能存在的浏览器cookie）
      const silentLoginSuccess = await this.attemptSilentLogin()
      if (silentLoginSuccess) {
        console.log('✅ 静默登录成功，自动重新登录完成')
        this.emit('auto-relogin-success', { method: 'silent-login', user: this.user })
        return true
      }

      // 3. 自动方式失败时交给调用方显示客户端登录页，不弹出二次确认框。
      console.log('❌ 所有自动重新登录方法都失败，需要用户手动登录')
      this.emit('auto-relogin-failed', { reason: 'all-methods-failed' })
      return false

    } catch (error) {
      console.error('❌ 自动重新登录过程异常:', error)
      this.emit('auto-relogin-failed', { reason: 'exception', error: error.message })
      return false
    } finally {
      this.isAutoReloginInProgress = false
    }
  }

  /**
   * 🆕 尝试静默登录（不显示登录窗口）
   */
  private async attemptSilentLogin(): Promise<boolean> {
    try {
      console.log('🔄 尝试静默登录...')
      
      // 创建一个隐藏的浏览器窗口来检查是否有有效的浏览器session
      const { BrowserWindow } = require('electron')
      const hiddenWindow = new BrowserWindow({
        show: false,
        width: 1,
        height: 1,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      try {
        // 加载登录页面但不显示
        const loginUrl = `${this.apiBaseUrl}/login?mode=silent&client=electron`
        await hiddenWindow.loadURL(loginUrl)

        // 等待一段时间让页面加载和执行
        await new Promise(resolve => setTimeout(resolve, 3000))

        // 尝试获取sessionId
        const sessionId = await hiddenWindow.webContents.executeJavaScript(`
          localStorage.getItem('sessionId')
        `)

        if (sessionId && sessionId.length > 10) {
          console.log('✅ 静默登录获得sessionId，验证有效性...')
          
          // 验证sessionId
          const isValid = await this.quickValidateSessionId(sessionId)
          if (isValid) {
            this.token = sessionId
            await this.saveToken(sessionId)
            this.setupApiClient()
            await this.fetchUserInfo()
            await this.fetchUserConfig()
            
            hiddenWindow.close()
            return true
          }
        }

        hiddenWindow.close()
        return false

      } catch (error) {
        hiddenWindow.close()
        throw error
      }

    } catch (error) {
      console.log('❌ 静默登录失败:', error.message)
      return false
    }
  }

  /**
   * 刷新用户配置（每次都从数据库实时读取，不使用缓存）
   */
  public async refreshUserConfig(forceRefresh: boolean = false): Promise<UserConfig | null> {
    if (!this.token || !this.user) {
      console.log('❌ 无法刷新配置：缺少token或用户信息')
      return null
    }

    console.log('🔄 从数据库实时读取用户配置（无缓存）...')
    try {
      await this.fetchUserConfig()
      console.log('✅ 用户配置已从数据库刷新')
      console.log(`📋 最新配置详情: multipleChoiceModel=${this.userConfig?.multipleChoiceModel}, programmingModel=${this.userConfig?.programmingModel}, universalModel=${this.userConfig?.universalModel}`)
      return this.userConfig
    } catch (error) {
      console.error('❌ 从数据库读取用户配置失败:', error)
      return null
    }
  }

  /**
   * 🆕 获取用户配置（完全绕过缓存，专用于处理操作）
   */
  public async getFreshUserConfig(): Promise<UserConfig | null> {
    if (!this.token || !this.user) {
      console.log('❌ 无法获取新配置：缺少token或用户信息')
      return null
    }

    console.log('🔄 获取最新用户配置（绕过缓存）...')
    try {
      await this.fetchUserConfig()
      console.log('✅ 获取最新配置成功')
      console.log(`📋 最新配置详情: multipleChoiceModel=${this.userConfig?.multipleChoiceModel}, programmingModel=${this.userConfig?.programmingModel}, universalModel=${this.userConfig?.universalModel}, language=${this.userConfig?.language}`)
      return this.userConfig
    } catch (error) {
      console.error('❌ 获取最新用户配置失败:', error)
      // 如果获取失败但有现有配置，返回现有配置
      if (this.userConfig) {
        console.log('📋 获取最新配置失败，使用现有配置')
        return this.userConfig
      }
      return null
    }
  }

  /**
   * 检查服务器连接（兼容性方法）
   */
  public async checkConnection(): Promise<boolean> {
    return await this.checkServerConnection()
  }

  /**
   * 初始化认证（在应用启动时调用）
   */
  public async initializeAuth(): Promise<boolean> {
    console.log('🚀 初始化认证管理器...')

    try {
      // 1. 重新加载token（包括检查共享会话）
      await this.loadStoredToken()

      // 2. 如果有token，验证其有效性
      if (this.token) {
        const isValid = await this.isAuthenticated()
        if (isValid) {
          console.log('✅ 认证初始化成功')
          return true
        }
      }

      // 3. 如果本地没有有效token，尝试从后端检查共享会话
      console.log('🔍 本地无有效token，检查后端共享会话...')
      const hasWebSession = await this.checkWebSession()

      if (hasWebSession) {
        console.log('✅ 发现Web端会话，重新加载token')
        await this.loadStoredToken()
        return await this.isAuthenticated()
      }

      console.log('❌ 没有找到有效的认证会话')
      return false

    } catch (error) {
      console.error('❌ 认证初始化失败:', error)
      return false
    }
  }

  /**
   * 🆕 检查Web端会话状态（适配增强认证）
   */
  private async checkWebSession(): Promise<boolean> {
    try {
      // 🆕 增强认证没有专门的会话检查API，直接检查共享会话文件
      console.log('🔍 检查共享会话文件...')
      await this.loadTokenFromSharedSession()

      if (this.token) {
        console.log('✅ 从共享会话文件找到sessionId')
        return true
      } else {
        console.log('❌ 共享会话文件中没有sessionId')
        return false
      }
    } catch (error) {
      console.error('❌ 检查Web会话失败:', error)
      return false
    }
  }

  /**
   * 打开Web登录（兼容性方法）
   */
  public async openWebLogin(): Promise<void> {
    await this.login()
  }

  /**
   * 处理认证回调（兼容性方法）
   */
  public handleAuthCallback(url: string): void {
    // 这个方法在新的实现中不需要，因为我们在OAuth窗口中直接处理回调
    console.log('Auth callback received:', url)
    // 可以在这里添加额外的回调处理逻辑
  }

  // ==================== 私有方法 ====================

  /**
   * 加载本地存储的token
   */
  private async loadStoredToken(): Promise<void> {
    try {
      console.log('📋 尝试加载本地token...')

      // 1. 首先尝试从配置文件加载token
      const config = configHelper.loadConfig()
      console.log('📋 配置文件内容:', JSON.stringify(config, null, 2))

      if (config.authToken) {
        this.token = config.authToken
        this.setupApiClient()
        console.log('📋 已从配置文件加载token，长度:', this.token.length)
        console.log('📋 Token前缀:', this.token.substring(0, 20) + '...')
        return
      }

      console.log('📋 配置文件中没有authToken，尝试检查共享会话文件...')

      // 2. 如果配置文件没有token，尝试从shared-session.json加载
      await this.loadTokenFromSharedSession()

    } catch (error) {
      console.error('❌ 加载本地token失败:', error)
    }
  }

  /**
   * 从共享会话文件加载token
   */
  private async loadTokenFromSharedSession(): Promise<void> {
    try {
      const fs = require('fs')
      const path = require('path')

      // 🆕 修复路径问题：shared-session.json在项目根目录
      // 尝试多个可能的路径
      const possiblePaths = [
        path.join(process.cwd(), 'shared-session.json'),
        path.join(__dirname, '..', 'shared-session.json'),
        path.join(__dirname, '..', '..', 'shared-session.json'),
        path.join(process.resourcesPath || '', '..', 'shared-session.json')
      ]

      let sharedSessionPath: string | null = null
      for (const possiblePath of possiblePaths) {
        console.log('🔍 检查路径:', possiblePath)
        if (fs.existsSync(possiblePath)) {
          sharedSessionPath = possiblePath
          console.log('✅ 找到共享会话文件:', sharedSessionPath)
          break
        }
      }

      console.log('🔍 最终使用的共享会话文件路径:', sharedSessionPath)

      if (!sharedSessionPath) {
        console.log('📋 未找到共享会话文件')
        return
      }

      const sharedSessionData = fs.readFileSync(sharedSessionPath, 'utf8')
      const sharedSession = JSON.parse(sharedSessionData)
      console.log('📋 找到共享会话文件:', {
        user: sharedSession.user?.username,
        expiresAt: sharedSession.expiresAt
      })

      // 检查会话是否过期
      const now = new Date()
      const expiresAt = new Date(sharedSession.expiresAt)

      if (now > expiresAt) {
        console.log('⏰ 共享会话已过期，删除文件')
        fs.unlinkSync(sharedSessionPath)
        return
      }

      // 🆕 增强认证使用sessionId而不是accessToken
      if (sharedSession.sessionId) {
        this.token = sharedSession.sessionId
        this.user = sharedSession.user
        this.setupApiClient()

        // 将sessionId保存到本地配置以备下次使用
        await this.saveToken(this.token)

        console.log('✅ 从共享会话成功加载sessionId')
        console.log('👤 用户:', this.user?.username)
        console.log('📋 SessionId长度:', this.token.length)
        console.log('📋 SessionId前缀:', this.token.substring(0, 10) + '...')

        // 触发认证成功事件
        this.emit('authenticated', this.user)
      } else {
        console.log('❌ 共享会话文件中没有sessionId')
        // 🆕 为了兼容性，也检查旧的accessToken字段
        if (sharedSession.accessToken) {
          console.log('⚠️ 发现旧的accessToken，但增强认证需要sessionId')
        }
      }

    } catch (error) {
      console.error('❌ 从共享会话加载token失败:', error)
    }
  }

  /**
   * 保存token到本地 - 增强版本
   */
  private async saveToken(token: string): Promise<void> {
    try {
      console.log('💾 开始保存token到本地...')
      console.log('💾 Token长度:', token.length)
      console.log('💾 Token前缀:', token.substring(0, 20) + '...')

      // 多次尝试保存，确保成功
      let saveAttempts = 0;
      const maxAttempts = 3;
      
      while (saveAttempts < maxAttempts) {
        try {
          configHelper.updateConfig({ authToken: token })
          
          // 验证保存是否成功
          const savedConfig = configHelper.loadConfig()
          if (savedConfig.authToken === token) {
            console.log('✅ Token保存成功并验证')
            return; // 保存成功，退出
          } else {
            saveAttempts++;
            console.log(`❌ Token保存验证失败 (尝试 ${saveAttempts}/${maxAttempts})`)
            console.log('  - 期望:', token.substring(0, 20) + '...')
            console.log('  - 实际:', savedConfig.authToken ? savedConfig.authToken.substring(0, 20) + '...' : 'null')
            
            if (saveAttempts < maxAttempts) {
              await new Promise(resolve => setTimeout(resolve, 100)); // 等待100ms后重试
            }
          }
        } catch (saveError) {
          saveAttempts++;
          console.error(`❌ 保存token尝试 ${saveAttempts} 失败:`, saveError)
          if (saveAttempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 200)); // 等待200ms后重试
          }
        }
      }
      
      console.error('💥 Token保存最终失败，已用完所有重试次数')
    } catch (error) {
      console.error('❌ 保存token过程异常:', error)
    }
  }

  /**
   * 🆕 设置API客户端的认证头（适配增强认证）
   */
  private setupApiClient(): void {
    if (this.token) {
      // 🆕 增强认证使用X-Session-Id头而不是Authorization
      this.apiClient.defaults.headers.common['X-Session-Id'] = this.token
      delete this.apiClient.defaults.headers.common['Authorization'] // 清除传统认证头
    }
  }

  /**
   * 🆕 验证sessionId有效性（适配增强认证） - 增强容错版本
   */
  private async verifyToken(): Promise<void> {
    if (!this.token) {
      throw new Error('没有sessionId')
    }

    console.log('🔍 开始验证sessionId...')
    console.log('🔑 SessionId长度:', this.token.length)
    console.log('🔑 SessionId前缀:', this.token.substring(0, 10) + '...')
    console.log('🌐 API地址:', `${this.apiBaseUrl}/api/session_status`)

    let retryCount = 0;
    const maxRetries = 2;

    while (retryCount <= maxRetries) {
      try {
        const response = await this.apiClient.get('/api/session_status')
        console.log('📥 响应状态:', response.status)
        console.log('📥 响应数据:', response.data)

        if (response.data && response.data.success && response.data.user) {
          this.user = response.data.user
          // 🆕 在验证token时也保存版本信息
          if (response.data.version) {
            this.versionInfo = response.data.version
            console.log(`🏷️ [verifyToken] 保存版本信息: 当前${this.versionInfo.current} -> 最新${this.versionInfo.latest}, 需要更新: ${this.versionInfo.needsUpdate}`)
          } else {
            console.log(`⚠️ [verifyToken] 后端响应中没有版本信息`)
          }
          console.log('✅ SessionId验证成功')
          return; // 成功，直接返回
        } else {
          console.log('❌ 响应数据格式不正确:', response.data)
          throw new Error('SessionId验证失败 - 响应数据无效')
        }
      } catch (error: any) {
        retryCount++;
        console.log(`❌ SessionId验证失败 (尝试 ${retryCount}/${maxRetries + 1}):`)
        console.log('  - 错误类型:', error.constructor.name)
        console.log('  - 错误消息:', error.message)
        
        if (error.response) {
          console.log('  - 响应状态:', error.response.status)
          console.log('  - 响应数据:', error.response.data)

          // 只有明确的401认证错误才清除session，其他错误先重试
          if (error.response.status === 401) {
            const errorMessage = error.response.data?.message || '';
            const isSessionError = errorMessage.includes('session') || 
                                 errorMessage.includes('会话') || 
                                 errorMessage.includes('过期') ||
                                 errorMessage.includes('未登录');
            
            if (isSessionError) {
              throw new Error(`SessionId已过期: ${error.message}`)
            } else {
              console.log('⚠️ 401错误但不是会话问题，可能是网络或服务器问题')
            }
          }
          
          // 5xx服务器错误或网络错误，先重试
          if (error.response.status >= 500 && retryCount <= maxRetries) {
            console.log(`⚠️ 服务器错误 (${error.response.status})，等待重试...`)
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount))
            continue;
          }
        } else if (error.request) {
          console.log('  - 网络请求失败，无响应')
          if (retryCount <= maxRetries) {
            console.log('⚠️ 网络错误，等待重试...')
            await new Promise(resolve => setTimeout(resolve, 2000 * retryCount))
            continue;
          }
        }
        
        // 最后一次重试失败，或者是其他类型错误
        if (retryCount > maxRetries) {
          console.log('💥 重试次数已用完，session验证最终失败')
          throw new Error(`SessionId验证失败: ${error.message}`)
        }
      }
    }
  }

  /**
   * 🆕 增强认证不支持刷新，此方法已废弃
   */
  private async tryRefreshToken(): Promise<boolean> {
    console.log('🚫 增强认证不支持token刷新，需要重新登录')
    return false
  }

  /**
   * 🆕 获取用户信息（适配增强认证）
   */
  private async fetchUserInfo(): Promise<void> {
    const response = await this.apiClient.get('/api/session_status')
    if (response.data && response.data.success && response.data.user) {
      this.user = response.data.user
      // 🆕 保存版本信息
      if (response.data.version) {
        this.versionInfo = response.data.version
        console.log(`🏷️ 保存版本信息: 当前${this.versionInfo.current} -> 最新${this.versionInfo.latest}, 需要更新: ${this.versionInfo.needsUpdate}`)
      } else {
        console.log(`⚠️ 后端响应中没有版本信息:`, JSON.stringify(response.data, null, 2))
      }
      console.log(`📋 获取用户信息: ${this.user.username}`)
    } else {
      throw new Error('获取用户信息失败')
    }
  }

  /**
   * 获取用户配置（修复版本 - 使用正确的API路由）
   */
  private async fetchUserConfig(): Promise<void> {
    if (!this.user) {
      throw new Error('没有用户信息')
    }

    console.log('📋 正在从后端获取用户配置...')
    console.log('🌐 请求URL:', `${this.apiBaseUrl}/api/config`)

    try {
      // 使用简化的配置API路由
      const response = await this.apiClient.get('/api/config')

      console.log('📥 后端配置响应状态:', response.status)
      console.log('📥 后端返回的原始配置数据:', JSON.stringify(response.data, null, 2))

      if (response.data) {
        // 根据后端返回的数据结构适配，支持新的模型字段
        this.userConfig = {
          // 兼容新旧模型字段
          aiModel: response.data.aiModel || response.data.programmingModel || 'gpt-5-mini',
          programmingModel: response.data.programmingModel || response.data.aiModel || 'gpt-5-mini',
          multipleChoiceModel: response.data.multipleChoiceModel || response.data.aiModel || 'gemini-2.5-flash-preview-04-17',
          universalModel: response.data.universalModel || response.data.programmingModel || response.data.aiModel || 'gpt-5-mini',
          language: response.data.language || 'python',
          theme: response.data.theme || 'system',
          selectedProvider: response.data.selectedProvider || 'openai',
          shortcuts: response.data.shortcuts || {
            takeScreenshot: 'Ctrl+Shift+S',
            openQueue: 'Ctrl+Shift+Q',
            openSettings: 'Ctrl+Shift+,'
          },
          display: response.data.display || {
            opacity: response.data.opacity || 1.0,
            position: 'top-right',
            autoHide: false,
            hideDelay: 3000
          },
          processing: response.data.processing || {
            autoProcess: false,
            saveScreenshots: true,
            compressionLevel: 80
          }
        }

        console.log('✅ 用户配置构建成功:')
        console.log(`  - aiModel: ${this.userConfig.aiModel}`)
        console.log(`  - programmingModel: ${this.userConfig.programmingModel}`)
        console.log(`  - multipleChoiceModel: ${this.userConfig.multipleChoiceModel}`)
        console.log(`  - universalModel: ${this.userConfig.universalModel}`)
        console.log(`  - selectedProvider: ${this.userConfig.selectedProvider}`)
        console.log(`  - language: ${this.userConfig.language}`)
      } else {
        throw new Error('API返回空数据')
      }
    } catch (error: any) {
      console.error('❌ 获取用户配置失败:', error)

      // 如果配置获取失败，创建默认配置
      console.log('🔧 使用默认配置...')
      this.userConfig = {
        aiModel: 'gpt-5-mini',
        programmingModel: 'gpt-5-mini',
        multipleChoiceModel: 'gemini-2.5-flash-preview-04-17',
        universalModel: 'gpt-5-mini',
        language: 'python',
        theme: 'system',
        selectedProvider: 'openai',
        shortcuts: {
          takeScreenshot: 'Ctrl+Shift+S',
          openQueue: 'Ctrl+Shift+Q',
          openSettings: 'Ctrl+Shift+,'
        },
        display: {
          opacity: 1.0,
          position: 'top-right',
          autoHide: false,
          hideDelay: 3000
        },
        processing: {
          autoProcess: false,
          saveScreenshots: true,
          compressionLevel: 80
        }
      }

      console.log('✅ 已设置默认用户配置')
    }
  }

  /**
   * 打开OAuth登录窗口
   */
  private async openOAuthWindow(): Promise<string | null> {
    return new Promise((resolve, reject) => {
      // 创建登录窗口
      const authWindow = new BrowserWindow({
        width: 500,
        height: 700,
        show: true,
        modal: false, // 改为非模态，避免阻塞主窗口
        alwaysOnTop: true, // 保持在最前面
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true
        }
      })

      // 登录URL - 指向后端提供的登录页面
      const loginUrl = `${this.apiBaseUrl}/login?mode=oauth&client=electron`

      console.log('🌐 打开登录窗口:', loginUrl)
      authWindow.loadURL(loginUrl)

      // 设置超时处理（60秒 - 增加超时时间）
      const timeoutId = setTimeout(() => {
        if (!authWindow.isDestroyed()) {
          console.log('⏰ 登录超时，关闭窗口')
          authWindow.close()
          reject(new Error('登录超时，请重试'))
        }
      }, 60000)

      // 标记是否已经处理了登录结果
      let isHandled = false;

      // 🔧 只监听 did-navigate，避免重复触发
      const handleNavigation = (event: any, navigationUrl: string) => {
        if (!isHandled) {
          this.handleOAuthCallback(navigationUrl, authWindow, (token) => {
            isHandled = true;
            clearTimeout(timeoutId);
            resolve(token);
          }, (error) => {
            isHandled = true;
            clearTimeout(timeoutId);
            reject(error);
          });
        }
      }

      // 🔧 只使用 did-navigate，避免重复监听
      authWindow.webContents.on('did-navigate', handleNavigation)

      // 🔧 减少检查频率，增加验证逻辑（每2秒检查一次）
      const checkSessionInterval = setInterval(async () => {
        if (authWindow.isDestroyed() || isHandled) {
          clearInterval(checkSessionInterval)
          return
        }

        try {
          const sessionId = await authWindow.webContents.executeJavaScript(`
            localStorage.getItem('sessionId')
          `);

          if (sessionId && sessionId.length > 10) {
            console.log('🔍 定期检查发现sessionId，开始验证...')
            // 🔧 先验证sessionId再关闭窗口
            const isValid = await this.quickValidateSessionId(sessionId);

            if (isValid) {
              console.log('✅ 定期检查发现有效登录')
              clearInterval(checkSessionInterval)
              isHandled = true;
              if (timeoutId) clearTimeout(timeoutId)

              // 延迟关闭窗口，让用户看到成功页面
              setTimeout(() => {
                if (!authWindow.isDestroyed()) {
                  authWindow.close()
                }
                resolve(sessionId)
              }, 1500);
            } else {
              console.log('❌ 定期检查：sessionId验证失败，清除无效sessionId...')
              // 🔧 修复：清除localStorage中的无效sessionId
              try {
                await authWindow.webContents.executeJavaScript(`
                  localStorage.removeItem('sessionId');
                  localStorage.removeItem('sessionId_backup');
                  localStorage.removeItem('lastActivity');
                  console.log('🗑️ 已清除无效的sessionId');
                `);
                console.log('✅ 无效sessionId已清除，继续等待新的登录...')
              } catch (clearError) {
                console.log('⚠️ 清除无效sessionId失败:', clearError.message)
              }
            }
          }
        } catch (error) {
          // 忽略检查错误，继续等待
          console.log('🔍 定期检查遇到错误，继续等待:', error.message)
        }
      }, 2000) // 🔧 增加检查间隔到2秒

      // 窗口关闭时取消登录
      authWindow.on('closed', () => {
        clearInterval(checkSessionInterval)
        clearTimeout(timeoutId)
        if (!isHandled) { // 使用isHandled标记避免重复处理
          console.log('🚪 登录窗口被用户关闭')
          this.emit('login-cancelled')
          isHandled = true;
          reject(new Error('登录被取消'))
        }
      })

      // 监听窗口焦点，确保用户能看到登录窗口
      authWindow.on('ready-to-show', () => {
        authWindow.show()
        authWindow.focus()
      })
    })
  }

  /**
   * 🆕 处理OAuth回调（适配增强认证） - 修复版本
   */
  private handleOAuthCallback(
      url: string,
      authWindow: BrowserWindow,
      resolve: (token: string | null) => void,
      reject: (error: Error) => void,
      timeoutId?: NodeJS.Timeout
  ): void {
    console.log('🔍 检查URL:', url)

    // 🔧 更精确的成功页面判断
    const isLoginSuccess = (
        url.includes('/dashboard') ||
        url.includes('/success') ||
        url.includes('?auth=success') ||
        url.includes('#auth-success') ||
        url.includes('/auth-success') ||
        (url.startsWith(configuredWebBaseUrl) && !url.includes('/login') && !url.includes('/register'))
    );

    const isBackendRedirect = url.includes('/api/auth/callback');

    if (isLoginSuccess || isBackendRedirect) {
      console.log('✅ 检测到可能的登录成功页面:', url)

      // 🔧 使用新的验证方法
      this.validateAndGetSessionId(authWindow, resolve, reject, timeoutId)
    }
    else if (url.includes('/login') && (url.includes('error') || url.includes('failed'))) {
      console.error('❌ 检测到登录失败页面:', url)
      if (timeoutId) clearTimeout(timeoutId)
      authWindow.close()
      reject(new Error('登录失败'))
    }
    // 🔧 忽略其他URL变化，避免误判
  }

  /**
   * 🔧 新增：验证并获取SessionId
   */
  private async validateAndGetSessionId(
      authWindow: BrowserWindow,
      resolve: (token: string | null) => void,
      reject: (error: Error) => void,
      timeoutId?: NodeJS.Timeout
  ): Promise<void> {
    try {
      console.log('🔍 开始验证SessionId...')

      // 等待一下，确保页面完全加载
      await new Promise(resolve => setTimeout(resolve, 1000));

      // 获取sessionId
      const sessionId = await authWindow.webContents.executeJavaScript(`
        localStorage.getItem('sessionId')
      `);

      console.log('🔍 获取到的sessionId:', sessionId ? `${sessionId.substring(0, 10)}...` : 'null')

      if (sessionId && sessionId.length > 10) { // 基本长度检查
        console.log('✅ SessionId格式检查通过，开始API验证...')

        // 🔧 验证sessionId是否真的有效
        const isValid = await this.quickValidateSessionId(sessionId);

        if (isValid) {
          console.log('✅ SessionId API验证成功')
          if (timeoutId) clearTimeout(timeoutId)

          // 延迟关闭，让用户看到成功提示
          setTimeout(() => {
            if (!authWindow.isDestroyed()) {
              authWindow.close()
            }
            resolve(sessionId)
          }, 1500);
        } else {
          console.log('❌ SessionId API验证失败，继续等待用户完成登录...')
          // 不关闭窗口，继续等待
        }
      } else {
        console.log('❌ SessionId无效或为空，继续等待用户完成登录...')
        // 不关闭窗口，继续等待
      }
    } catch (error) {
      console.error('❌ 验证SessionId过程中出错:', error)
      // 不要立即关闭窗口，给用户更多时间
    }
  }

  /**
   * 🔧 新增：快速验证sessionId有效性
   */
  private async quickValidateSessionId(sessionId: string): Promise<boolean> {
    try {
      console.log('🔍 快速验证SessionId...')

      const tempClient = axios.create({
        baseURL: this.apiBaseUrl,
        timeout: 5000,
        headers: {
          'X-Session-Id': sessionId
        }
      });

      const response = await tempClient.get('/api/session_status');
      const isValid = response.data && response.data.success && response.data.user;

      console.log('🔍 快速验证结果:', isValid ? '有效' : '无效')
      return isValid;
    } catch (error) {
      // 🔧 修复：区分401错误和其他错误
      if (error.response && error.response.status === 401) {
        console.log('🔍 快速验证失败: Request failed with status code 401')
        console.log('🔧 SessionId已过期或无效，需要清除')
      } else {
        console.log('🔍 快速验证失败:', error.message)
      }
      return false;
    }
  }

  /**
   * 检查服务器连接
   */
  private async checkServerConnection(): Promise<boolean> {
    try {
      const response = await axios.get(`${this.apiBaseUrl}/health/live`, { timeout: 5000 })
      return response.status === 200
    } catch (error) {
      console.error('服务器连接检查失败:', error)
      return false
    }
  }

  /**
   * 🆕 清除认证数据（适配增强认证）
   */
  private clearAuthData(): void {
    this.token = null
    this.user = null
    this.userConfig = null

    // 🆕 清除增强认证的API客户端认证头
    delete this.apiClient.defaults.headers.common['Authorization']
    delete this.apiClient.defaults.headers.common['X-Session-Id']

    // 清除本地存储
    configHelper.updateConfig({ authToken: null })

    // 🔧 修复：清除所有可能的共享会话文件位置
    this.clearSharedSessionFiles()

    console.log('🗑️ 认证数据已清除')
    this.emit('authentication-cleared')
  }

  /**
   * 🔧 清除所有可能位置的共享会话文件
   */
  private clearSharedSessionFiles(): void {
    const path = require('path')
    const fs = require('fs')
    
    // 所有可能的共享会话文件路径
    const possiblePaths = [
      path.join(process.cwd(), 'shared-session.json'),
      path.join(__dirname, '..', 'shared-session.json'),
      path.join(__dirname, '..', '..', 'shared-session.json'),
      path.join(process.resourcesPath || '', '..', 'shared-session.json')
    ]

    let clearedCount = 0
    
    for (const sessionPath of possiblePaths) {
      try {
        if (fs.existsSync(sessionPath)) {
          fs.unlinkSync(sessionPath)
          console.log(`🗑️ 共享会话文件已删除: ${sessionPath}`)
          clearedCount++
        }
      } catch (error) {
        console.warn(`⚠️ 删除共享会话文件失败 ${sessionPath}:`, error)
      }
    }
    
    if (clearedCount === 0) {
      console.log('ℹ️ 未找到需要清除的共享会话文件')
    } else {
      console.log(`✅ 已清除 ${clearedCount} 个共享会话文件`)
    }
  }
}

// 导出单例
export const simpleAuthManager = new SimpleAuthManager() 
