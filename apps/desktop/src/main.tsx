import React from "react"
import ReactDOM from "react-dom/client"
import App from "./App"
import AdminUserCreditConsole from "./_pages/AdminUserCreditConsole"
import LoginPage from "./_pages/LoginPage"
import ConfigPage from "./_pages/ConfigPage"
import "./index.css"
import "./client-presentation.css"
import { useEffect, useState } from "react"

// 默认使用深色主题，后续由IPC同步具体主题
document.documentElement.classList.add('theme-dark');
document.body.classList.add('theme-dark');

const applyThemeClass = (theme: 'dark' | 'light') => {
  document.documentElement.classList.remove('theme-dark', 'theme-light')
  document.body.classList.remove('theme-dark', 'theme-light')
  const targetClass = theme === 'light' ? 'theme-light' : 'theme-dark'
  document.documentElement.classList.add(targetClass)
  document.body.classList.add(targetClass)
}

const initializeThemeSync = async () => {
  try {
    const result = await window.electronAPI.getClientTheme?.()
    applyThemeClass(result?.theme === 'light' ? 'light' : 'dark')
  } catch (error) {
    console.error('初始化主题失败，使用深色主题:', error)
    applyThemeClass('dark')
  }

  window.electronAPI.onThemeChanged?.((theme: 'dark' | 'light') => {
    applyThemeClass(theme)
  })
}

initializeThemeSync()

const shouldRenderAdminConsole = (() => {
  if (typeof window === "undefined") {
    return false
  }

  const { pathname, hash } = window.location
  if (pathname && pathname.replace(/\/+$/, "").endsWith("/admin-user-console")) {
    return true
  }

  return hash === "#/admin-user-console"
})()

type RootView = "app" | "login" | "config"

const resolveViewFromHash = (): RootView => {
  if (typeof window === "undefined") {
    return "app"
  }
  const hash = window.location.hash.replace(/^#/, "").toLowerCase()
  if (!hash || hash === '/overlay') return 'app'
  if (hash.startsWith("/login")) return "login"
  if (hash.startsWith("/config")) return "config"
  return "app"
}

function RootRouter() {
  const [view, setView] = useState<RootView>(resolveViewFromHash)

  useEffect(() => {
    const handler = () => setView(resolveViewFromHash())
    window.addEventListener('hashchange', handler)
    return () => window.removeEventListener('hashchange', handler)
  }, [])

  if (shouldRenderAdminConsole) {
    return <AdminUserCreditConsole />
  }

  if (view === "login") {
    return <LoginPage />
  }

  if (view === "config") {
    return <ConfigPage />
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RootRouter />
  </React.StrictMode>
)
