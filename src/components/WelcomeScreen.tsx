import React from 'react'

export interface WelcomeScreenProps {
  onOpenSettings?: () => void
  onContinue?: () => void
  title?: string
  description?: string
}

export function WelcomeScreen({
  onOpenSettings,
  onContinue,
  title = '欢迎使用',
  description = '请完成初始化配置后开始使用。'
}: WelcomeScreenProps) {
  return (
    <section className="min-h-screen flex items-center justify-center p-6 text-center text-[color:var(--text-color)]">
      <div className="max-w-md space-y-4">
        <h1 className="text-xl font-semibold">{title}</h1>
        <p className="text-sm opacity-70">{description}</p>
        <div className="flex justify-center gap-2">
          {onOpenSettings && <button className="client-button" onClick={onOpenSettings}>打开设置</button>}
          {onContinue && <button className="client-button" onClick={onContinue}>继续</button>}
        </div>
      </div>
    </section>
  )
}
