import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function Sidebar({ items, onNavigate }: { items: Array<{ href: string; label: string; icon: ReactNode }>; onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <span className="brand-symbol">A</span>
        <div><strong>Aivora</strong><small>AI WORKSPACE</small></div>
      </div>
      <div className="sidebar-section-label">工作区</div>
      <nav className="sidebar-nav">
        {items.map((item) => {
          const active = pathname === item.href || (item.href !== "/dashboard" && pathname.startsWith(`${item.href}/`));
          return <Link className={active ? "is-active" : ""} href={item.href} key={item.href} aria-current={active ? "page" : undefined} onClick={onNavigate}>
            <span className="sidebar-icon">{item.icon}</span><span>{item.label}</span>{active && <i className="sidebar-active-mark" />}
          </Link>;
        })}
      </nav>
      <div className="sidebar-bottom"><div className="sidebar-version">Aivora · 2026</div></div>
    </aside>
  );
}
