export interface ElectronAPI {
  remoteControl?: {
    onState: (callback: (state: {
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
    }) => void) => () => void
  }
  [key: string]: unknown
}
