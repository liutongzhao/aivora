"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../../lib/api-client";
import { PublicShell } from "../../../components/layout/PublicShell";
import { BrandMark } from "../../../components/brand/BrandMark";
import { PasswordRules } from "../../../components/auth/PasswordRules";
import { Button, Input } from "../../../components/ui";

export default function RegisterPage() {
  const router = useRouter();
  const [form, setForm] = useState({ email: "", password: "", username: "" });
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [step, setStep] = useState<"email" | "code" | "profile">("email");
  const [cooldown, setCooldown] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setInterval(() => setCooldown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [cooldown]);

  async function sendCode() {
    setError("");
    setBusy(true);
    try {
      await apiFetch("/api/auth/registration/send-code", {
        method: "POST",
        body: JSON.stringify({ email: form.email }),
      });
      setStep("code");
      setCooldown(60);
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码发送失败");
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    setError("");
    setBusy(true);
    try {
      const result = await apiFetch<{ registration_ticket: string }>("/api/auth/registration/verify-code", {
        method: "POST",
        body: JSON.stringify({ email: form.email, code }),
      });
      setTicket(result.registration_ticket);
      setStep("profile");
    } catch (err) {
      setError(err instanceof Error ? err.message : "验证码校验失败");
    } finally {
      setBusy(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (step === "email") {
      await sendCode();
      return;
    }
    if (step === "code") {
      await verifyCode();
      return;
    }
    if (!ticket) {
      setError("邮箱验证已失效，请重新验证");
      return;
    }
    setBusy(true);
    try {
      await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ registration_ticket: ticket, password: form.password, username: form.username }),
      });
      router.push("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "注册失败");
    } finally {
      setBusy(false);
    }
  }

  const title = step === "email" ? "创建账号" : step === "code" ? "验证邮箱" : "设置账号";
  const action = step === "email" ? "发送验证码" : step === "code" ? "验证并继续" : "完成注册";
  return <PublicShell><div className="auth-card motion-slide-up"><BrandMark compact /><div className="auth-heading"><span className="eyebrow">CREATE ACCOUNT · {step.toUpperCase()}</span><h1>{title}</h1><p>{step === "email" ? "使用常用邮箱注册，验证后即可获得 5 次免费搜题体验。" : step === "code" ? `验证码已发送至 ${form.email}` : "设置登录信息，完成后即可进入工作台。"}</p></div>{error && <div className="notice" role="alert">{error}</div>}<form className="auth-form" onSubmit={submit}>
    {step === "email" && <label htmlFor="register-email">邮箱<Input id="register-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required autoFocus /></label>}
    {step === "code" && <><label htmlFor="register-code">6 位验证码<Input id="register-code" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} required autoFocus /></label><button type="button" className="text-button" disabled={cooldown > 0 || busy} onClick={() => void sendCode()}>{cooldown > 0 ? `${cooldown} 秒后可重新发送` : "重新发送验证码"}</button></>}
    {step === "profile" && <><label htmlFor="register-username">用户名<Input id="register-username" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} autoFocus /></label><label htmlFor="register-password">密码<Input id="register-password" type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required /></label><PasswordRules /></>}
    <Button type="submit" loading={busy} className="auth-submit">{busy ? "处理中" : action}</Button>
  </form>{step !== "email" && <button type="button" className="text-button" onClick={() => { setStep("email"); setTicket(""); setCode(""); }}>更换邮箱</button>}<p className="auth-footer">已经有账号？ <a href="/login">返回登录</a></p></div></PublicShell>;
}
