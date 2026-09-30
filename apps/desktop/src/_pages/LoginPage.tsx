import { FormEvent, useState } from 'react'
import { Minus, Square, X, LogIn } from 'lucide-react'
import appIcon from '../../assets/icons/win/aivora.ico'
import { config } from '../utils/config'

interface LoginResult {
  success: boolean
  error?: string
}

export function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (loading) return
    setError(null)
    setSuccess(false)

    if (!email || !password) {
      setError('请输入邮箱和密码')
      return
    }

    try {
      setLoading(true)
      const result: LoginResult = await window.electronAPI.loginWithCredentials({
        email: email.trim(),
        password
      })

      if (result.success) {
        setSuccess(true)
      } else {
        setError(result.error || '登录失败，请重试')
      }
    } catch (err) {
      console.error('登录失败:', err)
      setError('网络异常，请检查连接后重试')
    } finally {
      setLoading(false)
    }
  }

  const WindowHeader = () => (
    <div
      className="client-titlebar fixed inset-x-0 top-0 flex h-12 items-center justify-between px-4"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      <div className="client-brand"><img src={appIcon} alt="" width={22} height={22} />Aivora</div>
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}>
        <button
          className="h-7 w-7 rounded-full text-slate-400 hover:bg-slate-100"
          title="最小化" aria-label="最小化"
          onClick={() => window.electronAPI.windowControl?.('minimize')}
        >
          <Minus size={15} />
        </button>
        <button
          className="h-7 w-7 rounded-full text-slate-400 hover:bg-slate-100"
          title="最大化或还原" aria-label="最大化或还原"
          onClick={() => window.electronAPI.windowControl?.('toggle-maximize')}
        >
          <Square size={13} />
        </button>
        <button
          className="h-7 w-7 rounded-full text-slate-400 hover:bg-rose-50 hover:text-rose-500"
          title="关闭" aria-label="关闭"
          onClick={() => window.electronAPI.windowControl?.('close')}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  )

  return (
    <div className="client-login min-h-screen bg-[#f5f6fb] px-6 py-8">
      <WindowHeader />
      <div className="client-login-form w-full max-w-xl mx-auto mt-12 rounded-[32px] bg-white shadow-[0_25px_80px_rgba(15,23,42,0.1)] border border-gray-100 p-12 space-y-8">
        <div className="space-y-3 text-center">
          <div className="client-login-brand"><img src={appIcon} alt="" width={40} height={40} /><span>Aivora</span></div>
          <h1 className="text-2xl font-semibold text-slate-900">登录考试客户端</h1>
          <p className="text-sm text-slate-500">还没有账号？ <a className="font-medium text-blue-600 hover:text-blue-700" href={`${config.web.baseUrl}/register`} onClick={(event) => { event.preventDefault(); window.electronAPI.openLink?.(`${config.web.baseUrl}/register`) }}>注册</a></p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="email">
              邮箱账号
            </label>
            <input
              id="email"
              type="email"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50"
              placeholder="name@company.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700" htmlFor="password">
              登录密码
            </label>
            <input
              id="password"
              type="password"
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-50"
              placeholder="请输入密码"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </div>

          {error && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-600">
              登录成功，正在进入配置页面...
            </div>
          )}

          <button
            type="submit"
            className="w-full rounded-2xl bg-slate-900 py-3 text-sm font-medium text-[#ffffff] shadow-lg shadow-slate-900/20 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
            disabled={loading}
          >
            <LogIn size={16} aria-hidden="true" />
            {loading ? '登录中...' : '立即登录'}
          </button>
        </form>

      </div>
    </div>
  )
}

export default LoginPage
