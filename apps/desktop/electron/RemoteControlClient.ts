import { io, Socket } from 'socket.io-client'
import { randomUUID } from 'crypto'
import { configHelper } from './ConfigHelper'
import { simpleAuthManager } from './SimpleAuthManager'
import { ShortcutsHelper } from './shortcuts'
import { shortcutDefinitions, type ShortcutAction } from '../shared/shortcuts'
import configData from './runtimeConfig'

type RemoteClientDeps = {
  shortcutsHelper: ShortcutsHelper
  quitApp?: () => void
  onState?: (state: RemoteClientState) => void
}

export type RemoteClientState = {
  connected: boolean
  status?: string
  sessionId?: string
  connectedAt?: number
  reason?: string
  code?: string
  expiresAt?: number
  remoteUrl?: string
  pairingLoading?: boolean
  error?: string
}

const packageJson = require('../../package.json')
const configuredApiBaseUrl = configData.api?.baseUrl || 'http://127.0.0.1:18000'
const configuredWebBaseUrl = configData.web?.baseUrl || configuredApiBaseUrl

export class RemoteControlClient {
  private socket: Socket | null = null
  private deviceId: string
  private enabled = false
  private activeExpensiveAction: symbol | null = null
  private readonly apiBase: string
  private pairing: { code: string; expiresAt: number; remoteUrl: string } | null = null
  private pairingRequest: Promise<{ code: string; expiresAt: number; remoteUrl: string }> | null = null
  private paired = false

  private static readonly DEFAULT_ACTION_TIMEOUT_MS = 20_000
  private static readonly PARTIAL_SCREENSHOT_TIMEOUT_MS = 70_000

  constructor(private readonly deps: RemoteClientDeps) {
    this.apiBase = process.env.REMOTE_CONTROL_BASE_URL || configuredApiBaseUrl
    const settings = configHelper.getClientSettings() || {}
    this.deviceId = settings.remoteDeviceId || randomUUID()
    if (!settings.remoteDeviceId) configHelper.updateClientSettings({ remoteDeviceId: this.deviceId })
  }

  async showPairing(): Promise<void> {
    // Repeated shortcut presses must not revoke an active session or a usable code.
    if (this.paired) {
      this.deps.onState?.(this.socket?.connected
        ? { connected: true }
        : { connected: false, error: '远程连接恢复中，请稍后重试' })
    } else if (this.pairing && this.pairing.expiresAt > Date.now()) {
      this.deps.onState?.({ connected: false, ...this.pairing })
    } else {
      await this.createPairing()
    }
  }

  async createPairing(): Promise<{ code: string; expiresAt: number; remoteUrl: string }> {
    if (this.pairingRequest) return this.pairingRequest
    this.pairingRequest = this.requestPairing()
    this.deps.onState?.({ connected: false, pairingLoading: true })
    try {
      return await this.pairingRequest
    } catch (error) {
      this.deps.onState?.({ connected: false, error: error instanceof Error ? error.message : '生成连接码失败' })
      throw error
    } finally {
      this.pairingRequest = null
    }
  }

  private async requestPairing(): Promise<{ code: string; expiresAt: number; remoteUrl: string }> {
    const sessionId = simpleAuthManager.getToken()
    if (!sessionId) throw new Error('请先登录客户端')
    this.disconnect()

    const registrationResponse = await fetch(`${this.apiBase.replace(/\/$/, '')}/api/remote/devices/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        device_id: this.deviceId,
        name: 'Aivora Desktop',
        platform: process.platform,
        client_version: packageJson.version
      })
    })
    const registrationData = await registrationResponse.json().catch(() => null)
    if (!registrationResponse.ok || !registrationData?.success) {
      throw new Error(registrationData?.error || registrationData?.detail?.message || `桌面设备注册失败（HTTP ${registrationResponse.status}）`)
    }

    // 先完成桌面端注册，再生成连接码，确保手机拿到连接码时服务端已能找到桌面端。
    const registration = this.connect(sessionId)
    const pairingSocket = this.socket
    await registration
    if (this.socket !== pairingSocket || !this.enabled) throw new Error('连接码生成已取消')

    let data: any
    try {
      const response = await fetch(`${this.apiBase.replace(/\/$/, '')}/api/remote/pairing/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Session-Id': sessionId },
        signal: AbortSignal.timeout(15000),
        body: JSON.stringify({ deviceId: this.deviceId })
      })
      data = await response.json().catch(() => null)
      if (this.socket !== pairingSocket || !this.enabled) throw new Error('连接码生成已取消')
      if (!response.ok || !data?.success) throw new Error(data?.error || data?.detail?.message || `生成连接码失败（HTTP ${response.status}）`)
    } catch (error) {
      this.disconnect()
      throw error
    }

    const remoteUrl = `${configuredWebBaseUrl}/remote`
    this.pairing = { code: data.code, expiresAt: data.expiresAt, remoteUrl }
    this.deps.onState?.({ connected: false, code: data.code, expiresAt: data.expiresAt, remoteUrl })
    return { code: data.code, expiresAt: data.expiresAt, remoteUrl }
  }

  private connect(sessionId: string): Promise<void> {
    this.enabled = true
    if (this.socket) return Promise.resolve()

    return new Promise((resolve, reject) => {
      let settled = false
      const registrationTimeout = setTimeout(() => {
        rejectOnce(new Error('桌面端远程连接超时，请检查服务器连接'))
      }, 10000)
      const resolveOnce = () => {
        if (settled) return
        settled = true
        clearTimeout(registrationTimeout)
        resolve()
      }
      const rejectOnce = (error: Error) => {
        if (settled) return
        settled = true
        clearTimeout(registrationTimeout)
        socket.disconnect()
        if (this.socket === socket) this.socket = null
        this.enabled = false
        reject(error)
      }

      const socket = io(`${this.apiBase.replace(/\/$/, '')}/remote`, {
        path: '/socket.io/',
        transports: ['polling', 'websocket'],
        forceNew: true,
        auth: { sessionId },
        reconnection: true,
        reconnectionAttempts: Infinity,
        reconnectionDelayMax: 10000,
        timeout: 10000
      })
      this.socket = socket
      socket.on('connect', () => {
        socket.emit('remote:desktop_register', { sessionId, deviceId: this.deviceId }, (result: any) => {
          if (!result?.success) {
            const error = new Error(result?.error || '远程注册失败')
            this.deps.onState?.({ connected: false, error: error.message })
            rejectOnce(error)
            return
          }
          resolveOnce()
        })
      })
      socket.on('remote:execute', (data: { token?: string; requestId?: string; action?: string }) => {
        const run = async () => {
          if (!data?.action || !this.isShortcutAction(data.action)) {
            socket.emit('remote:command_status', { requestId: data?.requestId, action: data?.action, status: 'rejected', errorCode: 'UNSUPPORTED_ACTION', errorMessage: '客户端不支持该动作' })
            return
          }
          socket.emit('remote:command_status', { requestId: data.requestId, action: data.action, status: 'running' })
          try {
            if (data.action === 'quitApp') {
              socket.emit('remote:command_status', { requestId: data.requestId, action: data.action, status: 'success' })
              this.deps.quitApp?.()
              return
            }
            const timeoutMs = data.action === 'partialScreenshot'
              ? RemoteControlClient.PARTIAL_SCREENSHOT_TIMEOUT_MS
              : RemoteControlClient.DEFAULT_ACTION_TIMEOUT_MS
            const executed = await this.executeActionWithTimeout(data.action, timeoutMs)
            if (!executed) throw new Error('动作未执行')
            socket.emit('remote:command_status', { requestId: data.requestId, action: data.action, status: 'success' })
          } catch (error: any) {
            socket.emit('remote:command_status', { requestId: data.requestId, action: data.action, status: error?.message?.includes('超时') ? 'timeout' : 'failed', errorCode: error?.message?.includes('超时') ? 'ACTION_TIMEOUT' : 'ACTION_FAILED', errorMessage: error?.message || '动作执行失败' })
          }
        }
        const expensive = ['screenshot', 'partialScreenshot', 'programming', 'singleChoice', 'singleChoiceAlt', 'multipleChoice', 'universal', 'reset', 'refreshConfig'].includes(data?.action || '')
        if (!expensive) {
          void run()
          return
        }
        if (this.activeExpensiveAction) {
          socket.emit('remote:result', {
            token: data?.token,
            requestId: data?.requestId,
            success: false,
            error: '上一个远程操作仍在执行，请稍后重试'
          })
          return
        }
        const actionMarker = Symbol(data.action)
        this.activeExpensiveAction = actionMarker
        void run().finally(() => {
          if (this.activeExpensiveAction === actionMarker) this.activeExpensiveAction = null
        })
      })
      socket.on('remote:paired', () => {
        if (this.paired) return
        this.paired = true
        this.pairing = null
        this.deps.onState?.({ connected: true, status: 'connected' })
      })
      socket.on('remote:session_state', (state: RemoteClientState) => {
        const connected = state.status === 'active' || state.status === 'connected'
        this.paired = connected
        if (connected) this.pairing = null
        if (state.status === 'replaced' || state.status === 'closed') this.pairing = null
        this.deps.onState?.({ connected, ...state })
      })
      socket.on('remote:peer_state', (state) => {
        this.paired = state?.connected === true
        this.deps.onState?.({ connected: this.paired, status: this.paired ? 'connected' : 'disconnected', ...(!this.paired && this.pairing ? this.pairing : {}) })
      })
      socket.on('remote:revoked', (data) => {
        this.deps.onState?.({ connected: false, status: 'replaced', reason: data?.reason, error: data?.reason || '远程会话已结束' })
        this.disconnect()
      })
      socket.on('disconnect', (reason) => {
        console.info('[remote] desktop disconnected:', reason)
        if (this.enabled) this.deps.onState?.({
          connected: false, status: 'disconnected',
          ...(!this.paired && this.pairing ? this.pairing : {})
        })
      })
      socket.on('connect_error', (error) => {
        this.deps.onState?.({ connected: false, error: error.message })
        rejectOnce(error)
      })
    })
  }

  disconnect(): void {
    this.pairing = null
    this.paired = false
    this.enabled = false
    this.socket?.disconnect()
    this.socket = null
    this.activeExpensiveAction = null
    this.deps.onState?.({ connected: false })
  }

  async endSession(): Promise<void> {
    const sessionId = simpleAuthManager.getToken()
    if (sessionId) {
      const response = await fetch(`${this.apiBase.replace(/\/$/, '')}/api/remote/session/close`, {
        method: 'POST',
        headers: { 'X-Session-Id': sessionId },
        signal: AbortSignal.timeout(10000)
      })
      if (!response.ok) throw new Error(`结束远程会话失败（HTTP ${response.status}）`)
    }
    this.disconnect()
  }

  private isShortcutAction(value: string): value is ShortcutAction | 'quitApp' {
    return value === 'quitApp' || shortcutDefinitions.some((definition) => definition.action === value)
  }

  private async executeActionWithTimeout(action: ShortcutAction, timeoutMs: number): Promise<boolean> {
    let timeout: NodeJS.Timeout | undefined
    try {
      return await Promise.race([
        this.deps.shortcutsHelper.executeAction(action),
        new Promise<boolean>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('远程操作执行超时，请重试')), timeoutMs)
        })
      ])
    } finally {
      if (timeout) clearTimeout(timeout)
    }
  }
}
