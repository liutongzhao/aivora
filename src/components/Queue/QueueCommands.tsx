import React from "react"
import { Camera, Crop, Play, RotateCcw } from "lucide-react"

import { useToast } from "../../contexts/toast"
import { useShortcutBindings } from "../../contexts/shortcuts"
import { getShortcutParts } from "../../utils/shortcutFormat"

type ShortcutKey = 'screenshot' | 'singleChoice' | 'programming' | 'universal'

interface QueueCommandsProps {
  screenshotCount?: number
  credits: number
}

const navShortcuts: Array<{ label: string; action: ShortcutKey }> = [
  { label: '截图', action: 'screenshot' },
  { label: '单选', action: 'singleChoice' },
  { label: '编程', action: 'programming' },
  { label: '通用', action: 'universal' }
]

const QueueCommands: React.FC<QueueCommandsProps> = ({ screenshotCount = 0, credits }) => {
  const { showToast } = useToast()
  const { bindings } = useShortcutBindings()

  const renderShortcutBadges = (parts: string[]) => {
    if (!parts.length) {
      return <span className="text-white/50">—</span>
    }
    return (
      <div className="flex gap-1 flex-shrink-0">
        {parts.map((part, index) => (
          <span
            key={`${part}-${index}`}
            className="client-keycap bg-white/20 px-1.5 py-0.5 rounded text-[10px] leading-none"
          >
            {part}
          </span>
        ))}
      </div>
    )
  }

  const inlineBadges = (action: ShortcutKey) => renderShortcutBadges(getShortcutParts(bindings[action]))

  const handleScreenshot = async () => {
    try {
      const result = await window.electronAPI.triggerScreenshot()
      if (!result.success) {
        showToast('错误', '截屏失败', 'error')
      }
    } catch (error) {
      showToast('错误', '截屏失败', 'error')
    }
  }

  const handleSolve = async () => {
    if (screenshotCount === 0 || credits <= 0) {
      if (screenshotCount === 0) {
        showToast('提示', '请先截屏', 'neutral')
      } else {
        showToast('积分不足', '请在配置页充值后再试', 'error')
      }
      return
    }
    try {
      const result = await window.electronAPI.triggerProcessScreenshots()
      if (!result.success) {
        showToast('错误', result.error || '处理截图失败', 'error')
      }
    } catch (error) {
      showToast('错误', '处理截图失败', 'error')
    }
  }

  const handlePartialScreenshot = async () => {
    try {
      const triggerPartialScreenshot = window.electronAPI.triggerPartialScreenshot as
        | (() => Promise<{ success?: boolean; error?: string }>)
        | undefined
      if (triggerPartialScreenshot) {
        await triggerPartialScreenshot()
      } else {
        showToast('提示', '请使用局部截图快捷键', 'neutral')
      }
    } catch (error) {
      showToast('错误', '局部截图失败', 'error')
    }
  }

  const handleReset = async () => {
    try {
      const result = await window.electronAPI.triggerReset?.()
      if (result?.error) {
        showToast('错误', result.error, 'error')
      }
    } catch (error) {
      showToast('错误', '重置队列失败', 'error')
    }
  }

  return (
    <div className="w-full">
      <div className="pt-2 w-full">
        <div className="client-command-bar text-[10px] text-white/90 backdrop-blur-md opacity-controlled-bg-light rounded-lg py-2 px-3 flex flex-wrap items-center gap-2 transition-colors">
          <div className="flex items-center gap-2">
            <button type="button" className="client-command-button" onClick={handleScreenshot} title="截图">
              <Camera size={15} aria-hidden="true" />
              <span>截图</span>
            </button>
            <button type="button" className="client-command-button" onClick={handlePartialScreenshot} title="局部截图">
              <Crop size={15} aria-hidden="true" />
              <span>局部截图</span>
            </button>
            <button type="button" className="client-command-button client-command-button-primary" onClick={handleSolve} title="处理截图">
              <Play size={14} aria-hidden="true" />
              <span>处理截图</span>
            </button>
            <button type="button" className="client-command-button" onClick={handleReset} title="重置队列">
              <RotateCcw size={14} aria-hidden="true" />
              <span>重置队列</span>
            </button>
          </div>
          {navShortcuts.map((item) => (
            <div key={item.action} className="flex items-center gap-1 whitespace-nowrap">
              <span>{item.label}</span>
              {inlineBadges(item.action)}
            </div>
          ))}
        </div>

      </div>
    </div>
  )
}

export default QueueCommands
