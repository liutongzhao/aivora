import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Smartphone, Play } from 'lucide-react'
import {
  ShortcutAction,
  shortcutDefinitions,
  defaultShortcutBindings,
  ShortcutDefinition
} from '../../shared/shortcuts'
import { formatShortcut } from '../utils/shortcutFormat'
import { config } from '../utils/config'
import { ClientSection, ClientSidebar } from '../components/ClientShell/ClientSidebar'
import { ClientTitleBar } from '../components/ClientShell/ClientTitleBar'
import { ModelPromptCenter } from '../components/ModelPromptCenter/ModelPromptCenter'
import { ConnectionSettings } from '../components/ConnectionSettings/ConnectionSettings'
import { WindowSettings } from '../components/WindowSettings/WindowSettings'
import { AccountSettings } from '../components/AccountSettings/AccountSettings'
import { ClientToast, ClientToastVariant } from '../components/ClientShell/ClientToast'
import {
  fetchUsageSummary,
  getUsageAvailability,
  getUsageMessage,
  type UsageSummary
} from '../services/usageEntitlement'

type ShortcutMap = Record<ShortcutAction, string>

interface ShortcutTestResult {
  action: ShortcutAction
  success: boolean
  message?: string
}

interface ShortcutConflict {
  action: ShortcutAction
  message: string
}

interface VersionInfo {
  current: string
  latest: string
  needsUpdate: boolean
  downloadUrl?: string
  releaseNotes?: string
}

export function ConfigPage() {
  const [user, setUser] = useState<any>(null)
  const [versionInfo, setVersionInfo] = useState<VersionInfo | null>(null)
  const [shortcuts, setShortcuts] = useState<ShortcutMap>({ ...defaultShortcutBindings })
  const [recordingAction, setRecordingAction] = useState<ShortcutAction | null>(null)
  const [recordingHint, setRecordingHint] = useState<string | null>(null)
  const [shortcutConflict, setShortcutConflict] = useState<ShortcutConflict | null>(null)
  const [testResult, setTestResult] = useState<ShortcutTestResult | null>(null)
  const [isTestingMode, setIsTestingMode] = useState(false)
  const [examClientLaunching, setExamClientLaunching] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [preferredTheme, setPreferredTheme] = useState<'dark' | 'light'>('dark')
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false)
  const [themeSelectionLoading, setThemeSelectionLoading] = useState<'dark' | 'light' | null>(null)
  const [toast, setToast] = useState<{ message: string; variant: ClientToastVariant } | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; remoteUrl: string } | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [pairingRemaining, setPairingRemaining] = useState(0)
  const [remoteConnectedAt, setRemoteConnectedAt] = useState<number | null>(null)
  const [remoteNow, setRemoteNow] = useState(Date.now())
  const [activeSection, setActiveSection] = useState<ClientSection>('models')
  const [promptDirty, setPromptDirty] = useState(false)
  const [usage, setUsage] = useState<UsageSummary | null>(null)
  const [usageLoading, setUsageLoading] = useState(true)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showToast = useCallback((message: string, variant: ClientToastVariant = 'info') => {
    setToast({ message, variant })
    if (toastTimer.current) {
      clearTimeout(toastTimer.current)
    }
    toastTimer.current = setTimeout(() => setToast(null), 2800)
  }, [])

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current)
      }
    }
  }, [])

  const showToastMessage = useCallback((message: string, success: boolean) => {
    showToast(message, success ? 'success' : 'error')
  }, [showToast])

  const refreshUsage = useCallback(async () => {
    if (!window.electronAPI?.apiRequest) {
      setUsageLoading(false)
      return null
    }

    setUsageLoading(true)
    try {
      const nextUsage = await fetchUsageSummary()
      setUsage(nextUsage)
      return nextUsage
    } catch (error) {
      console.error('获取账号使用资格失败:', error)
      setUsage(null)
      return null
    } finally {
      setUsageLoading(false)
    }
  }, [])

  useEffect(() => {
    const init = async () => {
      try {
        const status = await window.electronAPI.webAuthStatus()
        if (status.user) {
          setUser(status.user)
        }
        const appVersion = await window.electronAPI.getAppVersion?.()
        setVersionInfo(status.version || {
          current: appVersion?.version || '开发版',
          latest: appVersion?.version || '开发版',
          needsUpdate: false,
        })
      } catch (error) {
        console.error('获取认证信息失败:', error)
      }

      await refreshUsage()

      try {
        const bindings = await window.electronAPI.getShortcutBindings()
        setShortcuts(bindings)
      } catch (error) {
        console.error('获取快捷键映射失败:', error)
      }
    }

    init()
    const unsubscribeTest = window.electronAPI.onShortcutTestResult?.((result) => {
      setTestResult(result)
      if (result.message) {
        showToastMessage(result.message, result.success)
      }
    })

    return () => {
      unsubscribeTest?.()
    }
  }, [refreshUsage, showToastMessage])

  useEffect(() => {
    const unsubscribeRemote = window.electronAPI.remoteControl?.onState((state) => {
      if (state.connected) {
        setPairing(null)
        setRemoteConnectedAt(state.connectedAt || Date.now())
        showToast('手机已连接到桌面端', 'success')
      }
      if (state.code && state.expiresAt) {
        setPairing((current) => ({
          code: state.code!,
          expiresAt: state.expiresAt!,
          remoteUrl: state.remoteUrl || current?.remoteUrl || `${config.web.baseUrl}/remote`
        }))
      }
      if (!state.connected && (state.status === 'replaced' || state.status === 'disconnected')) {
        setPairing(null)
        setRemoteConnectedAt(null)
      }
      if (state.status === 'closed') setRemoteConnectedAt(null)
      if (state.error) {
        showToast(state.error, 'error')
      }
    })
    return () => unsubscribeRemote?.()
  }, [showToast])

  useEffect(() => {
    if (!pairing) {
      setPairingRemaining(0)
      return
    }
    const updateRemaining = () => setPairingRemaining(Math.max(0, pairing.expiresAt - Date.now()))
    updateRemaining()
    const timer = window.setInterval(updateRemaining, 1000)
    return () => window.clearInterval(timer)
  }, [pairing])
  useEffect(() => {
    if (!remoteConnectedAt) return
    const timer = window.setInterval(() => setRemoteNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [remoteConnectedAt])

  const handleStartRecording = (action: ShortcutAction) => {
    setRecordingAction(action)
    setRecordingHint('请按下新的快捷键组合（至少包含Ctrl/Cmd）')
    setShortcutConflict(null)
    setTestResult(null)
  }
  useEffect(() => {
    const loadThemePreference = async () => {
      try {
        const result = await window.electronAPI.getClientTheme?.()
        if (result?.theme) {
          setPreferredTheme(result.theme)
        }
      } catch (error) {
        console.error('获取主题失败:', error)
      }
    }
    loadThemePreference()
  }, [])

  const handleUpdateBinding = useCallback(
    async (action: ShortcutAction, accelerator: string) => {
      try {
        const currentBindings = await window.electronAPI.getShortcutBindings()
        const conflict = Object.entries(currentBindings as ShortcutMap).find(
          ([otherAction, binding]) => otherAction !== action && binding === accelerator
        ) as [string, string] | undefined

        if (conflict) {
          const label = shortcutDefinitions.find(def => def.action === conflict[0] as ShortcutAction)?.label || '其它快捷键'
          const conflictMessage = `快捷键冲突：已被 ${label}`
          setShortcutConflict({ action, message: conflictMessage })
          setRecordingAction(null)
          return
        }

        const result = await window.electronAPI.updateShortcutBinding({ action, accelerator })
        if (result.success && result.bindings) {
          setShortcuts(result.bindings)
          setRecordingHint(null)
          setShortcutConflict(null)
          setRecordingAction(null)
          window.electronAPI.syncUserShortcuts?.(result.bindings).catch((syncError: any) => {
            console.error('同步用户快捷键失败:', syncError)
          })
        } else {
          setRecordingHint(result.error || '保存快捷键失败')
        }
      } catch (error) {
        console.error('更新快捷键失败:', error)
        setRecordingHint('保存快捷键失败，请重试')
      }
    },
    [showToastMessage]
  )

  const handleRestoreDefaults = useCallback(async () => {
    setShortcutConflict(null)
    setRecordingHint(null)
    try {
      const results = await Promise.all(
        Object.entries(defaultShortcutBindings).map(([action, accelerator]) =>
          window.electronAPI.updateShortcutBinding({
            action: action as ShortcutAction,
            accelerator
          })
        )
      )
      const latest = results.find(result => result.success && result.bindings)?.bindings
      setShortcuts(latest || { ...defaultShortcutBindings })
      showToast('已恢复默认快捷键', 'success')
    } catch (error) {
      console.error('恢复默认快捷键失败:', error)
      setRecordingHint('恢复默认快捷键失败，请重试')
    }
  }, [showToast])

  useEffect(() => {
    if (!recordingAction) return

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      const accelerator = buildAccelerator(event)
      if (!accelerator) {
        setRecordingHint('请至少包含Ctrl/Cmd或Alt键')
        return
      }
      handleUpdateBinding(recordingAction, accelerator)
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true)
    }
  }, [recordingAction, handleUpdateBinding])

  useEffect(() => {
    if (!recordingAction) return

    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 3 && event.button !== 4) {
        return
      }
      event.preventDefault()
      event.stopPropagation()
      const mousePart = event.button === 3 ? 'MouseButton4' : 'MouseButton5'
      const parts: string[] = []
      if (event.metaKey || event.ctrlKey) {
        parts.push('CommandOrControl')
      } else if (event.altKey) {
        parts.push('Alt')
      }
      if (event.shiftKey) {
        parts.push('Shift')
      }
      parts.push(mousePart)
      handleUpdateBinding(recordingAction, parts.join('+'))
    }

    window.addEventListener('pointerdown', handlePointerDown, true)
    return () => window.removeEventListener('pointerdown', handlePointerDown, true)
  }, [recordingAction, handleUpdateBinding])

  const handleLaunchExamClient = async () => {
    if (examClientLaunching) return
    const latestUsage = await refreshUsage()
    if (!latestUsage || !getUsageAvailability(latestUsage).allowed) {
      showToast(
        latestUsage
          ? getUsageMessage(latestUsage)
          : '无法检查账号使用资格，请检查网络连接后重试',
        'error'
      )
      return
    }
    setTestResult(null)
    setIsThemeDialogOpen(true)
  }

  const handleThemeSelection = async (theme: 'dark' | 'light') => {
    if (themeSelectionLoading) return
    setThemeSelectionLoading(theme)
    setTestResult(null)
    try {
      await window.electronAPI.setClientTheme?.(theme)
      setPreferredTheme(theme)
      setExamClientLaunching(true)
      const result = await window.electronAPI.openExamClient()
      if (!result.success) {
        setExamClientLaunching(false)
        setTestResult({ action: 'programming', success: false, message: result.error || '无法打开考试窗口' })
        setIsThemeDialogOpen(false)
      } else {
        setIsThemeDialogOpen(false)
      }
    } catch (error) {
      console.error('打开考试客户端失败:', error)
      setExamClientLaunching(false)
      setTestResult({ action: 'programming', success: false, message: '无法启动考试窗口' })
      setIsThemeDialogOpen(false)
    } finally {
      setThemeSelectionLoading(null)
    }
  }

  const themeOptions = [
    {
      key: 'dark' as const,
      title: '黑色主题',
      description: '低光环境下更专注',
      previewClass: 'bg-slate-900 text-white',
      recommended: true
    },
    {
      key: 'light' as const,
      title: '白色主题',
      description: '亮色环境下更清晰',
      previewClass: 'bg-white text-slate-900 border border-amber-400 shadow-[0_0_0_3px_rgba(245,158,11,0.45)]'
    }
  ]

  const handleCheckUpdate = async () => {
    setUpdateChecking(true)
    try {
      const result = await window.electronAPI.checkForUpdates()
      if (!result?.success) {
        throw new Error(result?.error || '检查更新失败')
      }
      showToast(
        result.updateInfo
          ? `已完成检查，当前最新版本为 ${result.updateInfo.version}`
          : '已完成更新检查',
        'success'
      )
    } catch (error) {
      console.error('检测更新失败:', error)
      showToast('检测更新失败，请稍后再试', 'error')
    } finally {
      setUpdateChecking(false)
    }
  }

  const handleCreatePairing = async () => {
    if (pairingLoading) return
    setPairingLoading(true)
    try {
      const result = await window.electronAPI.remoteControl?.createPairing()
      if (!result?.success || !result.code || !result.expiresAt || !result.remoteUrl) {
        throw new Error(result?.error || '生成手机连接码失败')
      }
      setPairing({ code: result.code, expiresAt: result.expiresAt, remoteUrl: result.remoteUrl })
      setRemoteConnectedAt(null)
      showToast('连接码已生成，有效期 5 分钟', 'success')
    } catch (error: any) {
      showToast(error?.message || '生成手机连接码失败', 'error')
    } finally {
      setPairingLoading(false)
    }
  }

  const handleCopyPairingPart = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showToast(`${label}已复制`, 'success')
    } catch (_) {
      showToast('复制失败，请手动记录', 'error')
    }
  }

  const handleDisconnectPairing = async () => {
    const result = await window.electronAPI.remoteControl?.disconnect()
    if (result?.success === false) { showToast(result.error || '结束远程控制失败', 'error'); return }
    setPairing(null)
    setRemoteConnectedAt(null)
    showToast('手机远程控制已结束', 'success')
  }

  const shortcutsRef = useRef<HTMLDivElement>(null)
  const testingRef = useRef<HTMLDivElement>(null)
  const remoteRef = useRef<HTMLElement>(null)

  const shortcutGroups = useMemo(() => {
    const groups: Array<{ key: string; label: string; categories: ShortcutDefinition['category'][]; definitions: ShortcutDefinition[] }> = [
      { key: 'capture', label: '截屏与识别', categories: ['capture', 'process'], definitions: [] },
      { key: 'window', label: '窗口与显示', categories: ['window', 'view'], definitions: [] },
      { key: 'content', label: '内容与辅助', categories: ['system', 'scroll'], definitions: [] },
      { key: 'utility', label: '账户与连接', categories: ['utility'], definitions: [] },
    ]
    shortcutDefinitions.forEach((definition) => {
      groups.find((group) => group.categories.includes(definition.category))?.definitions.push(definition)
    })
    return groups
  }, [])

  const scrollToSection = (section: ClientSection) => {
    if (section === activeSection) return
    if (activeSection === 'models' && promptDirty && !window.confirm('提示词尚未保存，确定放弃修改吗？')) return
    setPromptDirty(false)
    setActiveSection(section)
  }

  return (
    <div className="client-settings">
      <ClientTitleBar />
      <ClientSidebar activeSection={activeSection} onSelect={scrollToSection} />
      <main className="client-settings-content space-y-8" data-active-section={activeSection}>
        <div className="client-page-actions">
          {activeSection === 'models' && (
            <button
              className="client-button client-button-primary"
              onClick={() => void handleLaunchExamClient()}
              disabled={examClientLaunching || usageLoading || !usage || !getUsageAvailability(usage).allowed}
            >
              <Play size={16} aria-hidden="true" />
              {examClientLaunching
                ? '启动中...'
                : usageLoading
                  ? '检查使用资格...'
                  : '开始使用'}
            </button>
          )}
        </div>

        {activeSection === 'models' && (
          <section data-client-page="models" className="border-b border-slate-200 py-4">
            <div
              className={`flex items-start gap-3 rounded-lg border px-4 py-3 ${
                usage && getUsageAvailability(usage).allowed
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
              role={usage && getUsageAvailability(usage).allowed ? 'status' : 'alert'}
            >
              <div className="min-w-0">
                <p className="font-medium">
                  {usageLoading
                    ? '正在检查账号使用资格'
                    : usage
                      ? getUsageMessage(usage)
                      : '无法检查账号使用资格'}
                </p>
                <p className="mt-1 text-sm opacity-80">
                  {usage && getUsageAvailability(usage).allowed
                    ? '可以开始使用，系统会在服务端自动记录本次使用。'
                    : '没有可用次数或有效授权时，开始使用按钮会保持禁用。'}
                </p>
              </div>
            </div>
          </section>
        )}

        <section data-client-page="connection" className="client-update-action">
          <button type="button" className="client-button client-button-secondary" onClick={handleCheckUpdate} disabled={updateChecking}>
            <RefreshCw size={16} className={updateChecking ? 'animate-spin' : ''} aria-hidden="true" />
            {updateChecking ? '检测中...' : '检测更新'}
          </button>
        </section>

        {versionInfo?.needsUpdate && (
          <div data-client-page="connection" className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 text-amber-600 text-sm font-medium">
                <span className="inline-flex h-2.5 w-2.5 rounded-full bg-amber-500"></span>
                发现新版本：当前 {versionInfo.current} → 最新 {versionInfo.latest}
              </div>
              <p className="text-sm text-slate-500">{versionInfo.releaseNotes || '修复已知问题，建议尽快更新。'}</p>
              {versionInfo.downloadUrl && (
                <button
                  className="self-start rounded-2xl border border-amber-200 px-4 py-2 text-xs font-medium text-amber-600 hover:bg-amber-50"
                  onClick={() => window.electronAPI.downloadLatestVersion?.(versionInfo.downloadUrl!)}
                >
                  直接下载
                </button>
              )}
            </div>
          </div>
        )}

        <section data-client-page="connection" className="client-placeholder-panel">
          <ConnectionSettings onNotify={showToast} />
        </section>

        <section ref={remoteRef} data-client-page="connection" className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">手机远程控制</h2>
              <p className="mt-1 text-sm text-slate-500">生成连接码后，在手机 Web 端输入连接码即可控制客户端。</p>
            </div>
            {!pairing && !remoteConnectedAt && (
              <button
                className="inline-flex h-10 w-44 max-w-full shrink-0 items-center justify-center gap-2 self-start rounded-lg bg-blue-600 px-3 text-sm font-medium text-[#ffffff] shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 md:self-center"
                onClick={handleCreatePairing}
                disabled={pairingLoading}
              >
                {pairingLoading ? <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" /> : <Smartphone size={16} className="shrink-0" aria-hidden="true" />}
                {pairingLoading ? '生成中...' : '生成手机连接码'}
              </button>
            )}
          </div>
          {remoteConnectedAt && <div className="mt-4 flex items-center justify-between gap-3 text-sm"><span>手机已连接 · 已连接 {Math.floor((remoteNow - remoteConnectedAt) / 60000)}分{String(Math.floor(((remoteNow - remoteConnectedAt) % 60000) / 1000)).padStart(2, '0')}秒</span><button className="text-rose-600" onClick={handleDisconnectPairing}>结束远程控制</button></div>}
          {pairing && (
            <div className="client-pairing-details mt-4 rounded-2xl border border-blue-100 bg-blue-50 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="text-xs text-blue-700">手机访问地址</div>
                  <div className="break-all text-sm text-blue-900">{pairing.remoteUrl}</div>
                </div>
                <div className="text-left sm:text-right">
                  <div className={`text-xs font-medium ${pairingRemaining > 0 ? 'text-blue-700' : 'text-rose-600'}`}>
                    {pairingRemaining > 0
                      ? `连接码有效期 ${Math.floor(pairingRemaining / 60000)}:${String(Math.floor((pairingRemaining % 60000) / 1000)).padStart(2, '0')}`
                      : '连接码已过期'}
                  </div>
                  <code className={`remote-pairing-code text-2xl font-bold tracking-[0.25em] ${pairingRemaining <= 0 ? 'text-slate-400 line-through' : ''}`}>{pairing.code}</code>
                </div>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                  onClick={() => handleCopyPairingPart(pairing.remoteUrl, '访问地址')}
                  disabled={pairingRemaining <= 0}
                >
                  复制访问地址
                </button>
                <button
                  className="rounded-xl border border-blue-200 bg-white px-3 py-2 text-sm font-medium text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => handleCopyPairingPart(pairing.code, '连接码')}
                  disabled={pairingRemaining <= 0}
                >
                  复制连接码
                </button>
                <button
                  className="inline-flex h-10 w-44 max-w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-3 text-sm font-medium text-[#ffffff] shadow-sm transition-colors hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleCreatePairing}
                  disabled={pairingLoading}
                >
                  {pairingLoading ? <Loader2 size={16} className="shrink-0 animate-spin" aria-hidden="true" /> : <RefreshCw size={16} className="shrink-0" aria-hidden="true" />}
                  {pairingLoading ? '生成中...' : '重新生成连接码'}
                </button>
                <button
                  className="rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50"
                  onClick={handleDisconnectPairing}
                >
                  结束远程控制
                </button>
              </div>
            </div>
          )}
        </section>

        <section ref={shortcutsRef} data-client-page="shortcuts" className="rounded-3xl border border-slate-100 bg-white p-6 space-y-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">快捷键管理</h2>
            </div>
          </div>


          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600"
          >
            恢复默认快捷键
          </button>

          <div className="shortcut-groups">
            {shortcutGroups.map((group) => (
              <section className="shortcut-group" key={group.key} aria-labelledby={`shortcut-group-${group.key}`}>
                <h3 id={`shortcut-group-${group.key}`}>{group.label}</h3>
                <div className="shortcut-group-list">
                  {group.definitions.map((definition) => (
                    <div key={definition.action} className="shortcut-row">
                      <div>
                        <p className="font-medium text-slate-900">{definition.label}</p>
                        <p className="text-xs text-slate-500">{definition.description}</p>
                      </div>
                      <div className="shortcut-combo">
                        {recordingAction === definition.action ? (
                          <span className="text-rose-500 font-semibold">按下新快捷键...</span>
                        ) : (
                          formatShortcut(shortcuts[definition.action])
                        )}
                      </div>
                      <div className="shortcut-row-action">
                        <button
                          className="client-button client-button-secondary"
                          onClick={() => handleStartRecording(definition.action)}
                        >
                          更改
                        </button>
                      </div>
                      {shortcutConflict?.action === definition.action && (
                        <p className="shortcut-conflict" role="alert">
                          {shortcutConflict.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>

          {recordingHint && (
            <p className="text-xs text-amber-600">{recordingHint}</p>
          )}
        </section>

        <section ref={testingRef} data-client-page="shortcuts" className="rounded-3xl border border-slate-100 bg-white p-6 space-y-4 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">快捷键生效验证</h2>
              <p className="text-sm text-slate-500">
                点击“开始测试”会弹出黑色考试窗口。按下快捷键验证后，点击“结束测试”即可关闭窗口。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                onClick={async () => {
                  setTestResult(null)
                  try {
                    const result = await window.electronAPI.startShortcutTestMode?.()
                    if (result?.success) {
                      setIsTestingMode(true)
                      setTestResult({ action: 'programming', success: true, message: '已进入测试模式，请在黑色窗口中尝试快捷键' })
                      showToast('已进入测试模式，请在考试窗口中尝试快捷键', 'success')
                    } else {
                      setTestResult({ action: 'programming', success: false, message: result?.error || '无法开启测试模式' })
                      showToast(result?.error || '无法开启测试模式', 'error')
                    }
                  } catch (error) {
                    console.error('启动测试模式失败:', error)
                    setTestResult({ action: 'programming', success: false, message: '无法开启测试模式' })
                    showToast('无法开启测试模式', 'error')
                  }
                }}
                disabled={isTestingMode}
              >
                开始测试
              </button>
              <button
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600 disabled:opacity-50"
                onClick={async () => {
                  try {
                    const result = await window.electronAPI.stopShortcutTestMode?.()
                    if (result?.success) {
                      setIsTestingMode(false)
                      setTestResult({ action: 'programming', success: true, message: '已退出测试模式' })
                      showToast('已退出测试模式', 'success')
                    } else {
                      setTestResult({ action: 'programming', success: false, message: result?.error || '无法退出测试模式' })
                      showToast(result?.error || '无法退出测试模式', 'error')
                    }
                  } catch (error) {
                    console.error('退出测试模式失败:', error)
                    setTestResult({ action: 'programming', success: false, message: '无法退出测试模式' })
                    showToast('无法退出测试模式', 'error')
                  }
                }}
                disabled={!isTestingMode}
              >
                结束测试
              </button>
            </div>
          </div>
        </section>

        <section data-client-page="models" className="client-placeholder-panel">
          <ModelPromptCenter visible={activeSection === 'models'} onDirtyChange={setPromptDirty} onNotify={showToast} />
        </section>

        <section data-client-page="window" className="client-placeholder-panel">
          <WindowSettings onNotify={showToast} />
        </section>

        <section data-client-page="account" className="client-placeholder-panel">
          <AccountSettings user={user} version={versionInfo} onNotify={showToast} />
        </section>

      {isThemeDialogOpen && (
        <div className="client-theme-dialog fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-4 pt-10 sm:pt-14">
          <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">选择客户端主题</h3>
                <p className="text-sm text-slate-500">开启考试客户端前请选择界面样式</p>
              </div>
              <button
                className="text-sm text-slate-400 hover:text-slate-600"
                onClick={() => {
                  setIsThemeDialogOpen(false)
                  setThemeSelectionLoading(null)
                }}
              >
                取消
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {themeOptions.map(option => (
                <button
                  key={option.key}
                  disabled={!!themeSelectionLoading}
                  onClick={() => handleThemeSelection(option.key)}
                  className={`relative rounded-2xl border px-4 py-4 text-left transition focus:outline-none ${
                    preferredTheme === option.key
                      ? 'border-blue-500 shadow-[0_0_0_3px_rgba(59,130,246,0.15)]'
                      : option.recommended
                        ? 'border-amber-400 bg-amber-50/60'
                        : 'border-slate-200 hover:border-blue-300'
                  } ${themeSelectionLoading && themeSelectionLoading !== option.key ? 'opacity-60' : ''}`}
                >
                  {option.recommended && (
                    <span className="absolute -top-3 right-3 rounded-full bg-amber-400 px-3 py-0.5 text-sm font-semibold text-white">
                      推荐
                    </span>
                  )}
                  <div className="mb-3 h-24 rounded-xl overflow-hidden border border-slate-100">
                    <div className={`h-full w-full ${option.previewClass} flex flex-col justify-between p-3 text-xs`}>
                      <div className="flex justify-between">
                        <span>标题</span>
                        <span>导航</span>
                      </div>
                      <div className="rounded-md border border-current/20 px-2 py-1 text-[11px]">
                        内容区域
                      </div>
                    </div>
                  </div>
                  <div className="font-medium text-slate-900 flex items-center justify-between">
                    <span>{option.title}</span>
                    {themeSelectionLoading === option.key && (
                      <span className="text-xs text-blue-500">启动中...</span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{option.description}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      </main>

      {toast && <ClientToast message={toast.message} variant={toast.variant} />}
    </div>
  )
}

function buildAccelerator(event: KeyboardEvent): string | null {
  const parts: string[] = []
  if (event.metaKey || event.ctrlKey) {
    parts.push('CommandOrControl')
  } else if (event.altKey) {
    parts.push('Alt')
  }
  if (event.shiftKey) {
    parts.push('Shift')
  }

  const key = normalizeKey(event.key)
  if (!key) {
    return null
  }
  parts.push(key)
  return parts.join('+')
}

function normalizeKey(key: string): string | null {
  if (!key) return null
  const upper = key.length === 1 ? key.toUpperCase() : key
  if (/^[A-Z0-9]$/.test(upper)) {
    return upper
  }
  const specialMap: Record<string, string> = {
    Escape: 'Esc',
    Backspace: 'Backspace',
    Enter: 'Enter',
    Tab: 'Tab',
    ArrowUp: 'Up',
    ArrowDown: 'Down',
    ArrowLeft: 'Left',
    ArrowRight: 'Right',
    '.': '.',
    ',': ',',
    ';': ';',
    '/': '/',
    "'": "'",
    '[': '[',
    ']': ']',
    '!': '1',
    '@': '2',
    '#': '3',
    '$': '4',
    '%': '5',
    '^': '6',
    '&': '7',
    '*': '8',
    '(': '9',
    ')': '0'
  }
  return specialMap[upper] || null
}

export default ConfigPage
