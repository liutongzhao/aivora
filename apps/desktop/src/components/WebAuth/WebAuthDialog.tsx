import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog'
import { Button } from '../ui/button'
import { useWebAuth } from '../../hooks/useWebAuth'
import { Loader2, ExternalLink, AlertCircle, Wifi, WifiOff } from 'lucide-react'

interface WebAuthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function WebAuthDialog({ open, onOpenChange }: WebAuthDialogProps) {
  const {
    authenticated,
    user,
    loading,
    error,
    connectionStatus,
    login,
    logout,
    checkConnection,
  } = useWebAuth()

  const handleLogin = async () => {
    const result = await login()
    if (result.success) {
      // 登录成功后可以选择关闭对话框
      // onOpenChange(false)
    }
  }

  const handleLogout = async () => {
    await logout()
  }

  const handleRetryConnection = async () => {
    await checkConnection()
  }

  return (
      <Dialog open={open} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ExternalLink className="h-5 w-5" />
              Web配置中心
            </DialogTitle>
            <DialogDescription>
              通过Web界面管理AI模型和应用配置
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
            {/* 连接状态显示 */}
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
              {connectionStatus.checking ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
              ) : connectionStatus.connected ? (
                  <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                  <WifiOff className="h-4 w-4 text-red-600" />
              )}
              <span className="text-sm font-medium text-black">
              Web服务器: {' '}
                {connectionStatus.checking
                    ? '检查中...'
                    : connectionStatus.connected
                        ? '已连接'
                        : '未连接'
                }
            </span>
            </div>

            {/* 认证状态显示 */}
            {connectionStatus.connected && (
                <div className="space-y-3">
                  {loading ? (
                      <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin mr-2" />
                        <span>检查认证状态...</span>
                      </div>
                  ) : authenticated ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                          <div className="h-2 w-2 bg-green-500 rounded-full"></div>
                          <span className="text-sm font-medium text-green-400">
                      已登录为: {user?.username}
                    </span>
                        </div>

                        <div className="text-sm text-gray-300">
                          <p>您已成功登录Web配置中心。现在可以：</p >
                          <ul className="mt-2 space-y-1 list-disc list-inside">
                            <li>选择和配置AI模型</li>
                            <li>管理应用设置</li>
                            <li>同步配置到客户端</li>
                          </ul>
                        </div>
                      </div>
                  ) : (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertCircle className="h-4 w-4 text-yellow-600" />
                          <span className="text-sm font-medium text-black">
                      需要登录Web配置中心
                    </span>
                        </div>

                        <div className="text-sm text-gray-300">
                          <p>点击下方按钮将打开Web配置中心登录页面。</p >
                          <p className="mt-1">登录后，您的配置将自动同步到客户端。</p >
                        </div>
                      </div>
                  )}

                  {/* 错误信息显示 */}
                  {error && (
                      <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-red-600" />
                          <span className="text-sm font-medium text-red-400">错误</span>
                        </div>
                        <p className="text-sm text-red-300 mt-1">{error}</p >
                      </div>
                  )}
                </div>
            )}

            {/* 未连接状态的帮助信息 */}
            {!connectionStatus.connected && !connectionStatus.checking && (
                <div className="space-y-3">
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-4 w-4 text-red-600" />
                      <span className="text-sm font-medium text-red-400">无法连接到Web服务器</span>
                    </div>
                    <p className="text-sm text-red-300 mt-1">
                      请确保Web配置中心正在运行
                    </p >
                  </div>

                  <div className="text-sm text-gray-300">
                    <p className="font-medium">启动Web配置中心：</p >
                    <ol className="mt-2 space-y-1 list-decimal list-inside">
                      <li>打开命令行终端</li>
                      <li>切换到web目录</li>
                      <li>运行: <code className="bg-gray-100 px-1 rounded">npm run dev</code></li>
                      <li>或双击: <code className="bg-gray-100 px-1 rounded">启动脚本.bat</code></li>
                    </ol>
                  </div>
                </div>
            )}
          </div>

          <div className="text-center text-xs text-gray-500 mb-2 font-bold">
            按 Ctrl+Q / Cmd+Q 可退出该界面
          </div>

          <DialogFooter className="flex justify-between">
            <div className="flex gap-2">
              {!connectionStatus.connected && (
                  <Button
                      variant="outline"
                      onClick={handleRetryConnection}
                      disabled={connectionStatus.checking}
                  >
                    {connectionStatus.checking ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : null}
                    重新检查连接
                  </Button>
              )}
            </div>

            <div className="flex gap-2 w-full justify-center">
              {connectionStatus.connected && (
                  <>
                    {authenticated ? (
                        <Button
                            variant="outline"
                            onClick={handleLogout}
                            disabled={loading}
                        >
                          {loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : null}
                          登出
                        </Button>
                    ) : (
                        <Button
                            onClick={handleLogin}
                            disabled={loading}
                        >
                          {loading ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                          ) : (
                              <ExternalLink className="h-4 w-4 mr-2" />
                          )}
                          打开Web登录
                        </Button>
                    )}
                  </>
              )}

            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
  )
}