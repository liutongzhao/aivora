"use client";

import type { PropsWithChildren } from "react";
import { useState } from "react";
import { LayoutDashboard, ListTodo, History, Settings2, Smartphone, UserRound, HelpCircle, Menu, X } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { AccountMenu } from "./AccountMenu";

const items = [
  { href: "/dashboard", label: "工作台", icon: <LayoutDashboard size={17} /> },
  { href: "/dashboard/tasks", label: "AI 任务", icon: <ListTodo size={17} /> },
  { href: "/dashboard/history", label: "历史记录", icon: <History size={17} /> },
  { href: "/dashboard/settings", label: "模型设置", icon: <Settings2 size={17} /> },
  { href: "/dashboard/profile", label: "个人中心", icon: <UserRound size={17} /> },
  { href: "/remote", label: "远程控制", icon: <Smartphone size={17} /> },
  { href: "/help", label: "帮助与反馈", icon: <HelpCircle size={17} /> },
];

export function AppShell({ children, navigation = items }: PropsWithChildren<{ navigation?: typeof items }>) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return <div className="app-shell">
      <Sidebar items={navigation} />
    <div className="app-content">
      <header className="app-topbar">
        <div className="topbar-leading">
          <button
            type="button"
            className="mobile-nav-toggle"
            aria-label={mobileOpen ? "关闭导航菜单" : "打开导航菜单"}
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((current) => !current)}
          >
            {mobileOpen ? <X size={19} aria-hidden="true" /> : <Menu size={19} aria-hidden="true" />}
          </button>
          <span className="topbar-location">Aivora Workspace</span>
        </div>
        <div className="topbar-actions"><AccountMenu /></div>
      </header>
      {mobileOpen && (
        <div className="mobile-nav-dialog" role="dialog" aria-label="导航菜单">
          <div className="mobile-nav-panel">
            <div className="mobile-nav-heading">工作区导航</div>
            <Sidebar items={navigation} onNavigate={() => setMobileOpen(false)} />
          </div>
        </div>
      )}
      <div className="page-shell">{children}</div>
    </div>
  </div>;
}
