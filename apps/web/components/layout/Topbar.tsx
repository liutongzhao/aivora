import type { ReactNode } from "react";

export function Topbar({ title, action }: { title: string; action?: ReactNode }) {
  return <header className="app-topbar"><div><div className="topbar-kicker">AIVORA WORKSPACE</div><h1>{title}</h1></div><div className="topbar-actions">{action}</div></header>;
}
