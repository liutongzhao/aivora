"use client";

import type { PropsWithChildren } from "react";
import { useRouter } from "next/navigation";
import { LayoutDashboard, ListTodo, History, Settings2, Smartphone } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { apiFetch } from "../../lib/api-client";
import { clearWebSessionId } from "../../lib/session";

const items = [
  { href: "/dashboard", label: "工作台", icon: <LayoutDashboard size={17} /> },
  { href: "/dashboard/tasks", label: "AI 任务", icon: <ListTodo size={17} /> },
  { href: "/dashboard/history", label: "历史记录", icon: <History size={17} /> },
  { href: "/dashboard/settings", label: "模型设置", icon: <Settings2 size={17} /> },
  { href: "/remote", label: "远程控制", icon: <Smartphone size={17} /> },
];

export function AppShell({ children, navigation = items }: PropsWithChildren<{ navigation?: typeof items }>) {
  const router = useRouter();
  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearWebSessionId();
    router.replace("/login");
  }
  return <div className="app-shell">
      <Sidebar items={navigation} />
    <div className="app-content">
      <header className="app-topbar">
        <span className="topbar-location">Aivora Workspace</span>
        <div className="topbar-actions"><div className="user-menu"><span className="user-avatar">A</span><span className="user-name">我的工作区</span></div><button className="logout-button" onClick={logout}>退出登录</button></div>
      </header>
      <div className="page-shell">{children}</div>
    </div>
  </div>;
}
