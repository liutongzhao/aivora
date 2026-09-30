export interface DesktopConfig {
  api?: {
    baseUrl?: string
    aiEndpoint?: string
    webEndpoint?: string
  }
  websocket?: {
    url?: string
  }
  web?: {
    baseUrl?: string
    logoutPath?: string
    dashboardPath?: string
  }
  environment?: string
}
