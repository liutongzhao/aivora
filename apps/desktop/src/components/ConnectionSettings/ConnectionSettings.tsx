import { useEffect, useState } from 'react'
import { userConfigService } from '../../services/userConfigService'
import type { Connection } from '../../types/userConfig'
import { ConnectionEditor } from './ConnectionEditor'
import type { ClientToastVariant } from '../ClientShell/ClientToast'

export function ConnectionSettings({ onNotify }: { onNotify?: (message: string, variant?: ClientToastVariant) => void }) {
  const [connections, setConnections] = useState<Connection[]>([])
  const [editing, setEditing] = useState<Connection | null | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  async function refresh() {
    setLoading(true)
    try {
      setConnections(await userConfigService.listConnections())
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '连接加载失败', 'error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  async function testConnection(connection: Connection) {
    try {
      const models = await userConfigService.syncConnection(connection.id)
      onNotify?.(`连接正常，发现 ${models.length} 个模型`, 'success')
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '连接测试失败', 'error')
    }
  }

  async function toggleConnection(connection: Connection) {
    try {
      if (connection.enabled) {
        await userConfigService.disableConnection(connection.id)
      } else {
        await userConfigService.updateConnection(connection.id, { enabled: true })
      }
      await refresh()
    } catch (reason) {
      onNotify?.(reason instanceof Error ? reason.message : '连接状态更新失败', 'error')
    }
  }

  return (
    <section className="connection-settings-panel">
      <div className="connection-panel-heading">
        <div><h2>API 连接</h2><p>连接保存后，密钥只用于服务端调用。</p></div>
        <button type="button" className="client-button client-button-primary" onClick={() => setEditing(null)}>新增连接</button>
      </div>
      {loading && <div className="model-empty">加载中...</div>}
      {!loading && connections.length === 0 && <div className="model-empty">暂无连接</div>}
      {!loading && connections.map((connection) => (
        <div className="connection-row" key={connection.id}>
          <div><strong>{connection.name}</strong><small>{connection.base_url}</small></div>
          <span className={connection.enabled ? 'model-state is-enabled' : 'model-state'}>
            {connection.enabled ? '已启用' : '已停用'} · <span>{connection.key_configured === false ? '未配置密钥' : '密钥已配置'}</span>
          </span>
          <div className="connection-row-actions">
            <button type="button" className="client-button client-button-secondary" onClick={() => void testConnection(connection)}>测试连接</button>
            <button type="button" className="client-button client-button-secondary" onClick={() => setEditing(connection)}>编辑</button>
            <button type="button" className="client-button client-button-secondary" aria-label={connection.enabled ? '停用连接' : '启用连接'} onClick={() => void toggleConnection(connection)}>{connection.enabled ? '停用' : '启用'}</button>
          </div>
        </div>
      ))}
      {editing !== undefined && <ConnectionEditor key={editing?.id ?? 'new'} connection={editing} onSaved={refresh} onClose={() => setEditing(undefined)} onNotify={onNotify} />}
    </section>
  )
}
