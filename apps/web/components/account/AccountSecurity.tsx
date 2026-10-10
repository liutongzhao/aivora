"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { Check, Laptop, MonitorSmartphone, Shield, ShieldAlert } from "lucide-react";
import { apiFetch } from "../../lib/api-client";
import { Button } from "../ui";

type AccountSession = {
  id: string;
  device_type: string;
  device_name: string | null;
  created_at: string;
  last_used_at: string;
  expires_at: string;
  is_current: boolean;
};

function formatDate(value: string) {
  return new Date(value).toLocaleString("zh-CN", { dateStyle: "medium", timeStyle: "short" });
}

function deviceLabel(session: AccountSession) {
  return session.device_name || (session.device_type === "web" ? "浏览器" : "其他设备");
}

export function AccountSecurity() {
  const [sessions, setSessions] = useState<AccountSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const result = await apiFetch<AccountSession[]>("/api/auth/sessions");
      setSessions(Array.isArray(result) ? result : []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "登录设备加载失败");
    } finally {
      setLoadingSessions(false);
    }
  }, []);

  useEffect(() => { void loadSessions(); }, [loadSessions]);

  async function changePassword(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (newPassword !== confirmPassword) {
      setError("两次输入的新密码不一致");
      return;
    }
    setSaving(true);
    try {
      const result = await apiFetch<{ message: string }>("/api/auth/password/change", {
        method: "POST",
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      setMessage(result.message);
      setOldPassword("");
      setNewPassword("");
      setConfirmPassword("");
      await loadSessions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "密码修改失败");
    } finally {
      setSaving(false);
    }
  }

  async function revokeOthers() {
    setMessage("");
    setError("");
    setRevoking(true);
    try {
      const result = await apiFetch<{ message: string }>("/api/auth/sessions/revoke-others", { method: "POST" });
      setMessage(result.message);
      await loadSessions();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "退出其他设备失败");
    } finally {
      setRevoking(false);
    }
  }

  return (
    <section className="account-security panel">
      <div className="panel-heading">
        <div>
          <span className="eyebrow">SECURITY</span>
          <h2>账号安全</h2>
          <p className="muted">修改密码并检查账号在哪些设备保持登录。</p>
        </div>
        <span className="entitlement-icon account-security-icon" aria-hidden="true"><Shield size={19} /></span>
      </div>
      {(message || error) && <div className={`notice account-security-notice ${error ? "is-error" : ""}`} role={error ? "alert" : "status"}>{error || message}</div>}
      <div className="account-security-grid">
        <form className="account-password-form" onSubmit={changePassword} aria-label="修改密码">
          <div className="form-panel-heading"><div><strong>修改密码</strong><span>使用至少 8 位、包含大小写字母和数字的新密码。</span></div></div>
          <label>原密码<input type="password" autoComplete="current-password" value={oldPassword} onChange={(event) => setOldPassword(event.target.value)} required /></label>
          <label>新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label>
          <label>确认新密码<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} required /></label>
          <Button type="submit" loading={saving}><Check size={15} aria-hidden="true" />修改密码</Button>
        </form>
        <div className="account-session-panel">
          <div className="account-session-heading">
            <div><strong>登录设备</strong><span>修改密码后，其他设备会自动退出。</span></div>
            <Button variant="ghost" type="button" onClick={() => void revokeOthers()} loading={revoking} disabled={sessions.filter((session) => !session.is_current).length === 0}>退出其他设备</Button>
          </div>
          {loadingSessions ? <p className="muted">正在加载设备...</p> : sessions.length === 0 ? <p className="muted">暂无活跃登录设备。</p> : <div className="account-session-list">{sessions.map((session) => <div className="account-session-row" key={session.id}><span className="account-session-icon" aria-hidden="true">{session.device_type === "web" ? <MonitorSmartphone size={16} /> : <Laptop size={16} />}</span><div><strong>{deviceLabel(session)} {session.is_current && <span className="ui-badge ui-badge-success">当前设备</span>}</strong><small>最近使用 {formatDate(session.last_used_at)} · 创建于 {formatDate(session.created_at)}</small></div>{session.is_current ? <ShieldAlert size={16} className="account-session-current" aria-label="当前登录设备" /> : null}</div>)}</div>}
        </div>
      </div>
    </section>
  );
}
