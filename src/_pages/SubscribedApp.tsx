// file: src/components/SubscribedApp.tsx  
// 🆕 保留React Query导入以保持向后兼容（主要逻辑已迁移到SSE）
import { useQueryClient } from "@tanstack/react-query"
import { useEffect, useRef, useState } from "react"
import { useAIProcessing } from "../hooks/useAIProcessing"
import Queue from "../_pages/Queue"
import Solutions from "../_pages/Solutions"
import RawOutput from "../_pages/RawOutput"
import { useToast } from "../contexts/toast"
import RemotePairingPanel from "../components/RemotePairingPanel"

interface SubscribedAppProps {
  credits: number
}

const SubscribedApp: React.FC<SubscribedAppProps> = ({
  credits
}) => {
  // 🆕 恢复queryClient使用（向后兼容），同时保留SSE功能
  const queryClient = useQueryClient()
  const { clearResult } = useAIProcessing()
  const [view, setView] = useState<"queue" | "solutions" | "raw-output">("queue")
  const [previousView, setPreviousView] = useState<"queue" | "solutions">("queue")
  const containerRef = useRef<HTMLDivElement>(null)
  const { showToast } = useToast()

  useEffect(() => {
    const mapped = view === 'raw-output' ? 'solutions' : view
    window.electronAPI.setRendererView?.(mapped)
  }, [view])

  // 🆕 重构重置逻辑：使用SSE的clearResult替代React Query的invalidateQueries
  useEffect(() => {
    const cleanup = window.electronAPI.onResetView(async () => {
      console.log('🧹 [RESET] 收到重置信号，清除AI结果和状态')
      
      // 使用新的SSE清理方法
      await clearResult()
      
      // 重置界面视图
      setView("queue")
      
      console.log('✅ [RESET] 状态重置完成')
    })

    return () => {
      cleanup()
    }
  }, [clearResult])

  // Dynamically update the window size
  useEffect(() => {
    if (!containerRef.current) return

    const updateDimensions = () => {
      if (!containerRef.current) return
      const height = containerRef.current.scrollHeight || 600
      const width = containerRef.current.scrollWidth || 800
      window.electronAPI?.updateContentDimensions({ width, height })
    }

    // Force initial dimension update immediately
    updateDimensions()
    
    // Set a fallback timer to ensure dimensions are set even if content isn't fully loaded
    const fallbackTimer = setTimeout(() => {
      window.electronAPI?.updateContentDimensions({ width: 800, height: 600 })
    }, 500)

    const resizeObserver = new ResizeObserver(updateDimensions)
    resizeObserver.observe(containerRef.current)

    // Also watch DOM changes
    const mutationObserver = new MutationObserver(updateDimensions)
    mutationObserver.observe(containerRef.current, {
      childList: true,
      subtree: true,
      attributes: true,
      characterData: true
    })

    // Do another update after a delay to catch any late-loading content
    const delayedUpdate = setTimeout(updateDimensions, 1000)

    return () => {
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      clearTimeout(fallbackTimer)
      clearTimeout(delayedUpdate)
    }
  }, [view])

  // 🆕 重构事件监听：移除React Query依赖，简化状态管理
  useEffect(() => {
    const cleanupFunctions = [
      window.electronAPI.onSolutionStart(() => {
        setView("solutions")
      }),
      window.electronAPI.onUnauthorized(async () => {
        // 🆕 使用新的SSE清理方法替代React Query清理
        await clearResult()
        console.log('🔒 [UNAUTHORIZED] AI状态已清除')
        setView("queue")
      }),
      // 🆕 移除重复的onResetView监听器（已在上面的useEffect中处理）
      // window.electronAPI.onResetView(() => { ... }),
      // window.electronAPI.onResetView(() => { ... }),
      
      // 🆕 简化问题提取监听器：不再依赖React Query缓存
      window.electronAPI.onProblemExtracted((data: any) => {
        if (view === "queue") {
          console.log('📝 [PROBLEM_EXTRACTED] 问题提取完成:', data)
          // 问题数据现在由各个组件自己管理，不需要全局缓存
        }
      }),
      window.electronAPI.onSolutionError((error: string) => {
        showToast("Error", error, "error")
      })
    ]
    return () => cleanupFunctions.forEach((fn) => fn())
  }, [view, clearResult])

  // 创建带状态追踪的 setView 函数
  const handleSetView = (newView: "queue" | "solutions" | "raw-output" | "debug") => {
    if (newView === "debug") newView = "solutions"
    // 如果不是切换到原始输出，记录为上一个视图
    if (newView !== "raw-output") {
      setPreviousView(newView)
    }
    setView(newView)
  }

  // 监听原始输出切换事件和调试开始事件
  useEffect(() => {
    const unsubscribeToggle = window.electronAPI.onToggleRawOutput(() => {
      console.log('🔄 切换原始输出视图')
      setView(prev => {
        if (prev === "raw-output") {
          // 从原始输出返回到上一个视图
          console.log('🔙 从原始输出返回到:', previousView)
          return previousView
        } else {
          // 切换到原始输出，记录当前视图
          console.log('📄 切换到原始输出，来自:', prev)
          setPreviousView(prev as "queue" | "solutions")
          return "raw-output"
        }
      })
    })

    // 🆕 监听调试开始事件，自动切换到solutions界面
    const unsubscribeDebugStart = window.electronAPI.onDebugStart(() => {
      console.log('🔧 调试开始，检查当前视图状态')
      setView(prev => {
        if (prev === "raw-output") {
          console.log('🔄 从原始输出界面自动切换到solutions界面（调试开始）')
          // 更新previousView为solutions，这样下次切换到原始输出时能记住正确的返回位置
          setPreviousView("solutions")
          return "solutions"
        } else {
          console.log(`ℹ️ 调试开始，当前界面: ${prev}，无需切换`)
          return prev
        }
      })
    })

    // 🆕 监听编程题搜索开始事件，自动切换到solutions界面
    const unsubscribeSolutionStart = window.electronAPI.onSolutionStart(() => {
      console.log('💻 编程题搜索开始，检查当前视图状态')
      setView(prev => {
        if (prev === "raw-output") {
          console.log('🔄 从原始输出界面自动切换到solutions界面（编程题搜索开始）')
          // 更新previousView为solutions，这样下次切换到原始输出时能记住正确的返回位置
          setPreviousView("solutions")
          return "solutions"
        } else {
          console.log(`ℹ️ 编程题搜索开始，当前界面: ${prev}，无需切换`)
          return prev
        }
      })
    })

    // 🆕 监听人工触发的solution start事件（来自新的AI处理系统）
    const handleArtificialSolutionStart = (event: CustomEvent) => {
      console.log('🔄 收到人工solution start事件:', event.detail)
      setView(prev => {
        if (prev !== "solutions") {
          console.log('🔄 切换到solutions界面（人工触发）')
          setPreviousView(prev as "queue" | "solutions")
          return "solutions"
        }
        return prev
      })
    }

    window.addEventListener('artificialSolutionStart', handleArtificialSolutionStart as EventListener)

    return () => {
      unsubscribeToggle()
      unsubscribeDebugStart()
      unsubscribeSolutionStart()
      window.removeEventListener('artificialSolutionStart', handleArtificialSolutionStart as EventListener)
    }
  }, [previousView])

  return (
    <>
    <div ref={containerRef} className="client-overlay min-h-0">
      <RemotePairingPanel />
      {view === "queue" ? (
        <Queue
          setView={handleSetView}
          credits={credits}
        />
      ) : view === "solutions" ? (
        <Solutions
          setView={handleSetView}
          credits={credits}
        />
      ) : view === "raw-output" ? (
        <RawOutput
          setView={handleSetView}
          credits={credits}
          onReturn={() => setView(previousView)}
        />
      ) : null}
    </div>
    </>
  )
}

export default SubscribedApp
