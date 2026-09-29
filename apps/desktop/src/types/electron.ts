export interface ElectronAPI {
  remoteControl?: {
    onState: (callback: (state: {
      connected: boolean
      code?: string
      expiresAt?: number
      remoteUrl?: string
      pairingLoading?: boolean
      error?: string
    }) => void) => () => void
  }
  [key: string]: unknown
}
