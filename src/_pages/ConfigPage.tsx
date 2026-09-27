import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, RefreshCw, Smartphone, Play, LogOut } from 'lucide-react'
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

type ShortcutMap = Record<ShortcutAction, string>

const HIGHLIGHT_ADVANCED_ACTIONS: ShortcutAction[] = [
  'reset',
  'toggleWindow',
  'moveWindowLeft',
  'moveWindowRight',
  'moveWindowUp',
  'moveWindowDown',
  'scrollCodeLeft',
  'scrollCodeRight',
  'scrollCodeUp',
  'scrollCodeDown',
  'decreaseWindowWidth',
  'increaseWindowWidth',
  'decreaseWindowHeight',
  'increaseWindowHeight',
  'decreaseOpacity',
  'increaseOpacity',
  'decreaseOpacityAlt',
  'increaseOpacityAlt',
  'copyCode',
  'deleteLastScreenshot'
]

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
  const [logoutLoading, setLogoutLoading] = useState(false)
  const [updateChecking, setUpdateChecking] = useState(false)
  const [preferredTheme, setPreferredTheme] = useState<'dark' | 'light'>('dark')
  const [isThemeDialogOpen, setIsThemeDialogOpen] = useState(false)
  const [themeSelectionLoading, setThemeSelectionLoading] = useState<'dark' | 'light' | null>(null)
  const [centerNotice, setCenterNotice] = useState<string | null>(null)
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number; remoteUrl: string } | null>(null)
  const [pairingLoading, setPairingLoading] = useState(false)
  const [pairingRemaining, setPairingRemaining] = useState(0)
  const [activeSection, setActiveSection] = useState<ClientSection>('overview')
  const centerNoticeTimer = useRef<NodeJS.Timeout | null>(null)

  const showCenterNotice = useCallback((message: string) => {
    setCenterNotice(message)
    if (centerNoticeTimer.current) {
      clearTimeout(centerNoticeTimer.current)
    }
    centerNoticeTimer.current = setTimeout(() => {
      setCenterNotice(null)
      centerNoticeTimer.current = null
    }, 2000)
  }, [])

  useEffect(() => {
    return () => {
      if (centerNoticeTimer.current) {
        clearTimeout(centerNoticeTimer.current)
      }
    }
  }, [])

  const showToastMessage = useCallback((message: string, success: boolean) => {
    showCenterNotice(message)
  }, [showCenterNotice])

  useEffect(() => {
    const init = async () => {
      try {
        const status = await window.electronAPI.webAuthStatus()
        if (status.user) {
          setUser(status.user)
        }
        if (status.version) {
          setVersionInfo(status.version)
        }
      } catch (error) {
        console.error('获取认证信息失败:', error)
      }

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
  }, [showToastMessage])

  useEffect(() => {
    const unsubscribeRemote = window.electronAPI.remoteControl?.onState((state) => {
      if (state.code && state.expiresAt) {
        setPairing((current) => ({
          code: state.code!,
          expiresAt: state.expiresAt!,
          remoteUrl: state.remoteUrl || current?.remoteUrl || `${config.web.baseUrl}/remote`
        }))
      }
      if (state.error) {
        showCenterNotice(state.error)
      }
    })
    return () => unsubscribeRemote?.()
  }, [showCenterNotice])

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
      showCenterNotice('已恢复默认快捷键')
    } catch (error) {
      console.error('恢复默认快捷键失败:', error)
      setRecordingHint('恢复默认快捷键失败，请重试')
    }
  }, [showCenterNotice])

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

  const handleLogout = async () => {
    if (logoutLoading) return
    setLogoutLoading(true)
    try {
      const result = await window.electronAPI.webAuthLogout()
      if (!result.success) {
        console.error('登出失败:', result.error)
      }
    } catch (error) {
      console.error('登出失败:', error)
    } finally {
      setLogoutLoading(false)
    }
  }

  const handleLaunchExamClient = () => {
    if (examClientLaunching) return
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
      const status = await window.electronAPI.webAuthStatus()
      if (status.version) {
        setVersionInfo(status.version)

        if (!status.version.needsUpdate) {
          showCenterNotice('您已是最新版本')
        }
      }
    } catch (error) {
      console.error('检测更新失败:', error)
      showCenterNotice('检测更新失败，请稍后再试')
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
      showCenterNotice('连接码已生成，有效期 2 分钟')
    } catch (error: any) {
      showCenterNotice(error?.message || '生成手机连接码失败')
    } finally {
      setPairingLoading(false)
    }
  }

  const handleCopyPairingPart = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      showCenterNotice(`${label}已复制`)
    } catch (_) {
      showCenterNotice('复制失败，请手动记录')
    }
  }

  const handleDisconnectPairing = async () => {
    await window.electronAPI.remoteControl?.disconnect()
    setPairing(null)
    showCenterNotice('手机远程控制已结束')
  }

  const shortcutsRef = useRef<HTMLDivElement>(null)
  const testingRef = useRef<HTMLDivElement>(null)
  const commonSectionRef = useRef<HTMLDivElement>(null)
  const advancedSectionRef = useRef<HTMLDivElement>(null)
  const overviewRef = useRef<HTMLElement>(null)
  const remoteRef = useRef<HTMLElement>(null)

  const shortcutGroups = useMemo(() => {
    const groups: Record<'common' | 'advanced', ShortcutDefinition[]> = {
      common: [],
      advanced: []
    }
    shortcutDefinitions.forEach((definition) => {
      if (['capture', 'process'].includes(definition.category) || definition.action === 'createRemotePairing') {
        groups.common.push(definition)
      } else {
        groups.advanced.push(definition)
      }
    })
    return groups
  }, [])

  const highlightActionSet = useMemo(() => new Set<ShortcutAction>(HIGHLIGHT_ADVANCED_ACTIONS), [])

  const advancedHighlightShortcuts = useMemo(() => [
    {
      key: 'exit-app',
      title: '退出软件',
      combo: 'Ctrl + Q',
      description: '快捷退出客户端，重新打开即可刷新配置页',
      tag: '通用操作'
    },
    {
      key: 'clear-queue',
      title: '清空当前截图',
      combo: formatShortcut(shortcuts.reset) || 'Ctrl + R',
      description: '重置并删除当前所有截图',
      tag: '系统固定'
    },
    {
      key: 'toggle-window',
      title: '显示/隐藏考试窗口',
      combo: formatShortcut(shortcuts.toggleWindow) || 'Ctrl + B',
      description: '黑色考试窗口的显示开关',
      tag: '系统固定'
    },
    {
      key: 'move-window',
      title: '移动窗口',
      combo: 'Ctrl + ↑ / ↓ / ← / →',
      description: '微调窗口位置，方向键控制移动方向',
      tag: '系统固定'
    },
    {
      key: 'move-content',
      title: '移动窗口内部内容',
      combo: 'Ctrl + Shift + ↑ / ↓ / ← / →',
      description: '滚动窗口内的代码或答案内容',
      tag: '系统固定'
    },
    {
      key: 'resize-window',
      title: '调整窗口大小',
      combo: 'Ctrl + Shift + 3 / 4 / 5 / 6',
      note: '3/4 控制宽度，5/6 控制高度',
      tag: '系统固定'
    },
    {
      key: 'opacity-main',
      title: '调整窗口透明度',
      combo: 'Ctrl + Shift + 1 / 2',
      note: '1 = 调亮，2 = 调暗',
      tag: '系统固定'
    },
    {
      key: 'opacity-backup',
      title: '透明度备用按键',
      combo: 'Ctrl + [ / Ctrl + ]',
      description: '备用键位，与上方效果一致',
      tag: '系统固定'
    },
    {
      key: 'copy-code',
      title: '复制答题内容',
      combo: formatShortcut(shortcuts.copyCode) || 'Ctrl + J',
      description: '复制当前窗口内容，方便粘贴',
      tag: '系统固定'
    },
    {
      key: 'delete-screenshot',
      title: '删除最新截图',
      combo: formatShortcut(shortcuts.deleteLastScreenshot) || 'Ctrl + D',
      description: '误截时可快速删除队列中最新截图',
      tag: '系统固定'
    }
  ], [shortcuts])

  const remainingAdvancedShortcuts = useMemo(
    () => shortcutGroups.advanced.filter((definition) => !highlightActionSet.has(definition.action)),
    [shortcutGroups, highlightActionSet]
  )

  const [expandedSections, setExpandedSections] = useState({
    common: true,
    advanced: false
  })

  const scrollToShortcutSection = (section: 'common' | 'advanced') => {
    const targetRef = section === 'common' ? commonSectionRef : advancedSectionRef
    if (!targetRef.current) return
    requestAnimationFrame(() => {
      targetRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }

  const toggleSection = (section: 'common' | 'advanced') => {
    setExpandedSections((prev) => {
      const nextState = {
        ...prev,
        [section]: !prev[section]
      }
      if (!prev[section]) {
        scrollToShortcutSection(section)
      }
      return nextState
    })
  }

  const scrollToSection = (section: ClientSection) => {
    setActiveSection(section)
  }

  const sectionTitles: Record<ClientSection, { title: string; eyebrow: string }> = {
    overview: { title: '工作台', eyebrow: '开始使用' },
    shortcuts: { title: '快捷键', eyebrow: '操作方式' },
    models: { title: '模型与提示词', eyebrow: 'AI 配置' },
    window: { title: '窗口', eyebrow: '显示设置' },
    connection: { title: '连接', eyebrow: '服务与设备' },
    account: { title: '账户', eyebrow: '账户信息' },
  }

  return (
    <div className="client-settings">
      <ClientTitleBar />
      <ClientSidebar activeSection={activeSection} onSelect={scrollToSection} />
      <main className="client-settings-content space-y-8" data-active-section={activeSection}>
        <div className="client-page-heading">
          <div>
            <p className="client-eyebrow">{sectionTitles[activeSection].eyebrow}</p>
            <h1>{sectionTitles[activeSection].title}</h1>
          </div>
          {activeSection === 'overview' && <span className="client-status-dot">客户端服务正常</span>}
        </div>

        <header ref={overviewRef} data-client-page="overview" className="client-account rounded-3xl bg-white border border-slate-100 p-8 shadow-[0_12px_50px_rgba(15,23,42,0.05)] flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <p className="text-xs text-slate-500">账户与设置</p>
            <h1 className="text-2xl font-semibold text-slate-900">
              {user?.username || user?.email || '未登录'}
            </h1>
            <p className="text-sm text-slate-500">准备好后即可开始使用。</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={handleCheckUpdate}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600"
              disabled={updateChecking}
            >
              <RefreshCw size={16} className={updateChecking ? 'animate-spin' : ''} aria-hidden="true" />
              {versionInfo?.needsUpdate ? (
                <span className="flex items-center gap-2 text-orange-500">
                  <span className="inline-flex h-2 w-2 rounded-full bg-orange-500"></span>
                  {updateChecking ? '检测中...' : '发现新版本'}
                </span>
              ) : updateChecking ? '检测中...' : '检测更新'}
            </button>
            <button
              className="client-button client-button-primary"
              onClick={handleLaunchExamClient}
              disabled={examClientLaunching}
            >
              <Play size={16} aria-hidden="true" />
              {examClientLaunching ? '启动中...' : '开始使用'}
            </button>
            <button
              onClick={handleLogout}
              className="rounded-2xl border border-rose-100 bg-rose-50 px-4 py-2 text-sm font-medium text-rose-600 hover:border-rose-200"
              disabled={logoutLoading}
            >
              <LogOut size={16} aria-hidden="true" />
              {logoutLoading ? '退出中...' : '退出登录'}
            </button>
          </div>
        </header>

        {versionInfo?.needsUpdate && (
          <div data-client-page="connection account" className="rounded-3xl border border-amber-100 bg-white p-5 shadow-sm">
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
          <ConnectionSettings />
        </section>

        <section ref={remoteRef} data-client-page="connection" className="rounded-3xl border border-blue-100 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">手机远程控制</h2>
              <p className="mt-1 text-sm text-slate-500">生成连接码后，在手机 Web 端输入连接码即可控制客户端。</p>
            </div>
            {!pairing && (
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

        <section data-client-page="overview" className="client-section-nav rounded-3xl border border-slate-100 bg-white p-6 space-y-4 shadow-sm">
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600"
              onClick={() => shortcutsRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              快捷键管理
            </button>
            <button
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600"
              onClick={() => testingRef.current?.scrollIntoView({ behavior: 'smooth' })}
            >
              快捷键测试
            </button>
          </div>
        </section>

        <section ref={shortcutsRef} data-client-page="shortcuts" className="rounded-3xl border border-slate-100 bg-white p-6 space-y-5 shadow-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">快捷键管理</h2>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            {([
              { key: 'common', label: '常用快捷键', description: '截屏、搜题与远程控制' },
              { key: 'advanced', label: '答题窗口调整等快捷键', description: '窗口与调试' }
            ] as const).map((tab) => (
              <button
                key={tab.key}
                onClick={() => toggleSection(tab.key)}
                className={`flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-medium transition ${
                  expandedSections[tab.key]
                    ? 'border-blue-400 bg-blue-50 text-blue-700'
                    : 'border-slate-200 bg-white text-slate-700 hover:border-blue-300 hover:text-blue-600'
                }`}
              >
                <div className="text-left leading-tight">
                  <div>{tab.label}</div>
                  <div className="text-[11px] text-slate-400">{tab.description}</div>
                </div>
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  className={`h-4 w-4 transition-transform ${expandedSections[tab.key] ? 'rotate-180' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth="2"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={handleRestoreDefaults}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:border-blue-400 hover:text-blue-600"
          >
            恢复默认快捷键
          </button>

          <div ref={commonSectionRef}>
            {expandedSections.common && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">常用快捷键默认展开，主要覆盖截屏、搜题、重置与手机远程控制。</div>
                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
                  {shortcutGroups.common.map((definition) => (
                    <div key={definition.action} className="grid gap-3 p-4 md:grid-cols-4 md:items-center">
                      <div>
                        <p className="font-medium text-slate-900">{definition.label}</p>
                        <p className="text-xs text-slate-500">{definition.description}</p>
                      </div>
                      <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-800">
                        {recordingAction === definition.action ? (
                          <span className="text-rose-500 font-semibold">按下新快捷键...</span>
                        ) : (
                          formatShortcut(shortcuts[definition.action])
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:border-blue-400 hover:text-blue-600"
                          onClick={() => handleStartRecording(definition.action)}
                        >
                          更改
                        </button>
                      </div>
                      {shortcutConflict?.action === definition.action && (
                        <p className="text-xs font-medium text-rose-600 md:col-span-4" role="alert">
                          {shortcutConflict.message}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div ref={advancedSectionRef}>
            {expandedSections.advanced && (
              <div className="space-y-3">
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
                  配置类快捷键涵盖窗口移动、透明度、滚动、复制等辅助操作，默认由系统固定。
                </div>

                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
                  {advancedHighlightShortcuts.map(item => (
                    <div key={item.key} className="grid gap-3 p-4 md:grid-cols-4 md:items-center">
                      <div className="space-y-1">
                        <p className="font-medium text-slate-900">{item.title}</p>
                        {item.description && (
                          <p className="text-xs text-slate-500">{item.description}</p>
                        )}
                      </div>
                      <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-800">
                        <div>{item.combo}</div>
                        {item.note && (
                          <p className="mt-1 text-xs text-slate-400">{item.note}</p>
                        )}
                      </div>
                      <div className="text-xs text-slate-400">
                        {item.tag || '系统固定'}
                      </div>
                    </div>
                  ))}
                </div>

                {remainingAdvancedShortcuts.length > 0 && (
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-100 bg-white">
                    {remainingAdvancedShortcuts.map((definition) => (
                      <div key={definition.action} className="grid gap-3 p-4 md:grid-cols-4 md:items-center">
                        <div>
                          <p className="font-medium text-slate-900">{definition.label}</p>
                          <p className="text-xs text-slate-500">{definition.description}</p>
                        </div>
                        <div className="col-span-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-800">
                          {formatShortcut(shortcuts[definition.action]) || '—'}
                        </div>
                        <div className="flex items-center text-xs text-slate-400">
                          系统固定
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
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
                    } else {
                      setTestResult({ action: 'programming', success: false, message: result?.error || '无法开启测试模式' })
                    }
                  } catch (error) {
                    console.error('启动测试模式失败:', error)
                    setTestResult({ action: 'programming', success: false, message: '无法开启测试模式' })
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
                    } else {
                      setTestResult({ action: 'programming', success: false, message: result?.error || '无法退出测试模式' })
                    }
                  } catch (error) {
                    console.error('退出测试模式失败:', error)
                    setTestResult({ action: 'programming', success: false, message: '无法退出测试模式' })
                  }
                }}
                disabled={!isTestingMode}
              >
                结束测试
              </button>
            </div>
          </div>
        {testResult && (
          <div
            className={`rounded-2xl border px-4 py-3 text-base font-medium ${
              testResult.success
                ? 'border-emerald-100 bg-emerald-50 text-emerald-700'
                : 'border-rose-100 bg-rose-50 text-rose-700'
            }`}
          >
            {testResult.message || (
              testResult.success
                ? '快捷键是否正常？检测结果显示正常'
                : '快捷键是否正常？当前未捕获到快捷键，请检查是否与其他软件冲突'
            )}
          </div>
        )}
        </section>

        <section data-client-page="models" className="client-placeholder-panel">
          <ModelPromptCenter />
        </section>

        <section data-client-page="window" className="client-placeholder-panel">
          <WindowSettings />
        </section>

        <section data-client-page="account" className="client-placeholder-panel">
          <AccountSettings user={user} version={versionInfo} />
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

      {centerNotice && (
          <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
            <div className="client-center-notice rounded-2xl bg-slate-900/90 px-6 py-3 text-white text-sm shadow-2xl">
              {centerNotice}
            </div>
          </div>
      )}
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
