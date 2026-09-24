import Link from "next/link";
import type { ReactNode } from "react";

export function Sidebar({ items }: { items: Array<{ href: string; label: string; icon: ReactNode }> }) {
  return <aside className="app-sidebar"><div className="sidebar-header"><span className="brand-symbol">A</span><span>Aivora</span></div><nav className="sidebar-nav">{items.map((item) => <Link href={item.href} key={item.href}><span className="sidebar-icon">{item.icon}</span><span>{item.label}</span></Link>)}</nav><div className="sidebar-footer"><span className="sidebar-footer-dot" />本地工作区</div></aside>;
}
