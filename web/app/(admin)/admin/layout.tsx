import Link from "next/link";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar"><Link className="brand" href="/admin">Aivora Admin</Link><nav className="nav"><Link href="/dashboard">用户端</Link><Link href="/admin/users">用户</Link><Link href="/admin/tasks">任务</Link><Link href="/admin/models">模型</Link></nav></header>
      {children}
    </div>
  );
}
