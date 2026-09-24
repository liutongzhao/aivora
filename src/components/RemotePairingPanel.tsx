import { useEffect, useState } from 'react'
import type { ElectronAPI } from '../types/electron'

type RemoteState = Parameters<Parameters<NonNullable<ElectronAPI['remoteControl']>['onState']>[0]>[0]

export default function RemotePairingPanel() {
  const [state, setState] = useState<RemoteState | null>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => window.electronAPI.remoteControl?.onState((next: RemoteState) => {
    if (next.connected) {
      setState(null)
    } else if (next.code || next.pairingLoading || next.error) {
      setNow(Date.now())
      setState(current => next.error && current?.code ? { ...current, ...next } : next)
    } else {
      setState(current => current?.error && !current.code ? current : null)
    }
  }), [])

  useEffect(() => {
    if (!state?.expiresAt || state.connected) return
    const timer = window.setTimeout(() => setNow(Date.now()), Math.max(0, state.expiresAt - Date.now()))
    return () => window.clearTimeout(timer)
  }, [state])

  useEffect(() => {
    if (!state?.error || state.code) return
    const timer = window.setTimeout(() => setState(null), 8000)
    return () => window.clearTimeout(timer)
  }, [state])

  if (!state) return null
  const seconds = Math.max(0, Math.ceil(((state.expiresAt || 0) - now) / 1000))

  return (
    <aside aria-label="手机远程控制" className="client-remote-panel w-full min-w-0 border-b p-4" style={{ backgroundColor: 'var(--toast-bg)', color: 'var(--text-color)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">手机远程控制</h2>
      </div>
      <div role="status" className="mt-2 text-sm">
        {state.pairingLoading ? <p>正在生成连接码...</p> : state.code ? (
          <>
            <code className={`block break-all text-2xl font-bold ${seconds ? '' : 'line-through opacity-60'}`} style={{ textShadow: 'none' }}>{state.code}</code>
            <p className="mt-1 text-xs">
              {seconds ? '等待手机连接' : '连接码已过期'}
            </p>
            <p className="mt-3 break-all text-xs">{state.remoteUrl}</p>
          </>
        ) : null}
        {state.error && <p className="mt-2 break-words">{state.error}</p>}
      </div>
    </aside>
  )
}
