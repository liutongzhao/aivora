"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import { setWebSessionId } from "../../../lib/session";
import { PublicShell } from "../../../components/layout/PublicShell";
import { BrandMark } from "../../../components/brand/BrandMark";
import { Button, Input } from "../../../components/ui";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const result = await apiFetch<{ session_id: string; user: { role: string } }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, device_type: "web", device_name: "Aivora Web" }),
      });
      setWebSessionId(result.session_id);
      router.push(result.user.role === "admin" ? "/admin" : "/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return <PublicShell><div className="auth-card motion-slide-up"><BrandMark compact /><div className="auth-heading"><span className="eyebrow">SIGN IN</span><h1>欢迎回来</h1><p>登录你的 Aivora 工作台，继续处理任务。</p></div>{error && <div className="notice">{error}</div>}<form className="auth-form" onSubmit={submit}><label htmlFor="email">邮箱<Input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@company.com" required /></label><label htmlFor="password">密码<Input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="请输入密码" required /></label><Button type="submit" loading={loading} className="auth-submit">{loading ? "登录中" : "登录工作台"}</Button></form><p className="auth-footer"><a href="/forgot-password">忘记密码？</a></p><p className="auth-footer">还没有账号？ <a href="/register">创建账号</a></p></div></PublicShell>;
}
