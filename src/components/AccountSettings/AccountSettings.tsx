import { useEffect, useState } from 'react'

interface AccountSettingsProps {
  user: { username?: string; email?: string } | null
  version: { current: string; latest: string; needsUpdate: boolean } | null
}

export function AccountSettings({ user, version }: AccountSettingsProps) {
  const [loading, setLoading] = useState(false)
  const [updateState, setUpdateState] = useState<'idle' | 'checking' | 'available' | 'downloaded'>('idle')
  const [updateMessage, setUpdateMessage] = useState('')

  useEffect(() => {
    const onAvailable = window.electronAPI?.onUpdateAvailable?.(() => {
      setUpdateState('available')
      setUpdateMessage('发现新版本')
    })
    const onDownloaded = window.electronAPI?.onUpdateDownloaded?.(() => {
      setUpdateState('downloaded')
      setUpdateMessage('更新已下载，重启后生效')
    })
    return () => { onAvailable?.(); onDownloaded?.() }
  }, [])

  async function checkForUpdates() {
    setUpdateState('checking')
    const result = await window.electronAPI?.checkForUpdates?.()
    if (result?.success) {
      setUpdateMessage('已是最新版本')
      setUpdateState('idle')
    } else {
      setUpdateMessage(result?.error || '暂时无法检查更新')
      setUpdateState('idle')
    }
  }

  async function downloadUpdate() {
    setUpdateState('checking')
    const result = await window.electronAPI?.startUpdate?.()
    if (!result?.success) {
      setUpdateState('available')
      setUpdateMessage(result?.error || '下载更新失败')
    }
  }

  async function logout() {
    setLoading(true)
    try {
      await window.electronAPI?.webAuthLogout?.()
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="account-settings-panel">
      <h2>账户</h2>
      <div className="account-setting-row"><span>用户</span><strong>{user?.username || '未登录'}</strong></div>
      <div className="account-setting-row"><span>邮箱</span><strong>{user?.email || '—'}</strong></div>
      <div className="account-setting-row"><span>更新状态</span><strong>{version?.needsUpdate ? `可更新至 ${version.latest}` : '已是最新版本'}</strong></div>
      <div className="account-version-panel">
        <div><strong>客户端版本</strong><span>{version?.current || '未知'}</span></div>
        <div className="account-version-actions">
          {updateMessage && <span role="status">{updateMessage}</span>}
          {updateState === 'available' && <button type="button" className="client-button client-button-primary" onClick={() => void downloadUpdate()}>下载更新</button>}
          {updateState === 'downloaded' && <button type="button" className="client-button client-button-primary" onClick={() => void window.electronAPI?.installUpdate?.()}>立即重启更新</button>}
          {updateState !== 'available' && updateState !== 'downloaded' && <button type="button" className="client-button client-button-secondary" onClick={() => void checkForUpdates()} disabled={updateState === 'checking'}>{updateState === 'checking' ? '检查中...' : '检查更新'}</button>}
        </div>
      </div>
      <div className="account-setting-actions">
        <button type="button" className="client-button client-button-danger" onClick={() => void logout()} disabled={loading}>{loading ? '退出中...' : '退出登录'}</button>
      </div>
    </section>
  )
}
