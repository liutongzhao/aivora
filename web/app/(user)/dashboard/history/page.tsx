"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { TaskList, type TaskSummary } from "../../../../components/tasks/TaskList";

export default function HistoryPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  useEffect(() => { apiFetch<{ tasks: TaskSummary[] }>("/api/ai/tasks?limit=100").then((result) => setTasks(result.tasks.filter((task) => task.status === "completed"))).catch(() => undefined); }, []);
  return (
    <main className="container">
      <div className="app-page-heading"><div><div className="eyebrow">HISTORY</div><h1>历史记录</h1><p className="muted">查看已完成的 AI 任务和答案。</p></div></div>
      <div className="card">{tasks.length === 0 ? <p className="muted">暂无历史记录。</p> : <TaskList tasks={tasks} onSelect={() => undefined} />}</div>
    </main>
  );
}
