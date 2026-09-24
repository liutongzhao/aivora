import React, { useCallback, useEffect, useMemo, useState } from "react"

type AccessRole = "admin" | "traffic"

// 允许访问该页面的角色
const ALLOWED_ROLES: Record<string, AccessRole> = {
  ADMIN: "admin",
  admin: "admin",
  traffic: "traffic",
  TRAFFIC: "traffic"
}

const SESSION_STORAGE_KEY = "adminUserConsole:sessionId"

interface AdminUserCreditConsoleProps {
  /** 可选：后端基础路径，默认同源 */
  apiBaseUrl?: string
  /** 可选：初始化时使用的会话ID */
  initialSessionId?: string
  /** 可选：自定义 fetch 实现 */
  fetchImpl?: typeof fetch
}

type AccessState = "missing-session" | "checking" | "allowed" | "forbidden"

interface SessionStatusResponse {
  authenticated: boolean
  user?: {
    id: number
    email: string
    username?: string
  }
  sessionId?: string
  message?: string
}

interface ApiEnvelope<T> {
  success: boolean
  data?: T
  message?: string
  error?: string
}

interface UserProfile {
  id: number
  email: string
  username?: string
  role?: string
  points?: number
  isActive?: boolean
  isTrafficAgent?: boolean
  isPaidUser?: boolean
  totalRechargeAmount?: number
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

interface UserConfigRecord {
  [key: string]: unknown
}

interface CreditUpdatePayload {
  userId: number | string
  operation: "add" | "set"
  amount: number | string
  description?: string
}

/**
 * 管理员 / 流量手 专用的用户查询与积分管理界面
 * 仅创建新文件，不修改现有逻辑，方便独立集成.
 */
const AdminUserCreditConsole: React.FC<AdminUserCreditConsoleProps> = ({
  apiBaseUrl = "",
  initialSessionId = "",
  fetchImpl
}) => {
  const runtimeFetch = useMemo(() => {
    if (fetchImpl) return fetchImpl
    if (typeof window !== "undefined" && window.fetch) {
      return window.fetch.bind(window)
    }
    if (typeof fetch !== "undefined") {
      return fetch
    }
    throw new Error("fetch is not available in this environment")
  }, [fetchImpl])

  const normalizedBaseUrl = useMemo(() => {
    if (!apiBaseUrl) return ""
    return apiBaseUrl.endsWith("/") ? apiBaseUrl.slice(0, -1) : apiBaseUrl
  }, [apiBaseUrl])

  const buildUrl = useCallback((path: string) => {
    if (/^https?:/i.test(path)) {
      return path
    }
    const safePath = path.startsWith("/") ? path : `/${path}`
    return `${normalizedBaseUrl}${safePath}`
  }, [normalizedBaseUrl])

  const [sessionIdInput, setSessionIdInput] = useState(initialSessionId)
  const [sessionId, setSessionId] = useState(initialSessionId)
  const [accessState, setAccessState] = useState<AccessState>(initialSessionId ? "checking" : "missing-session")
  const [accessRole, setAccessRole] = useState<AccessRole | null>(null)
  const [currentUser, setCurrentUser] = useState<SessionStatusResponse["user"] | null>(null)

  const [searchEmail, setSearchEmail] = useState("")
  const [isSearching, setIsSearching] = useState(false)
  const [selectedUser, setSelectedUser] = useState<UserProfile | null>(null)
  const [userConfig, setUserConfig] = useState<UserConfigRecord | null>(null)
  const [isLoadingConfig, setIsLoadingConfig] = useState(false)
  const [creditInput, setCreditInput] = useState("")
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null)

  const storeSessionId = useCallback((value: string) => {
    try {
      if (typeof window === "undefined" || !window.localStorage) {
        return
      }
      if (value) {
        window.localStorage.setItem(SESSION_STORAGE_KEY, value)
      } else {
        window.localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    } catch (error) {
      console.warn("Failed to persist session id", error)
    }
  }, [])

  useEffect(() => {
    if (initialSessionId) {
      setSessionId(initialSessionId)
      setSessionIdInput(initialSessionId)
      return
    }

    try {
      if (typeof window !== "undefined" && window.localStorage) {
        const stored = window.localStorage.getItem(SESSION_STORAGE_KEY)
        if (stored) {
          setSessionId(stored)
          setSessionIdInput(stored)
        }
      }
    } catch (error) {
      console.warn("Unable to restore stored session id", error)
    }
  }, [initialSessionId])

  const fetchSessionStatus = useCallback(async (activeSessionId: string): Promise<SessionStatusResponse> => {
    const response = await runtimeFetch(buildUrl(`/api/auth-enhanced/session-status?sessionId=${encodeURIComponent(activeSessionId)}`), {
      method: "GET",
      headers: {
        "x-session-id": activeSessionId
      },
      credentials: "include"
    })

    if (!response.ok) {
      throw new Error("无法验证会话，请确认会话ID是否正确或已过期")
    }

    return response.json()
  }, [buildUrl, runtimeFetch])

  const callApi = useCallback(async <T,>(path: string, init: RequestInit = {}): Promise<ApiEnvelope<T>> => {
    if (!sessionId) {
      throw new Error("缺少会话ID，无法调用管理员接口")
    }

    const headers = new Headers(init.headers ?? {})
    headers.set("x-session-id", sessionId)

    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    const response = await runtimeFetch(buildUrl(path), {
      ...init,
      headers,
      credentials: "include"
    })

    let payload: ApiEnvelope<T> | null = null
    try {
      payload = await response.json()
    } catch (_error) {
      // ignore JSON parse errors for non-JSON responses
    }

    if (!response.ok) {
      const message = payload?.error || payload?.message || `请求失败 (HTTP ${response.status})`
      throw new Error(message)
    }

    if (payload && payload.success === false) {
      throw new Error(payload.error || payload.message || "请求失败")
    }

    return (payload as ApiEnvelope<T>) ?? { success: true }
  }, [buildUrl, runtimeFetch, sessionId])

  const requestTrafficProbe = useCallback(async (userId: number) => {
    try {
      const response = await runtimeFetch(buildUrl(`/api/invite/commissions?userId=${userId}&limit=1`), {
        method: "GET",
        headers: {
          "x-user-id": String(userId),
          ...(sessionId ? { "x-session-id": sessionId } : {})
        },
        credentials: "include"
      })

      if (!response.ok) {
        return false
      }

      const payload = await response.json().catch(() => null)
      return payload?.success !== false
    } catch (error) {
      console.warn("流量手权限探测失败", error)
      return false
    }
  }, [buildUrl, runtimeFetch, sessionId])

  const determineAccess = useCallback(async (activeSessionId: string) => {
    if (!activeSessionId) {
      setAccessState("missing-session")
      setAccessRole(null)
      setCurrentUser(null)
      return
    }

    setFeedback(null)
    setAccessState("checking")

    try {
      const sessionInfo = await fetchSessionStatus(activeSessionId)

      if (!sessionInfo.authenticated || !sessionInfo.user) {
        setAccessState("forbidden")
        setAccessRole(null)
        setCurrentUser(null)
        throw new Error(sessionInfo.message || "会话未认证，请重新登录")
      }

      setCurrentUser(sessionInfo.user)

      try {
        const adminProbe = await callApi<{ users?: UserProfile[] }>(`/api/admin/users?search=${encodeURIComponent(sessionInfo.user.email)}&limit=1`, {
          method: "GET"
        })

        const userRecord = adminProbe.data?.users?.[0]
        if (userRecord) {
          const resolvedRole = userRecord.role ? ALLOWED_ROLES[userRecord.role] : null
          const finalRole: AccessRole | null = resolvedRole || (userRecord.isTrafficAgent ? "traffic" : null)

          if (finalRole) {
            setAccessRole(finalRole)
            setAccessState("allowed")
            return
          }
        }
      } catch (error) {
        console.warn("管理员权限探测失败", error)
      }

      const trafficAllowed = await requestTrafficProbe(sessionInfo.user.id)
      if (trafficAllowed) {
        setAccessRole("traffic")
        setAccessState("allowed")
        return
      }

      setAccessState("forbidden")
      setAccessRole(null)
      throw new Error("当前账号没有访问权限，仅管理员或流量手可使用该页面")
    } catch (error) {
      console.error("权限校验失败", error)
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "权限校验失败"
      })
    }
  }, [callApi, fetchSessionStatus, requestTrafficProbe])

  useEffect(() => {
    if (!sessionId) {
      setAccessState("missing-session")
      setAccessRole(null)
      setCurrentUser(null)
      return
    }

    storeSessionId(sessionId)

    let cancelled = false

    const verify = async () => {
      try {
        await determineAccess(sessionId)
      } catch (error) {
        if (!cancelled) {
          console.warn("Access verification failed", error)
        }
      }
    }

    verify()

    return () => {
      cancelled = true
    }
  }, [sessionId, determineAccess, storeSessionId])

  const fetchUserByEmail = useCallback(async (email: string) => {
    if (!accessRole) {
      throw new Error("当前账号暂无权限使用该功能")
    }

    const basePath = "/api/admin/users"

    const response = await callApi<{ users?: UserProfile[] }>(`${basePath}?search=${encodeURIComponent(email)}&limit=1`, {
      method: "GET"
    })

    const matched = response.data?.users?.[0]
    if (matched) {
      return matched
    }

    return null
  }, [accessRole, callApi])

  const fetchUserConfig = useCallback(async (userId: number) => {
    if (accessRole !== "admin") {
      setUserConfig(null)
      return
    }

    setIsLoadingConfig(true)
    setUserConfig(null)
    setFeedback(null)

    const candidateEndpoints = [
      `/api/admin/users/${userId}/config`,
      `/api/admin/user-config/${userId}`,
      `/api/admin/user-config?userId=${userId}`
    ]

    try {
      for (const endpoint of candidateEndpoints) {
        try {
          const response = await callApi<Record<string, unknown> | { config?: Record<string, unknown> }>(endpoint, {
            method: "GET"
          })

          const configData = (response.data as any)?.config ?? response.data
          if (configData && typeof configData === "object") {
            setUserConfig(configData as Record<string, unknown>)
            return
          }
        } catch (error) {
          console.warn(`尝试从 ${endpoint} 获取配置失败`, error)
        }
      }

      setUserConfig(null)
      setFeedback({
        type: "error",
        message: "未能获取到该用户的详细配置信息，请确认后端已提供相关接口"
      })
    } finally {
      setIsLoadingConfig(false)
    }
  }, [accessRole, callApi])

  const handleSearch = useCallback(async () => {
    setFeedback(null)

    if (!sessionId) {
      setFeedback({ type: "error", message: "请先输入管理员会话ID" })
      return
    }

    if (!accessRole) {
      setFeedback({ type: "error", message: "当前账号暂无权限使用该功能" })
      return
    }

    const trimmedEmail = searchEmail.trim().toLowerCase()
    if (!trimmedEmail) {
      setFeedback({ type: "error", message: "请输入需要查询的邮箱" })
      return
    }

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailPattern.test(trimmedEmail)) {
      setFeedback({ type: "error", message: "请输入有效的邮箱地址" })
      return
    }

    setIsSearching(true)
    setSelectedUser(null)
    setUserConfig(null)

    try {
      const user = await fetchUserByEmail(trimmedEmail)
      if (!user) {
        setFeedback({ type: "error", message: "未找到匹配的用户" })
        return
      }

      setSelectedUser(user)
      await fetchUserConfig(user.id)
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "查询用户失败"
      })
    } finally {
      setIsSearching(false)
    }
  }, [accessRole, fetchUserByEmail, fetchUserConfig, searchEmail, sessionId])

  const handleCreditsSubmit = useCallback(async () => {
    if (!selectedUser) {
      setFeedback({ type: "error", message: "请先搜索并选择用户" })
      return
    }

    const amount = Number(creditInput)
    if (!Number.isFinite(amount) || amount <= 0) {
      setFeedback({ type: "error", message: "请输入大于0的积分数量" })
      return
    }

    const payload: CreditUpdatePayload = {
      userId: selectedUser.id,
      operation: "add",
      amount,
      description: `Console credit adjustment by ${currentUser?.username || currentUser?.email || "operator"}`
    }

    try {
      const response = await callApi<{ user?: UserProfile; newBalance?: number }>("/api/admin/users/credits", {
        method: "PUT",
        body: JSON.stringify(payload)
      })

      const updatedUser = response.data?.user
      const newBalance = response.data?.newBalance

      setFeedback({
        type: "success",
        message: response.message || "积分添加成功"
      })

      setSelectedUser(prev => {
        if (!prev) return prev
        const points = updatedUser?.points ?? newBalance ?? prev.points ?? 0
        return {
          ...prev,
          points
        }
      })
      setCreditInput("")
    } catch (error) {
      setFeedback({
        type: "error",
        message: error instanceof Error ? error.message : "积分更新失败"
      })
    }
  }, [accessRole, callApi, creditInput, currentUser, selectedUser])

  const handleSessionSubmit = useCallback((event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFeedback(null)

    const trimmed = sessionIdInput.trim()
    setSessionId(trimmed)
  }, [sessionIdInput])

  const handleClearSession = useCallback(() => {
    setSessionId("")
    setSessionIdInput("")
    storeSessionId("")
    setAccessState("missing-session")
    setAccessRole(null)
    setCurrentUser(null)
    setSelectedUser(null)
    setUserConfig(null)
    setFeedback(null)
  }, [storeSessionId])

  const formattedUserMeta = useMemo(() => {
    if (!selectedUser) {
      return []
    }

    const entries: Array<{ label: string; value: string }> = []

    const push = (label: string, value: unknown) => {
      if (value === null || value === undefined || value === "") {
        return
      }
      if (typeof value === "boolean") {
        entries.push({ label, value: value ? "是" : "否" })
        return
      }
      if (value instanceof Date) {
        entries.push({ label, value: formatDate(value) })
        return
      }
      if (typeof value === "string") {
        if (isDateString(value)) {
          entries.push({ label, value: formatDate(new Date(value)) })
        } else {
          entries.push({ label, value })
        }
        return
      }
      entries.push({ label, value: String(value) })
    }

    push("用户ID", selectedUser.id)
    push("邮箱", selectedUser.email)
    push("用户名", selectedUser.username)
    push("角色", selectedUser.role)
    push("是否为流量手", selectedUser.isTrafficAgent)
    push("是否为付费用户", selectedUser.isPaidUser)
    push("是否激活", selectedUser.isActive)
    push("积分余额", selectedUser.points)
    push("累计充值", selectedUser.totalRechargeAmount)
    push("创建时间", selectedUser.createdAt)
    push("更新时间", selectedUser.updatedAt)

    return entries
  }, [selectedUser])

  const sortedConfigEntries = useMemo(() => {
    if (!userConfig) return []

    return Object.entries(userConfig)
      .map(([key, value]) => {
        let displayValue: string
        if (value === null) {
          displayValue = "null"
        } else if (value === undefined) {
          displayValue = "undefined"
        } else if (Array.isArray(value) || typeof value === "object") {
          displayValue = JSON.stringify(value, null, 2)
        } else {
          displayValue = String(value)
        }
        return { key, value: displayValue }
      })
      .sort((a, b) => a.key.localeCompare(b.key))
  }, [userConfig])

  return (
    <div className="min-h-screen w-full bg-slate-950 text-white">
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div className="rounded-2xl bg-slate-900/80 p-6 shadow-lg ring-1 ring-slate-800">
          <div className="flex flex-col gap-4">
            <div>
              <h1 className="text-xl font-semibold">用户搜索与积分管理</h1>
              <p className="mt-1 text-sm text-slate-300">
                仅限管理员与流量手使用。请提供有效的会话ID以校验权限。
              </p>
            </div>

            <form className="flex flex-col gap-3 sm:flex-row" onSubmit={handleSessionSubmit}>
              <div className="flex-1">
                <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-slate-400">
                  会话ID
                </label>
                <input
                  value={sessionIdInput}
                  onChange={(event) => setSessionIdInput(event.target.value)}
                  placeholder="粘贴 x-session-id"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                />
              </div>

              <div className="flex items-end gap-2">
                <button
                  type="submit"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-cyan-500 px-4 text-sm font-medium text-slate-950 shadow hover:bg-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-400 focus:ring-offset-2 focus:ring-offset-slate-900"
                >
                  绑定会话
                </button>
                {sessionId && (
                  <button
                    type="button"
                    onClick={handleClearSession}
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-700 px-4 text-sm font-medium text-slate-200 hover:border-slate-500 hover:text-white"
                  >
                    清除
                  </button>
                )}
              </div>
            </form>

            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-300">
              <p>
                当前状态：
                <span className="ml-2 font-semibold text-cyan-300">
                  {accessState === "missing-session" && "等待会话ID"}
                  {accessState === "checking" && "正在校验权限"}
                  {accessState === "allowed" && (accessRole === "admin" ? "管理员已授权" : "流量手已授权")}
                  {accessState === "forbidden" && "无权限访问"}
                </span>
              </p>
              {currentUser && (
                <p className="mt-1 text-xs text-slate-400">
                  登录账号：{currentUser.email}
                  {currentUser.username ? ` （${currentUser.username}）` : ""}
                </p>
              )}
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-slate-900/80 p-6 shadow-lg ring-1 ring-slate-800">
          <div className="flex flex-col gap-3">
            <h2 className="text-lg font-semibold">根据邮箱搜索用户</h2>
            <p className="text-sm text-slate-300">
              输入目标用户邮箱后点击搜索。仅在成功搜索后展示用户信息及操作。
            </p>

            <div className="flex flex-col gap-3 sm:flex-row">
              <input
                type="email"
                value={searchEmail}
                onChange={(event) => setSearchEmail(event.target.value)}
                placeholder="user@example.com"
                className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                disabled={accessState !== "allowed"}
              />
              <button
                type="button"
                onClick={handleSearch}
                disabled={accessState !== "allowed" || isSearching}
                className="inline-flex h-10 min-w-[110px] items-center justify-center rounded-xl bg-cyan-500 px-4 text-sm font-semibold text-slate-950 shadow-md transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-700 disabled:text-slate-300"
              >
                {isSearching ? "搜索中..." : "搜索"}
              </button>
            </div>
          </div>
        </div>

        {feedback && (
          <div
            className={`rounded-2xl border p-4 text-sm ${feedback.type === "success" ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-200" : "border-rose-500/30 bg-rose-500/10 text-rose-200"}`}
          >
            {feedback.message}
          </div>
        )}

        {selectedUser && (
          <div className="rounded-2xl bg-slate-900/80 p-6 shadow-lg ring-1 ring-slate-800">
            <div className="flex flex-col gap-4">
              <div>
                <h3 className="text-lg font-semibold">用户基本信息</h3>
                <p className="mt-1 text-sm text-slate-300">
                  包含角色、积分、激活状态等核心配置。
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {formattedUserMeta.map((item) => (
                  <div key={item.label} className="rounded-xl border border-slate-800 bg-slate-900/70 p-3">
                    <p className="text-xs text-slate-400">{item.label}</p>
                    <p className="mt-1 break-all text-sm font-medium text-slate-100">{item.value}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                <h4 className="text-sm font-semibold text-slate-200">积分操作</h4>
                <p className="mt-1 text-xs text-slate-400">
                  仅支持增加积分；如需设置具体值，请更新后台逻辑。
                </p>

                <div className="mt-3 flex flex-col gap-3 sm:flex-row">
                  <input
                    type="number"
                    min="1"
                    placeholder="输入要增加的积分"
                    value={creditInput}
                    onChange={(event) => setCreditInput(event.target.value)}
                    className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-sm focus:border-cyan-400 focus:outline-none focus:ring-2 focus:ring-cyan-500/40"
                  />
                  <button
                    type="button"
                    onClick={handleCreditsSubmit}
                    className="inline-flex h-10 min-w-[140px] items-center justify-center rounded-xl bg-emerald-500 px-4 text-sm font-semibold text-slate-950 shadow hover:bg-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-slate-900"
                  >
                    添加积分
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedUser && (
          <div className="rounded-2xl bg-slate-900/80 p-6 shadow-lg ring-1 ring-slate-800">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <h3 className="text-lg font-semibold">用户配置详情</h3>
                <p className="text-sm text-slate-300">
                  优先展示后台返回的全部字段，以便排查模型、语言等偏好。
                </p>
              </div>

              {isLoadingConfig && (
                <p className="text-sm text-slate-400">正在加载用户配置...</p>
              )}

              {!isLoadingConfig && !userConfig && (
                <p className="text-sm text-amber-200">
                  未获取到配置数据。若需支持，请在后端补充相关管理接口。
                </p>
              )}

              {sortedConfigEntries.length > 0 && (
                <div className="flex flex-col gap-3">
                  {sortedConfigEntries.map((entry) => (
                    <div key={entry.key} className="rounded-xl border border-slate-800 bg-slate-900/70 p-4">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
                        {entry.key}
                      </p>
                      <pre className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-100">
                        {entry.value}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function isDateString(value: string): boolean {
  if (!value) return false
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp)
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(date)
}

export default AdminUserCreditConsole
