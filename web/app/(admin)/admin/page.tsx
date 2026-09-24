import Link from "next/link";

export default function AdminPage() {
  return (
    <main className="container">
      <div className="hero"><div><div className="eyebrow">ADMIN CONSOLE</div><h1>管理后台</h1><p className="muted">管理用户、模型、任务和系统状态。</p></div></div>
      <section className="grid">
        <div className="card"><div className="muted">用户</div><div className="stat">—</div></div>
        <div className="card"><div className="muted">运行任务</div><div className="stat">—</div></div>
        <div className="card"><div className="muted">服务状态</div><div className="stat">正常</div></div>
      </section>
      <div className="card" style={{ marginTop: 18 }}><div className="actions"><Link className="button secondary" href="/admin/users">用户管理</Link><Link className="button secondary" href="/admin/models">模型管理</Link><Link className="button secondary" href="/admin/tasks">任务监控</Link></div></div>
    </main>
  );
}
