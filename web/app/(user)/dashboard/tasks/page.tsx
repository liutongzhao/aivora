import Link from "next/link";

export default function TasksPage() {
  return (
    <main className="container">
      <section className="hero"><div><div className="eyebrow">TASKS</div><h1>AI 任务</h1><p className="muted">查看任务状态和实时处理结果。</p></div><Link className="button" href="/dashboard/settings">配置模型</Link></section>
      <div className="card"><p className="muted">还没有任务。桌面客户端提交截图后，任务会出现在这里。</p></div>
    </main>
  );
}
