// ProcessingStatus.tsx - AI处理状态实时展示组件
import React from 'react'
import { Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react'

interface ProcessingStatusProps {
  isProcessing: boolean
  isInitializing: boolean
  progress: number
  stage: string
  message: string
  error: any | null
  onCancel?: () => void
  className?: string
  requestId?: string  // 🆕 添加 requestId 以识别调试模式
}

/**
 * AI处理状态实时展示组件
 */
export function ProcessingStatus({
  isProcessing,
  isInitializing,
  progress,
  stage,
  message,
  error,
  onCancel,
  className = '',
  requestId = ''
}: ProcessingStatusProps) {
  
  // 🆕 检测是否为调试模式
  const isDebugMode = requestId.startsWith('debug_')
  
  // 如果没有处理中且没有错误，不显示组件
  if (!isProcessing && !isInitializing && !error) {
    return null
  }

  // 获取状态图标
  const getStatusIcon = () => {
    if (error) {
      return <XCircle className="w-3 h-3 text-red-400" />
    }
    
    if (isInitializing) {
      return <Loader2 className="w-3 h-3 text-white/60 animate-spin" />
    }
    
    if (isProcessing) {
      return <Loader2 className={`w-3 h-3 animate-spin ${isDebugMode ? 'text-blue-400' : 'text-white/60'}`} />
    }
    
    if (progress === 100) {
      return <CheckCircle className="w-3 h-3 text-green-400" />
    }
    
    return <AlertCircle className="w-3 h-3 text-white/40" />
  }

  // 获取状态颜色 - 使用客户端界面一致的样式
  const getStatusColor = () => {
    if (error) return 'border-red-400/20 opacity-controlled-bg-light'
    return 'border-white/20 opacity-controlled-bg' // 使用客户端相同的背景样式
  }

  // 获取进度条颜色
  const getProgressColor = () => {
    if (error) return 'bg-red-400'
    if (isDebugMode) return 'bg-blue-400' // 调试模式使用蓝色
    return 'bg-white/40' // 普通模式使用半透明白色
  }

  // 获取阶段描述
  const getStageDescription = (stage: string) => {
    const stageMap: { [key: string]: string } = {
      'initializing': '正在初始化',
      'auth_check': '验证用户认证',
      'config_loading': '加载用户配置',
      'llm_config': '获取AI模型配置',
      'credit_check': '检查积分余额',
      'question_analysis': '分析题目类型',
      'ai_processing': '调用AI模型分析',
      'ai_streaming': 'AI正在分析',
      'post_processing': '处理分析结果',
      'completed': '处理完成',
      'error': '处理失败',
      'cancelled': '处理已取消'
    }
    return stageMap[stage] || stage
  }

  return (
    <div className={`border rounded-lg py-2 px-3 ${getStatusColor()} ${className}`}>
      {/* 简化的进度条和状态信息 - 单行显示 */}
      <div className="flex items-center justify-between">
        {/* 左侧：图标和状态文字 */}
        <div className="flex items-center space-x-2 min-w-0 flex-1">
          {getStatusIcon()}
          <span className="text-xs text-white/80 truncate">
            {error ? '处理失败' : 
             isDebugMode ? '🔧 AI智能调试中' :
             isInitializing ? '正在初始化' : 
             isProcessing ? getStageDescription(stage) : '处理状态'}
          </span>
        </div>
        
        {/* 右侧：进度条和百分比 */}
        {!error && (isProcessing || isInitializing) && (
          <div className="flex items-center space-x-2 ml-3">
            <div className="w-16 bg-white/10 rounded-full h-1.5">
              <div
                className={`${getProgressColor()} h-1.5 rounded-full transition-all duration-300 ease-out`}
                style={{ width: `${Math.max(progress, 2)}%` }}
              />
            </div>
            <span className="text-xs text-white/60 font-mono min-w-[2.5rem] text-right">
              {progress.toFixed(0)}%
            </span>
          </div>
        )}

        {/* 错误信息 */}
        {error && (
          <div className="text-xs text-red-400 truncate max-w-32">
            {error.message || '处理失败'}
          </div>
        )}
      </div>
    </div>
  )
}

// 简化版状态指示器（用于小空间显示）
interface MiniProcessingStatusProps {
  isProcessing: boolean
  isInitializing: boolean
  progress: number
  error: any | null
  className?: string
}

export function MiniProcessingStatus({
  isProcessing,
  isInitializing,
  progress,
  error,
  className = ''
}: MiniProcessingStatusProps) {
  
  if (!isProcessing && !isInitializing && !error) {
    return null
  }

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      {/* 状态图标 */}
      {error ? (
        <XCircle className="w-4 h-4 text-red-500" />
      ) : (isProcessing || isInitializing) ? (
        <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />
      ) : (
        <CheckCircle className="w-4 h-4 text-green-500" />
      )}
      
      {/* 进度信息 */}
      {!error && (isProcessing || isInitializing) && (
        <>
          <div className="w-16 bg-gray-200 rounded-full h-1">
            <div
              className="bg-blue-500 h-1 rounded-full transition-all duration-300"
              style={{ width: `${Math.max(progress, 2)}%` }}
            />
          </div>
          <span className="text-xs text-gray-600">
            {progress.toFixed(0)}%
          </span>
        </>
      )}
      
      {/* 错误信息 */}
      {error && (
        <span className="text-xs text-red-600 truncate max-w-32">
          {error.message || '处理失败'}
        </span>
      )}
    </div>
  )
}
