import { useState } from 'react'

interface AccountSettingsProps {
  user: { username?: string; email?: string } | null
  version: { current: string; latest: string; needsUpdate: boolean } | null
}

export function AccountSettings({ user, version }: AccountSettingsProps) {
  const [loading, setLoading] = useState(false)

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
      <div className="account-setting-row"><span>当前版本</span><strong>{version?.current || '未知'}</strong></div>
      <div className="account-setting-row"><span>更新状态</span><strong>{version?.needsUpdate ? `可更新至 ${version.latest}` : '已是最新版本'}</strong></div>
      <div className="account-setting-actions">
        <button type="button" className="client-button client-button-danger" onClick={() => void logout()} disabled={loading}>{loading ? '退出中...' : '退出登录'}</button>
      </div>
    </section>
  )
}
