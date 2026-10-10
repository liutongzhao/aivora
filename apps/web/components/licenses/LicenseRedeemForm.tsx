"use client";

import { FormEvent, useState } from "react";
import { apiFetch } from "../../lib/api-client";

type Props = {
  onRedeemed?: () => void;
};

export function LicenseRedeemForm({ onRedeemed }: Props) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await apiFetch<{ expiresAt: string }>("/api/licenses/redeem", {
        method: "POST",
        body: JSON.stringify({ code: code.trim().toUpperCase() }),
      });
      setCode("");
      setMessage(`授权已激活，有效期至 ${new Date(result.expiresAt).toLocaleDateString("zh-CN")}`);
      onRedeemed?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "授权码激活失败");
    } finally {
      setBusy(false);
    }
  }

  return <form className="form" onSubmit={submit} aria-label="激活授权码">
    <label htmlFor="license-code">授权码
      <input id="license-code" value={code} onChange={(event) => setCode(event.target.value)} placeholder="AVR-XXXXXX-XXXXXX-XXXXXX" autoComplete="off" required />
    </label>
    {message && <p className="muted" role="status">{message}</p>}
    {error && <p className="notice" role="alert">{error}</p>}
    <button className="button" type="submit" disabled={busy}>{busy ? "激活中..." : "激活授权码"}</button>
  </form>;
}
