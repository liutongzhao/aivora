import Link from "next/link";

export default function UserLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shell">
      <header className="topbar">
        <Link className="brand" href="/dashboard">Aivora</Link>
        <nav className="nav">
          <Link href="/dashboard">概览</Link>
          <Link href="/dashboard/tasks">任务</Link>
          <Link href="/dashboard/history">历史</Link>
          <Link href="/dashboard/settings">设置</Link>
          <Link href="/remote">远程</Link>
        </nav>
      </header>
      {children}
    </div>
  );
}
