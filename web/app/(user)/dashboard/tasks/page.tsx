"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

export default function TasksPage() {
  const [tasks, setTasks] = useState<Array<{ id: string; mode: string; status: string; stage: string; progress: number; created_at: string }>>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ tasks: typeof tasks }>("/api/ai/tasks?limit=100")
      .then((result) => setTasks(result.tasks))
      .catch((err) => setError(err instanceof Error ? err.message : "任务加载失败"));
  }, []);

  return (
    <main className="container">
      <section className="hero"><div><div className="eyebrow">TASKS</div><h1>AI 任务</h1><p className="muted">查看任务状态和实时处理结果。</p></div><Link className="button" href="/dashboard/settings">配置模型</Link></section>
      <div className="card">
        {error && <div className="notice">{error}</div>}
        {!error && tasks.length === 0 && <p className="muted">还没有任务。桌面客户端提交截图后，任务会出现在这里。</p>}
        {tasks.length > 0 && <table className="table"><thead><tr><th>模式</th><th>状态</th><th>阶段</th><th>进度</th><th>创建时间</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.mode}</td><td>{task.status}</td><td>{task.stage}</td><td>{task.progress}%</td><td>{new Date(task.created_at).toLocaleString("zh-CN")}</td></tr>)}</tbody></table>}
      </div>
    </main>
  );
}
