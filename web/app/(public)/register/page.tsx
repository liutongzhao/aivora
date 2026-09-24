"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import { PublicShell } from "../../../components/layout/PublicShell";
import { BrandMark } from "../../../components/brand/BrandMark";
import { PasswordRules } from "../../../components/auth/PasswordRules";
import { Button, Input } from "../../../components/ui";

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

  return <PublicShell><div className="auth-card motion-slide-up"><BrandMark compact /><div className="auth-heading"><span className="eyebrow">CREATE ACCOUNT</span><h1>创建账号</h1><p>建立你的本地 AI 工作空间。</p></div>{error && <div className="notice">{error}</div>}<form className="auth-form" onSubmit={submit}><label htmlFor="register-email">邮箱<Input id="register-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></label><label htmlFor="register-username">用户名<Input id="register-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} /></label><label htmlFor="register-password">密码<Input id="register-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><PasswordRules /><Button type="submit" className="auth-submit">创建账号</Button></form><p className="auth-footer">已经有账号？ <a href="/login">返回登录</a></p></div></PublicShell>;
}
