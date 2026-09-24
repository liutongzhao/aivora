import { useState, useEffect, useCallback } from 'react'

interface User {
  id: string
  username: string
  email: string
  createdAt: string
}

interface VersionInfo {
  current: string
  latest: string
  needsUpdate: boolean
  downloadUrl: string
  releaseNotes: string
}

interface WebAuthStatus {
  authenticated: boolean
  user: User | null
  loading: boolean
  error: string | null
}


export function useWebAuth() {
  const [authStatus, setAuthStatus] = useState<WebAuthStatus>({
    authenticated: false,
    user: null,
    loading: true,
    error: null,
  })
  const [connectionStatus, setConnectionStatus] = useState({
    connected: false,
    checking: true,
  })

  // 显示版本更新弹窗
  const showUpdateDialog = useCallback((versionInfo: VersionInfo) => {
    // 更新提示弹窗暂时禁用，仅记录一次会话避免重复处理
    if (!versionInfo.needsUpdate) return
    const sessionKey = `version-dialog-shown-${versionInfo.current}-${versionInfo.latest}`
    if (sessionStorage.getItem(sessionKey)) {
      return
    }
    sessionStorage.setItem(sessionKey, 'true')
  }, [])

  // 检查认证状态
  const checkAuthStatus = useCallback(async () => {
    try {
      setAuthStatus(prev => ({ ...prev, loading: true, error: null }))
      const status = await window.electronAPI.webAuthStatus()
      
      if (status.error) {
        setAuthStatus({
          authenticated: false,
          user: null,
          loading: false,
          error: status.error,
        })
      } else {
        setAuthStatus({
          authenticated: status.authenticated,
          user: status.user,
          loading: false,
          error: null,
        })
        
        // 🆕 如果用户已认证且有版本信息，检查是否需要更新
        if (status.authenticated && status.version) {
          showUpdateDialog(status.version)
        }
      }
    } catch (error) {
      console.error('Failed to check auth status:', error)
      setAuthStatus({
        authenticated: false,
        user: null,
        loading: false,
        error: 'Failed to check authentication status',
      })
    }
  }, [showUpdateDialog])

  // 检查Web服务器连接状态
  const checkConnection = useCallback(async () => {
    try {
      setConnectionStatus(prev => ({ ...prev, checking: true }))
      const result = await window.electronAPI.webCheckConnection()
      setConnectionStatus({
        connected: result.connected,
        checking: false,
      })
      return result.connected
    } catch (error) {
      console.error('Failed to check connection:', error)
      setConnectionStatus({
        connected: false,
        checking: false,
      })
      return false
    }
  }, [])

  // 登录
  const login = useCallback(async () => {
    try {
      setAuthStatus(prev => ({ ...prev, loading: true, error: null }))
      const result = await window.electronAPI.webAuthLogin()
      
      if (!result.success) {
        setAuthStatus(prev => ({
          ...prev,
          loading: false,
          error: result.error || '登录失败',
        }))
        return { success: false, error: result.error }
      }
      
      // 🆕 检查登录响应中的版本信息
      if (result.version) {
        showUpdateDialog(result.version)
      }
      
      // 登录成功后重新检查状态
      setTimeout(checkAuthStatus, 1000)
      return { success: true }
    } catch (error) {
      console.error('Login failed:', error)
      setAuthStatus(prev => ({
        ...prev,
        loading: false,
        error: '登录过程中出现错误',
      }))
      return { success: false, error: '登录过程中出现错误' }
    }
  }, [checkAuthStatus, showUpdateDialog])

  // 登出
  const logout = useCallback(async () => {
    console.log('🔐 useWebAuth logout 函数called');
    try {
      console.log('📝 设置加载状态为 true');
      setAuthStatus(prev => ({ ...prev, loading: true }))
      
      console.log('📞 调用 window.electronAPI.webAuthLogout()');
      const result = await window.electronAPI.webAuthLogout()
      console.log('📋 IPC 调用结果:', result);
      
      if (result.success) {
        console.log('✅ IPC 返回成功，更新本地状态');
        setAuthStatus({
          authenticated: false,
          user: null,
          loading: false,
          error: null,
        })
      } else {
        console.log('❌ IPC 返回失败:', result.error);
        setAuthStatus(prev => ({
          ...prev,
          loading: false,
          error: result.error || '登出失败',
        }))
      }
      
      console.log('📤 返回结果给调用者:', result);
      return result
    } catch (error) {
      console.error('❌ useWebAuth logout 异常:', error)
      setAuthStatus(prev => ({
        ...prev,
        loading: false,
        error: '登出过程中出现错误',
      }))
      return { success: false, error: '登出过程中出现错误' }
    }
  }, [])


  // 只在初始化时检查一次认证状态和连接状态
  useEffect(() => {
    console.log('🔍 Initializing Web auth check...')
    
    // 同时检查认证状态和连接状态
    const initializeAuth = async () => {
      await Promise.all([
        checkAuthStatus(),
        checkConnection()
      ])
    }
    
    initializeAuth()
    
    // 监听认证状态变化事件
    const handleAuthStatus = (status: { authenticated: boolean; user: any }) => {
      console.log('🔄 Auth status changed:', status)
      setAuthStatus({
        authenticated: status.authenticated,
        user: status.user,
        loading: false,
        error: null,
      })
      
    }
    
    // 使用正确的事件监听方法
    const unsubscribeAuthStatus = window.electronAPI?.onWebAuthStatus?.(handleAuthStatus)
    
    // 清理函数
    return () => {
      if (unsubscribeAuthStatus) {
        unsubscribeAuthStatus()
      }
    }
  }, [checkAuthStatus, checkConnection])

  return {
    // 认证状态
    ...authStatus,
    
    // 连接状态
    connectionStatus,
    
    // 操作方法
    login,
    logout,
    checkAuthStatus,
    checkConnection,
  }
}
