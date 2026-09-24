import Link from "next/link";

export default function DashboardPage() {
  return (
    <main className="container">
      <section className="hero">
        <div><div className="eyebrow">AI WORKSPACE</div><h1>你的工作台</h1><p className="muted">集中管理 AI 任务、模型配置和桌面设备。</p></div>
        <Link className="button" href="/dashboard/tasks">查看任务</Link>
      </section>
      <section className="grid">
        <div className="card"><div className="muted">进行中的任务</div><div className="stat">0</div><div className="muted">实时同步</div></div>
        <div className="card"><div className="muted">历史任务</div><div className="stat">0</div><div className="muted">保存在你的账户中</div></div>
        <div className="card"><div className="muted">默认模型</div><div className="stat">Sol</div><div className="muted">OpenAI 兼容接口</div></div>
      </section>
    </main>
  );
}
