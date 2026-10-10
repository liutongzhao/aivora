"use client";

import { FormEvent, useState } from "react";
import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import { PublicShell } from "../../../components/layout/PublicShell";
import { BrandMark } from "../../../components/brand/BrandMark";
import { PasswordRules } from "../../../components/auth/PasswordRules";
import { Button, Input } from "../../../components/ui";

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get("token") ?? "";
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiFetch("/api/auth/password-reset/confirm", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage("密码已重置，正在返回登录页...");
      window.setTimeout(() => router.replace("/login"), 900);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "密码重置失败");
    } finally {
      setBusy(false);
    }
  }

  return <PublicShell><div className="auth-card motion-slide-up"><BrandMark compact /><div className="auth-heading"><span className="eyebrow">PASSWORD RESET</span><h1>设置新密码</h1><p>设置新密码后，旧登录会话会全部退出。</p></div>{message && <div className="notice" role="status">{message}</div>}{error && <div className="notice" role="alert">{error}</div>}<form className="auth-form" onSubmit={submit}><label htmlFor="new-password">新密码<Input id="new-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required autoFocus /></label><PasswordRules /><Button type="submit" loading={busy} className="auth-submit" disabled={!token}>{busy ? "保存中" : "重置密码"}</Button></form></div></PublicShell>;
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<PublicShell><div className="auth-card"><p className="muted">正在加载重置页面...</p></div></PublicShell>}><ResetPasswordForm /></Suspense>;
}
