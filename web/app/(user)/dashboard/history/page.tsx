"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

export default function HistoryPage() {
  const [tasks, setTasks] = useState<Array<{ id: string; mode: string; status: string; completed_at: string | null }>>([]);
  useEffect(() => { apiFetch<{ tasks: typeof tasks }>("/api/ai/tasks?limit=100").then((result) => setTasks(result.tasks.filter((task) => task.status === "completed"))).catch(() => undefined); }, []);
  return (
    <main className="container">
      <div className="hero"><div><div className="eyebrow">HISTORY</div><h1>历史记录</h1><p className="muted">查看已完成的 AI 任务和答案。</p></div></div>
      <div className="card">{tasks.length === 0 ? <p className="muted">暂无历史记录。</p> : <table className="table"><thead><tr><th>模式</th><th>状态</th><th>完成时间</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.mode}</td><td>{task.status}</td><td>{task.completed_at ? new Date(task.completed_at).toLocaleString("zh-CN") : "—"}</td></tr>)}</tbody></table>}</div>
    </main>
  );
}
