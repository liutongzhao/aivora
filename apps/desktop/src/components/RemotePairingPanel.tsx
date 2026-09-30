import { useEffect, useState } from 'react'
import type { ElectronAPI } from '../types/electron'

type RemoteState = Parameters<Parameters<NonNullable<ElectronAPI['remoteControl']>['onState']>[0]>[0]

export default function RemotePairingPanel() {
  const [state, setState] = useState<RemoteState | null>(null)
  const [now, setNow] = useState(Date.now)

  useEffect(() => window.electronAPI.remoteControl?.onState((next: RemoteState) => {
    if (next.connected) {
      setNow(Date.now())
      setState(next)
    } else if (next.code || next.pairingLoading || next.error || next.status === 'closed' || next.status === 'replaced') {
      setNow(Date.now())
      setState(current => next.error && current?.code ? { ...current, ...next } : next)
    } else {
      setState(current => current?.error && !current.code ? current : null)
    }
  }), [])

  useEffect(() => {
    if (!state?.expiresAt && !state?.connectedAt) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [state])

  useEffect(() => {
    if (!state?.error || state.code) return
    const timer = window.setTimeout(() => setState(null), 8000)
    return () => window.clearTimeout(timer)
  }, [state])

  if (!state) return null
  const seconds = state.connected ? 0 : Math.max(0, Math.ceil(((state.expiresAt || 0) - now) / 1000))

  return (
    <aside aria-label="手机远程控制" className="client-remote-panel w-full min-w-0 border-b p-4" style={{ backgroundColor: 'var(--toast-bg)', color: 'var(--text-color)', borderColor: 'var(--border-color)' }}>
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">手机远程控制</h2>
      </div>
      <div role="status" className="mt-2 text-sm">
        {state.connected ? <p>手机已连接{state.connectedAt ? ` · 已连接时长 ${Math.floor((now - state.connectedAt) / 60000)}分${String(Math.floor(((now - state.connectedAt) % 60000) / 1000)).padStart(2, '0')}秒` : ''}</p> : state.pairingLoading ? <p>正在生成连接码...</p> : state.code ? (
          <>
            <code className={`block break-all text-2xl font-bold ${seconds ? '' : 'line-through opacity-60'}`} style={{ textShadow: 'none' }}>{state.code}</code>
            <p className="mt-1 text-xs">
              {seconds ? '等待手机连接' : '连接码已过期'}
            </p>
            <p className="mt-3 break-all text-xs">{state.remoteUrl}</p>
          </>
        ) : state.status === 'replaced' ? <p>当前账号已在其他设备建立远程连接</p> : state.status === 'closed' ? <p>远程连接已结束</p> : null}
        {state.error && <p className="mt-2 break-words">{state.error}</p>}
      </div>
    </aside>
  )
}
