"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown, CircleUserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { apiFetch } from "../../lib/api-client";
import { clearWebSessionId } from "../../lib/session";

export function AccountMenu() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearWebSessionId();
    router.replace("/login");
  }

  return (
    <div className="account-menu">
      <button
        type="button"
        className="account-menu-trigger"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((current) => !current)}
      >
        <span className="user-avatar" aria-hidden="true">A</span>
        <span className="account-menu-label">我的账户</span>
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div className="account-menu-panel" role="menu">
          <div className="account-menu-heading">
            <CircleUserRound size={17} aria-hidden="true" />
            <span>账户中心</span>
          </div>
          <Link href="/dashboard/profile" role="menuitem" onClick={() => setOpen(false)}>个人中心</Link>
          <Link href="/dashboard/settings" role="menuitem" onClick={() => setOpen(false)}>模型配置</Link>
          <button type="button" role="menuitem" onClick={() => void logout()}>退出登录</button>
        </div>
      )}
    </div>
  );
}
