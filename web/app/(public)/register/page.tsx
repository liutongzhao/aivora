"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", username: "" });
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      await apiFetch("/api/auth/register", { method: "POST", body: JSON.stringify(form) });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    }
  }

  return (
    <main className="shell">
      <form className="form card" onSubmit={submit}>
        <div className="eyebrow">CREATE ACCOUNT</div>
        <h1>创建账号</h1>
        <p className="muted">密码至少 8 位，包含大小写字母和数字。</p>
        {error && <div className="notice">{error}</div>}
        <label>邮箱<input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label>
        <label>用户名<input value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label>
        <label>密码<input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label>
        <div className="form-actions">
          <button className="button">注册</button>
          <a className="button ghost" href="/login">返回登录</a>
        </div>
      </form>
    </main>
  );
}
