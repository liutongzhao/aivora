"use client";

import { FormEvent, useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { PublicShell } from "../../../components/layout/PublicShell";
import { BrandMark } from "../../../components/brand/BrandMark";
import { Button, Input } from "../../../components/ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const result = await apiFetch<{ message: string }>("/api/auth/password-reset/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "请求失败");
    } finally {
      setBusy(false);
    }
  }

  return <PublicShell><div className="auth-card motion-slide-up"><BrandMark compact /><div className="auth-heading"><span className="eyebrow">PASSWORD RESET</span><h1>找回密码</h1><p>输入注册邮箱，我们会发送重置链接。</p></div>{message && <div className="notice" role="status">{message}</div>}{error && <div className="notice" role="alert">{error}</div>}<form className="auth-form" onSubmit={submit}><label htmlFor="reset-email">邮箱<Input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoFocus /></label><Button type="submit" loading={busy} className="auth-submit">{busy ? "发送中" : "发送重置邮件"}</Button></form><p className="auth-footer"><a href="/login">返回登录</a></p></div></PublicShell>;
}
