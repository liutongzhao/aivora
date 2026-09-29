// CompatibilityDialog.tsx - 兼容性检测UI界面

import React, { useState, useEffect, useCallback } from 'react'
import { Card } from '../ui/card'
import { Button } from '../ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog'

interface CompatibilityResult {
  category: 'shortcuts' | 'permissions' | 'security' | 'system'
  name: string
  status: 'pass' | 'warning' | 'fail' | 'checking'
  message: string
  details?: string
  solution?: string
}

interface CompatibilityReport {
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

interface CompatibilityDialogProps {
  isOpen: boolean
  onClose: () => void
  autoStart?: boolean
}

export const CompatibilityDialog: React.FC<CompatibilityDialogProps> = ({
  isOpen,
  onClose,
  autoStart = false
}) => {
  const [isChecking, setIsChecking] = useState(false)
  const [report, setReport] = useState<CompatibilityReport | null>(null)
  const [currentCheck, setCurrentCheck] = useState<CompatibilityResult | null>(null)
  const [progress, setProgress] = useState(0)

  // 启动兼容性检测
  const startCheck = useCallback(async () => {
    setIsChecking(true)
    setReport(null)
    setCurrentCheck(null)
    setProgress(0)

    try {
      // 通过 Electron IPC 调用检测功能
      const result = await window.electronAPI.startCompatibilityCheck()
      
      if (result.success) {
        console.log('✅ 兼容性检测完成')
      } else {
        console.error('❌ 兼容性检测失败:', result.error)
      }
    } catch (error) {
      console.error('兼容性检测过程中出现错误:', error)
      // 添加错误处理的结果
      setReport({
        overall: 'fail',
        results: [{
          category: 'system',
          name: '检测过程',
          status: 'fail',
          message: '检测过程中出现错误',
          details: error instanceof Error ? error.message : String(error)
        }],
        timestamp: Date.now(),
        systemInfo: {
          platform: 'unknown',
          version: 'unknown',
          arch: 'unknown',
          electronVersion: 'unknown'
        }
      })
    } finally {
      setIsChecking(false)
    }
  }, [])

  // 监听检测进度更新
  useEffect(() => {
    if (!window.electronAPI) return

    const handleProgress = (result: CompatibilityResult) => {
      console.log('🔄 检测进度:', result)
      setCurrentCheck(result)
      setProgress(prev => prev + 1)
    }

    const handleComplete = (finalReport: CompatibilityReport) => {
      console.log('✅ 检测完成:', finalReport)
      setReport(finalReport)
      setIsChecking(false)
      setCurrentCheck(null)
    }

    // 注册事件监听器
    window.electronAPI.onCompatibilityProgress?.(handleProgress)
    window.electronAPI.onCompatibilityComplete?.(handleComplete)

    return () => {
      // 清理事件监听器
      window.electronAPI.removeCompatibilityListeners?.()
    }
  }, [])

  // 自动启动检测
  useEffect(() => {
    if (isOpen && autoStart && !isChecking && !report) {
      startCheck()
    }
  }, [isOpen, autoStart, isChecking, report, startCheck])

  // Ctrl+W 快捷键关闭对话框
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (isOpen && event.ctrlKey && event.key === 'w') {
        event.preventDefault()
        event.stopPropagation()
        console.log('🔴 通过 Ctrl+W 关闭兼容性检测报告')
        onClose()
      }
    }

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown)
      console.log('📝 已注册 Ctrl+W 快捷键监听器')
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      console.log('🗑️ 已移除 Ctrl+W 快捷键监听器')
    }
  }, [isOpen, onClose])

  // 获取状态图标
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pass': return '✅'
      case 'warning': return '⚠️'
      case 'fail': return '❌'
      case 'checking': return '🔄'
      default: return '❓'
    }
  }

  // 获取状态颜色类
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pass': return 'text-green-600'
      case 'warning': return 'text-yellow-600'
      case 'fail': return 'text-red-600'
      case 'checking': return 'text-blue-600'
      default: return 'text-gray-600'
    }
  }

  // 获取类别名称
  const getCategoryName = (category: string) => {
    const names = {
      'system': '系统兼容性',
      'shortcuts': '快捷键',
      'permissions': '权限',
      'security': '安全软件'
    }
    return names[category as keyof typeof names] || category
  }

  // 按类别分组结果
  const groupedResults = report?.results.reduce((acc, result) => {
    if (!acc[result.category]) {
      acc[result.category] = []
    }
    acc[result.category].push(result)
    return acc
  }, {} as Record<string, CompatibilityResult[]>) || {}

  // 导出报告
  const exportReport = () => {
    if (!report) return

    const reportText = generateReportText(report)
    const blob = new Blob([reportText], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `compatibility-report-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.txt`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  // 生成报告文本
  const generateReportText = (report: CompatibilityReport): string => {
    let text = `兼容性检测报告 - ${new Date(report.timestamp).toLocaleString()}\n`
    text += `系统: ${report.systemInfo.platform} ${report.systemInfo.version} (${report.systemInfo.arch})\n`
    text += `Electron: ${report.systemInfo.electronVersion}\n`
    text += `总体状态: ${report.overall === 'pass' ? '✅ 通过' : report.overall === 'warning' ? '⚠️ 警告' : '❌ 失败'}\n\n`

    Object.entries(groupedResults).forEach(([category, results]) => {
      text += `${getCategoryName(category)}:\n`
      results.forEach(result => {
        const statusIcon = getStatusIcon(result.status)
        text += `  ${statusIcon} ${result.name}: ${result.message}\n`
        if (result.details) {
          text += `     详情: ${result.details}\n`
        }
        if (result.solution) {
          text += `     解决方案: ${result.solution}\n`
        }
      })
      text += '\n'
    })

    return text
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => {
      console.log('🔄 对话框状态变化:', open)
      if (!open) {
        console.log('🔴 通过onOpenChange关闭兼容性检测报告')
        onClose()
      }
    }}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            🔍 系统兼容性检测
            {report && (
              <span className={`ml-2 ${getStatusColor(report.overall)}`}>
                {getStatusIcon(report.overall)} 
                {report.overall === 'pass' ? '检测通过' : 
                 report.overall === 'warning' ? '存在警告' : '发现问题'}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 控制按钮 */}
          <div className="flex gap-2">
            <Button 
              onClick={startCheck} 
              disabled={isChecking}
              variant="default"
            >
              {isChecking ? '正在检测...' : '开始检测'}
            </Button>
            
            {report && (
              <Button 
                onClick={exportReport}
                variant="outline"
              >
                导出报告
              </Button>
            )}
          </div>

          {/* 当前检测状态 */}
          {isChecking && currentCheck && (
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🔄</span>
                <div>
                  <div className="font-medium">正在检测: {currentCheck.name}</div>
                  <div className="text-sm text-gray-600">
                    {getCategoryName(currentCheck.category)}
                  </div>
                </div>
              </div>
            </Card>
          )}

          {/* 检测结果 */}
          {report && (
            <div className="space-y-4">
              {/* 系统信息 */}
              <Card className="p-4">
                <h3 className="font-semibold mb-2">系统信息</h3>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>操作系统: {report.systemInfo.platform}</div>
                  <div>版本: {report.systemInfo.version}</div>
                  <div>架构: {report.systemInfo.arch}</div>
                  <div>Electron: {report.systemInfo.electronVersion}</div>
                </div>
              </Card>

              {/* 检测结果按类别显示 */}
              {Object.entries(groupedResults).map(([category, results]) => (
                <Card key={category} className="p-4">
                  <h3 className="font-semibold mb-3">{getCategoryName(category)}</h3>
                  <div className="space-y-3">
                    {results.map((result, index) => (
                      <div key={index} className="border-l-4 border-gray-200 pl-4">
                        <div className="flex items-start gap-2">
                          <span className="text-xl">
                            {getStatusIcon(result.status)}
                          </span>
                          <div className="flex-1">
                            <div className="font-medium">{result.name}</div>
                            <div className={`text-sm ${getStatusColor(result.status)}`}>
                              {result.message}
                            </div>
                            {result.details && (
                              <div className="text-xs text-gray-500 mt-1">
                                详情: {result.details}
                              </div>
                            )}
                            {result.solution && (
                              <div className="text-sm text-blue-600 mt-2 p-2 bg-blue-50 rounded">
                                💡 解决方案: {result.solution}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}

              {/* 总结 */}
              <Card className="p-4">
                <div className="text-center">
                  <div className="text-2xl mb-2">
                    {getStatusIcon(report.overall)}
                  </div>
                  <div className={`text-lg font-semibold ${getStatusColor(report.overall)}`}>
                    {report.overall === 'pass' ? '系统兼容性良好，应用应该能正常运行' :
                     report.overall === 'warning' ? '存在一些警告，可能影响部分功能' :
                     '发现严重问题，可能影响应用正常运行'}
                  </div>
                  <div className="text-sm text-gray-600 mt-2">
                    检测时间: {new Date(report.timestamp).toLocaleString()}
                  </div>
                </div>
              </Card>

              {/* 快捷键提示 */}
              <div className="flex justify-center pt-4 border-t border-gray-700 mt-6">
                <div className="text-center text-gray-400 text-sm">
                  按 <span className="bg-gray-700 px-2 py-1 rounded font-mono">Ctrl+W</span> 关闭报告
                </div>
              </div>
            </div>
          )}

          {/* 空状态 */}
          {!isChecking && !report && (
            <Card className="p-8 text-center">
              <div className="text-6xl mb-4">🔍</div>
              <div className="text-lg font-medium mb-2">系统兼容性检测</div>
              <div className="text-gray-600 mb-4">
                检测快捷键、权限、防火墙和杀毒软件等可能影响应用运行的因素
              </div>
              <Button onClick={startCheck}>开始检测</Button>
            </Card>
          )}

        </div>
      </DialogContent>
    </Dialog>
  )
}

export default CompatibilityDialog