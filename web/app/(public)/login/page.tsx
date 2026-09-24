"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";

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
      const result = await apiFetch<{ session_id: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, device_type: "web", device_name: "Aivora Web" }),
      });
      window.localStorage.setItem("aivora_session_id", result.session_id);
      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell">
      <form className="form card" onSubmit={submit}>
        <div className="eyebrow">AIVORA WORKSPACE</div>
        <h1>欢迎回来</h1>
        <p className="muted">登录你的 AI 工作台。</p>
        {error && <div className="notice">{error}</div>}
        <label>邮箱<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        <div className="form-actions">
          <button className="button" disabled={loading}>{loading ? "登录中…" : "登录"}</button>
          <a className="button secondary" href="/register">注册账号</a>
        </div>
      </form>
    </main>
  );
}
