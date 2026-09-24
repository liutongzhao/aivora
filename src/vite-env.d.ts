/// <reference types="vite/client" />

declare global {
  interface Window {
    electronAPI: any
    __CREDITS__?: number
    __IS_INITIALIZED__?: boolean
  }
}

export {}
