import React, { useEffect } from "react"
import { useShortcutBindings } from "../../contexts/shortcuts"
import { getShortcutParts } from "../../utils/shortcutFormat"
import { Screenshot } from "../../types/screenshots"

export interface SolutionCommandsProps {
  onTooltipVisibilityChange: (visible: boolean, height: number) => void
  isProcessing: boolean
  screenshots?: Screenshot[]
  extraScreenshots?: Screenshot[]
  credits: number
}

const navShortcuts = [
  { label: "截图", action: "screenshot" as const },
  { label: "单选", action: "singleChoice" as const },
  { label: "编程", action: "programming" as const },
  { label: "调试", action: "debug" as const },
  { label: "通用", action: "universal" as const }
]

const SolutionCommands: React.FC<SolutionCommandsProps> = ({ onTooltipVisibilityChange }) => {
  const { bindings } = useShortcutBindings()

  useEffect(() => {
    onTooltipVisibilityChange(false, 0)
  }, [onTooltipVisibilityChange])

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

  const inlineBadges = (action: keyof typeof bindings) => renderShortcutBadges(getShortcutParts(bindings[action]))

  return (
    <div className="pt-2 w-full">
      <div className="client-command-bar text-[10px] text-white/90 backdrop-blur-md opacity-controlled-bg-light rounded-lg py-2 px-3 flex flex-wrap items-center gap-3 transition-colors">
        {navShortcuts.map((item) => (
          <div key={item.action} className="flex items-center gap-1 whitespace-nowrap">
            <span>{item.label}</span>
            {inlineBadges(item.action)}
          </div>
        ))}
      </div>
    </div>
  )
}

export default SolutionCommands
