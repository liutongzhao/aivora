"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type Task = { id: string; user_id: string; mode: string; status: string; stage: string; progress: number; error_message: string | null; created_at: string };

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => { apiFetch<{ tasks: Task[] }>("/api/admin/tasks").then((result) => setTasks(result.tasks)).catch(() => undefined); }, []);
  return <main className="container"><div className="hero"><div><div className="eyebrow">ADMIN / TASKS</div><h1>任务监控</h1><p className="muted">查看 AI 任务处理状态和错误。</p></div></div><div className="card">{tasks.length === 0 ? <p className="muted">暂无任务数据。</p> : <table className="table"><thead><tr><th>用户</th><th>模式</th><th>状态</th><th>进度</th><th>创建时间</th></tr></thead><tbody>{tasks.map((task) => <tr key={task.id}><td>{task.user_id.slice(0, 8)}</td><td>{task.mode}</td><td>{task.status}</td><td>{task.progress}%</td><td>{new Date(task.created_at).toLocaleString("zh-CN")}</td></tr>)}</tbody></table>}</div></main>;
}
