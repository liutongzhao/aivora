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

export function AppShell({ children }: PropsWithChildren) {
  const router = useRouter();
  async function logout() {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    clearWebSessionId();
    router.replace("/login");
  }
  return <div className="app-shell"><Sidebar items={items} /><div className="app-content"><div className="app-topbar"><span /><button className="button button-secondary" onClick={logout}>退出登录</button></div>{children}</div></div>;
}
