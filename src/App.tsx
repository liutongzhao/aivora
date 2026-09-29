import SubscribedApp from "./_pages/SubscribedApp"
import { UpdateNotification } from "./components/UpdateNotification"
// 🆕 临时导入React Query以保持向后兼容，完整迁移后将移除
import {
  QueryClient,
  QueryClientProvider
} from "@tanstack/react-query"
import { useEffect, useState, useCallback, useRef } from "react"
import {
  Toast,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  ToastVariant
} from "./components/ui/toast"
import { ToastContext } from "./contexts/toast"
import { WelcomeScreen } from "./components/WelcomeScreen"
import { parseStreamedSolution } from "./utils/streamParser"
import SettingsDialog from "./components/Settings/SettingsDialog"
import { WebAuthDialog } from "./components/WebAuth/WebAuthDialog"
import ClickThroughManager from "./components/ClickThroughManager"
import { useWebAuth } from "./hooks/useWebAuth"
import { useAIProcessing } from "./hooks/useAIProcessing"
import { ShortcutProvider } from "./contexts/shortcuts"

// 🆕 临时恢复QueryClient以保持向后兼容，SSE功能已独立实现
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,
      gcTime: Infinity,
      retry: 1,
      refetchOnWindowFocus: false
    },
    mutations: {
      retry: 1
    }
  }
})

// 注意：主要的AI处理逻辑已迁移到SSE，QueryClient仅用于向后兼容

// Root component that provides the QueryClient
function App() {
  const [toastState, setToastState] = useState({
    open: false,
    title: "",
    description: "",
    variant: "neutral" as ToastVariant,
    actionText: "",
    onActionClick: undefined as (() => void) | undefined
  })
  const [credits, setCredits] = useState<number>(0) // Real credits from server
  const [isInitialized, setIsInitialized] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [config, setConfig] = useState({})
  
  // Toast定时器引用，用于清理
  const toastTimerRef = useRef<NodeJS.Timeout | null>(null)

  // Web Authentication Hook
  const { 
    authenticated, 
    user, 
    loading: authLoading, 
    connectionStatus 
  } = useWebAuth()

  // AI Processing Hook for WebSocket results
  const aiProcessing = useAIProcessing()
  const {
    result,
    error: aiError,
    progress: aiProgress,
    isProcessing: aiIsProcessing,
    processScreenshot,
    debugCode,
    cancelProcessing
  } = aiProcessing

  // 🆕 控制认证对话框显示
  // 当未认证时自动显示登录对话框，认证后自动关闭
  const [isWebAuthOpen, setIsWebAuthOpen] = useState(false)

  useEffect(() => {
    const isElectron = Boolean((window as any).electronAPI)
    if (isElectron) {
      return
    }

    const handleScrollShortcut = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey) return
      if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

      const direction = event.key === 'ArrowDown' ? 1 : -1
      const step = 160

      const scrollDocument = () => {
        const scrollingElement = document.scrollingElement || document.documentElement
        if (!scrollingElement) return false
        if (scrollingElement.scrollHeight <= scrollingElement.clientHeight) return false
        scrollingElement.scrollBy({ top: direction * step, behavior: 'smooth' })
        return true
      }

      const scrollFallbackContainer = () => {
        const candidates = Array.from(
          document.querySelectorAll<HTMLElement>('[style*="overflow"], .overflow-y-auto, .overflow-y-scroll')
        )

        for (const element of candidates) {
          const style = window.getComputedStyle(element)
          const canScroll = ['auto', 'scroll'].includes(style.overflowY)
          if (!canScroll) continue
          if (element.scrollHeight <= element.clientHeight) continue

          element.scrollBy({ top: direction * step, behavior: 'smooth' })
          return true
        }

        return false
      }

      const handled = scrollDocument() || scrollFallbackContainer()
      if (handled) {
        event.preventDefault()
        event.stopPropagation()
      }
    }

    window.addEventListener('keydown', handleScrollShortcut)
    return () => window.removeEventListener('keydown', handleScrollShortcut)
  }, [])

  // Update credits from server
  const updateCredits = useCallback((newCredits: number) => {
    setCredits(newCredits)
    window.__CREDITS__ = newCredits
  }, [])

  // 🆕 获取用户积分余额 (通过IPC)
  const fetchUserCredits = useCallback(async () => {
    try {
      const result = await window.electronAPI.creditsGet()
      if (result.success) {
        updateCredits(result.credits)
        console.log('✅ (IPC) Credits balance fetched successfully:', result.credits)
      } else {
        console.error('❌ (IPC) Failed to fetch credits balance:', result.error)
        updateCredits(0)
      }
    } catch (error) {
      console.error('❌ (IPC) Credits balance fetch error:', error)
      updateCredits(0)
    }
  }, [updateCredits])

  // 🆕 监听认证状态变化，自动控制对话框显示
  useEffect(() => {
    // Electron 客户端由主进程统一切换到内置登录页，不显示 Web 登录对话框。
    if (window.electronAPI) return
    if (isInitialized && !authLoading) {
      if (!authenticated) {
        // 未认证时显示登录对话框
        setIsWebAuthOpen(true)
        // 重置积分为0
        updateCredits(0)
      } else {
        // 已认证时关闭登录对话框
        setIsWebAuthOpen(false)
        // 🆕 认证成功后获取积分余额
        fetchUserCredits()
      }
    }
  }, [isInitialized, authenticated, authLoading, updateCredits, fetchUserCredits])


  // Helper function to mark initialization complete
  const markInitialized = useCallback(() => {
    setIsInitialized(true)
    window.__IS_INITIALIZED__ = true
  }, [])

  // Show toast method (enhanced with action support and forced auto-close)
  const showToast = useCallback(
    (
      title: string,
      description: string,
      variant: ToastVariant,
      actionText?: string,
      onActionClick?: () => void
    ) => {
      // 清理之前的定时器
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
      
      setToastState({
        open: true,
        title,
        description,
        variant,
        actionText: actionText || "",
        onActionClick: onActionClick || undefined
      })
      
      // 强制在1秒后关闭Toast，不受页面焦点状态影响
      toastTimerRef.current = setTimeout(() => {
        setToastState(prev => ({ ...prev, open: false }))
        toastTimerRef.current = null
      }, 1000)
    },
    []
  )

  // 监听后端发送的通知消息（优化用户体验）
  useEffect(() => {
    const unsubscribers: (() => void)[] = []
    
    if (window.electronAPI?.onNotification) {
      const unsubscribeNotification = window.electronAPI.onNotification((notification: any) => {
        console.log('Received notification:', notification)
        
        // 映射通知类型到Toast变体
        const getToastVariant = (type: string): ToastVariant => {
          switch (type) {
            case 'error': return 'error'
            case 'success': return 'success'
            case 'warning': return 'warning'
            case 'info': return 'info'
            case 'loading': return 'loading'
            default: return 'neutral'
          }
        }
        
        showToast(
          notification.title,
          notification.message,
          getToastVariant(notification.type),
          notification.actions && notification.actions.length > 0 ? notification.actions[0].text : undefined,
          notification.actions && notification.actions.length > 0 ? () => {
            if (notification.actions[0].action === 'open-web-login') {
              // Actually trigger login operation
              setTimeout(async () => {
                console.log('Preparing to trigger login operation')
                try {
                  // Call backend login function
                  const result = await window.electronAPI.webAuthLogin()
                  if (result.success) {
                    showToast('登录成功', '欢迎回来！', 'success')
                  } else {
                    showToast('登录失败', result.error || '请重试', 'error')
                  }
                } catch (error) {
                  console.error('Login operation failed:', error)
                  showToast('登录失败', '网络错误，请重试', 'error')
                }
              }, 1000)
            }
          } : undefined
        )
      })
      unsubscribers.push(unsubscribeNotification)
    }
    
    // 监听清除通知事件
    if (window.electronAPI?.onClearNotification) {
      const unsubscribeClear = window.electronAPI.onClearNotification(() => {
        console.log('收到清除通知事件')
        setToastState(prev => ({ ...prev, open: false }))
      })
      unsubscribers.push(unsubscribeClear)
    }
    
    // 🆕 监听部分截图事件
    if (window.electronAPI?.onPartialScreenshotStarted) {
      const unsubscribePartialStart = window.electronAPI.onPartialScreenshotStarted(() => {
        console.log('🎯 部分截图开始')
        showToast(
          '选择左上角',
          '请点击截图区域的左上角',
          'info'
        )
      })
      unsubscribers.push(unsubscribePartialStart)
    }

    if (window.electronAPI?.onPartialScreenshotStep) {
      const unsubscribePartialStep = window.electronAPI.onPartialScreenshotStep(() => {
        showToast(
          '选择右下角',
          '请点击截图区域的右下角',
          'info'
        )
      })
      unsubscribers.push(unsubscribePartialStep)
    }

    if (window.electronAPI?.onPartialScreenshotError) {
      const unsubscribePartialError = window.electronAPI.onPartialScreenshotError((error) => {
        console.error('❌ 部分截图失败:', error.error)
        showToast(
          '部分截图失败',
          error.error,
          'error'
        )
      })
      unsubscribers.push(unsubscribePartialError)
    }

    // 🆕 监听截图成功事件
    if (window.electronAPI?.onScreenshotTaken) {
      const unsubscribeScreenshotTaken = window.electronAPI.onScreenshotTaken((data) => {
        console.log('📸 截图已完成:', data)
        if (data.type === 'partial') {
          showToast(
            '部分截图成功',
            '图片已添加到队列，可以开始搜题了',
            'success'
          )
        }
      })
      unsubscribers.push(unsubscribeScreenshotTaken)
    }
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [showToast])

  // 🆕 监听AI处理请求事件
  useEffect(() => {
    const unsubscribers: (() => void)[] = []
    
    // 监听AI处理请求事件
    if (window.electronAPI?.onAiProcessRequest) {
      const unsubscribeAiProcess = window.electronAPI.onAiProcessRequest(async (requestData: any) => {
        // 支持多张截图的处理逻辑
        const screenshots = requestData.screenshots || (requestData.screenshot ? [requestData.screenshot] : [])
        const screenshotToProcess = requestData.screenshots ? requestData.screenshots : requestData.screenshot
        
        console.log('🤖 [APP] 前端收到AI处理请求:', {
          type: requestData.type,
          screenshotCount: screenshots.length,
          isMultiScreenshot: !!requestData.screenshots,
          firstScreenshotLength: screenshots[0]?.length,
          isDataURL: screenshots[0]?.startsWith('data:image/'),
          hasComma: screenshots[0]?.includes(','),
          options: requestData.options
        })
        
        try {
          // 🔧 使用useAIProcessing hook，传递单张截图或多张截图
          console.log('🔄 [APP] 调用useAIProcessing.processScreenshot...', {
            isMultiScreenshot: Array.isArray(screenshotToProcess),
            screenshotCount: Array.isArray(screenshotToProcess) ? screenshotToProcess.length : 1
          })
          
          // 直接传递原始数据给processScreenshot，让它在aiService中处理多张截图
          await processScreenshot(screenshotToProcess, {
            forceQuestionType: requestData.options?.forceQuestionType,
            preferredLanguage: requestData.options?.preferredLanguage
          })
          
          console.log('✅ [APP] AI处理请求已通过WebSocket方式提交')
          
          // 触发界面切换到solutions页面
          console.log('🔄 [APP] 模拟solution start事件，切换到solutions界面')
          
          // 发送自定义事件给SubscribedApp来触发界面切换
          const event = new CustomEvent('artificialSolutionStart', {
            detail: { source: 'useAIProcessing' }
          })
          window.dispatchEvent(event)
          
        } catch (error) {
          console.error('❌ [APP] 处理AI请求异常:', error)
          showToast('处理失败', '无法连接AI服务，请稍后重试', 'error')
        }
      })
      unsubscribers.push(unsubscribeAiProcess)
    }
    
    // 监听AI调试请求事件
    if (window.electronAPI?.onAiDebugRequest) {
      const unsubscribeAiDebug = window.electronAPI.onAiDebugRequest(async (requestData: any) => {
        console.log('🔧 [APP] 前端收到AI调试请求:', requestData)
        
        try {
          // 🆕 立即切换到Solutions界面并显示"提取题目"状态
          console.log('🔄 [APP] 切换界面到Solutions并设置提取状态...')
          window.dispatchEvent(new CustomEvent('artificialSolutionStart', { detail: { source: 'ai-debug' } }))
          
          // 设置React Query状态为"提取题目"状态
          queryClient.setQueryData(["problem_statement"], {
            content: "正在提取调试题目...",
            timestamp: Date.now(),
            type: 'debug',
            isExtracting: true
          })
          
          // 🔧 使用useAIProcessing hook来处理WebSocket方式
          console.log('🔄 [APP] 调用useAIProcessing.debugCode...')
          await debugCode(requestData.screenshot, requestData.code || '', requestData.language)
          
          console.log('✅ [APP] AI调试请求已通过WebSocket方式提交')
          
        } catch (error) {
          console.error('❌ [APP] 处理AI调试请求异常:', error)
          showToast('调试失败', '无法连接AI服务，请稍后重试', 'error')
        }
      })
      unsubscribers.push(unsubscribeAiDebug)
    }
    
    // 🆕 监听AI请求取消事件（Ctrl+R触发）
    if (window.electronAPI?.onCancelAiRequests) {
      const unsubscribeCancel = window.electronAPI.onCancelAiRequests(async () => {
        console.log('🚫 [APP] 收到取消AI请求信号')
        try {
          await cancelProcessing()
          console.log('✅ [APP] AI请求已取消')
        } catch (error) {
          console.error('❌ [APP] 取消AI请求失败:', error)
        }
      })
      unsubscribers.push(unsubscribeCancel)
    }
    
    return () => {
      unsubscribers.forEach(unsubscribe => unsubscribe())
    }
  }, [showToast, processScreenshot, debugCode, cancelProcessing])


  // 🔧 临时禁用App.tsx中的结果处理，避免与Solutions.tsx直接处理产生状态竞争
  useEffect(() => {
    if (result) {
      console.log('🎉 [APP-SSE] 收到AI处理结果（实时或完整）:', {
        questionType: result.questionType,
        contentLength: result.content?.length,
        model: result.model,
        isStreaming: result.model === 'streaming'
      })
      
      // 🚫 暂时禁用IPC发送，让Solutions.tsx直接处理aiResult
      console.log('ℹ️ [APP-SSE] IPC发送已禁用，让Solutions.tsx直接处理结果')
      
      // 仅保留IPC发送用于调试（可选）
      if (false) { // 设为false以禁用
        try {
          // 原有的IPC发送逻辑...
        } catch (error) {
          console.error('❌ 处理AI结果时出错:', error)
        }
      }
    }
  }, [result, aiProgress, aiIsProcessing])

  // 🆕 监听WebSocket AI处理错误
  useEffect(() => {
    if (aiError) {
      console.error('🚨 WebSocket AI处理出错:', aiError)
      showToast(
        'AI处理失败', 
        aiError.message || '处理过程中发生未知错误', 
        'error'
      )
    }
  }, [aiError, showToast])

  // Initialize dropdown handler
  useEffect(() => {
    if (isInitialized) {
      // Process all types of dropdown elements with a shorter delay
      const timer = setTimeout(() => {
        // Find both native select elements and custom dropdowns
        const selectElements = document.querySelectorAll('select');
        const customDropdowns = document.querySelectorAll('.dropdown-trigger, [role="combobox"], button:has(.dropdown)');
        
        // Enable native selects
        selectElements.forEach(dropdown => {
          dropdown.disabled = false;
        });
        
        // Enable custom dropdowns by removing any disabled attributes
        customDropdowns.forEach(dropdown => {
          if (dropdown instanceof HTMLElement) {
            dropdown.removeAttribute('disabled');
            dropdown.setAttribute('aria-disabled', 'false');
          }
        });
        
        // 减少终端输出
      }, 1000);
      
      return () => clearTimeout(timer);
    }
  }, [isInitialized]);

  // Listen for settings dialog open requests
  useEffect(() => {
    const unsubscribeSettings = window.electronAPI.onShowSettings(() => {
      // 减少终端输出
      setIsSettingsOpen(true);
    });
    
    return () => {
      unsubscribeSettings();
    };
  }, []);

  // 🆕 监听背景透明度变更事件
  useEffect(() => {
    const unsubscribeOpacity = window.electronAPI.onBackgroundOpacityChanged?.((opacity: number) => {
      console.log('Background opacity changed:', opacity);
      // 更新CSS变量以控制背景透明度
      document.documentElement.style.setProperty('--bg-opacity', opacity.toString());
    });
    
    return () => {
      unsubscribeOpacity?.();
    };
  }, []);

  // Initialize basic app state
  useEffect(() => {
    // Load config and set values
    const initializeApp = async () => {
      try {
        // Initialize with 0 credits, will be loaded from server when authenticated
        updateCredits(0)
        
        // 移除：配置加载现在由后端管理，客户端不需要AI相关配置
        // and stored in config as extractionModel, solutionModel, and debuggingModel
        
        markInitialized()
      } catch (error) {
        // 减少终端输出
        // Fallback to defaults
        markInitialized()
      }
    }
    
    initializeApp()

    // Define a no-op handler for solution success
    const unsubscribeSolutionSuccess = window.electronAPI.onSolutionSuccess(
      () => {
        // 减少终端输出
        // No credit deduction in this version
      }
    )

    // Cleanup function
    return () => {
      unsubscribeSolutionSuccess()
      // 清理Toast定时器
      if (toastTimerRef.current) {
        clearTimeout(toastTimerRef.current)
        toastTimerRef.current = null
      }
      window.__IS_INITIALIZED__ = false
      setIsInitialized(false)
    }
  }, [updateCredits, markInitialized, showToast])

  // API Key dialog management
  const handleOpenSettings = useCallback(() => {
    // 减少终端输出
    setIsSettingsOpen(true);
  }, []);
  
  const handleCloseSettings = useCallback((open: boolean) => {
    // 减少终端输出
    setIsSettingsOpen(open);
  }, []);

  const handleConfigUpdate = useCallback(async (newConfig: any) => {
    try {
      await window.electronAPI.updateConfig(newConfig)
      setConfig(newConfig)
      showToast("成功", "设置已保存", "success")
    } catch (error) {
      // 减少终端输出
      showToast("错误", "保存设置失败", "error")
    }
  }, [showToast])

  return (
    // 🆕 临时恢复QueryClientProvider以保持向后兼容
    <QueryClientProvider client={queryClient}>
      <ShortcutProvider>
      <ToastProvider>
        <ToastContext.Provider value={{ showToast }}>
        <div className="relative">
          {isInitialized ? (
            // 🆕 修改逻辑：只有在已认证时才显示主应用
            authenticated ? (
              <ClickThroughManager
                nonClickThroughSelectors={[
                  'button',
                  'a',
                  'input',
                  'textarea',
                  'select',
                  '[role="button"]'
                ]}
              >
                <SubscribedApp
                  credits={credits}
                  aiProcessing={aiProcessing}
                />
              </ClickThroughManager>
            ) : (
              // 🆕 未认证时显示等待登录的界面
              <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: 'rgba(0, 0, 0, 0.9)'}}>
                <div className="flex flex-col items-center gap-4 text-center">
                  {authLoading ? (
                    <>
                      <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                      <p className="text-white/60 text-sm">
                        检查认证状态...
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 border-2 border-white/20 rounded-full flex items-center justify-center">
                        <svg className="w-6 h-6 text-white/60" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      </div>
                      <div>
                        <h2 className="text-white text-lg font-medium mb-2">需要登录</h2>
                        <p className="text-white/60 text-sm">
                          请通过Web配置中心登录以使用增强认证功能
                        </p>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )
          ) : (
            <div className="min-h-screen flex items-center justify-center" style={{backgroundColor: 'rgba(0, 0, 0, 0.9)'}}>
              <div className="flex flex-col items-center gap-3">
                <div className="w-6 h-6 border-2 border-white/20 border-t-white/80 rounded-full animate-spin"></div>
                <p className="text-white/60 text-sm">
                  初始化中...
                </p>
              </div>
            </div>
          )}
          <UpdateNotification />
        </div>
        
        {/* Settings Dialog */}
        <SettingsDialog 
          isOpen={isSettingsOpen} 
          onClose={() => setIsSettingsOpen(false)}
          onConfigUpdate={handleConfigUpdate}
          config={config}
        />
        
        {/* 🆕 Web Authentication Dialog - 根据认证状态自动控制显示 */}
        <WebAuthDialog 
          open={isWebAuthOpen}
          onOpenChange={setIsWebAuthOpen}
        />
        
        <Toast
          open={toastState.open}
          onOpenChange={(open) => {
            setToastState((prev) => ({ ...prev, open }))
            // 如果用户手动关闭Toast，也要清理定时器
            if (!open && toastTimerRef.current) {
              clearTimeout(toastTimerRef.current)
              toastTimerRef.current = null
            }
          }}
          variant={toastState.variant}
          duration={1000}
          actionText={toastState.actionText}
          onActionClick={toastState.onActionClick || undefined}
        >
          <ToastTitle>{toastState.title}</ToastTitle>
          <ToastDescription>{toastState.description}</ToastDescription>
        </Toast>
        <ToastViewport />
        </ToastContext.Provider>
      </ToastProvider>
      </ShortcutProvider>
    </QueryClientProvider>
  )

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onShortcutRuntimeStatus?.((status: { type: 'success' | 'error'; message: string }) => {
      showToast(status.type === 'success' ? '快捷键已恢复' : '快捷键异常', status.message, status.type)
    })
    return () => unsubscribe?.()
  }, [showToast])
}

export default App
