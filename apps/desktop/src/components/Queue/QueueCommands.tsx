import React from "react"

import { useShortcutBindings } from "../../contexts/shortcuts"
import { getShortcutParts } from "../../utils/shortcutFormat"

type ShortcutKey = 'screenshot' | 'singleChoice' | 'programming' | 'debug' | 'universal'

interface QueueCommandsProps {
  screenshotCount?: number
  credits: number
}

const navShortcuts: Array<{ label: string; action: ShortcutKey }> = [
  { label: '截图', action: 'screenshot' },
  { label: '单选', action: 'singleChoice' },
  { label: '编程', action: 'programming' },
  { label: '调试', action: 'debug' },
  { label: '通用', action: 'universal' }
]

const QueueCommands: React.FC<QueueCommandsProps> = () => {
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

  return (
    <div className="w-full">
      <div className="pt-2 w-full">
        <div className="client-command-bar text-[10px] text-white/90 backdrop-blur-md opacity-controlled-bg-light rounded-lg py-2 px-3 flex flex-wrap items-center gap-2 transition-colors">
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
