"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { TaskList, type TaskSummary } from "../../../../components/tasks/TaskList";
import { TaskDetail } from "../../../../components/tasks/TaskDetail";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selected, setSelected] = useState<TaskSummary | null>(null);
  const [result, setResult] = useState<{ content?: string; rawContent?: string; parsed?: Record<string, unknown> } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    apiFetch<{ tasks: typeof tasks }>("/api/ai/tasks?limit=100")
      .then((result) => setTasks(result.tasks))
      .catch((err) => setError(err instanceof Error ? err.message : "任务加载失败"));
  }, []);
  useEffect(() => { if (!selected) return; apiFetch<{ result: typeof result }>(`/api/ai/tasks/${selected.id}`).then((data) => setResult(data.result)).catch(() => setResult(null)); }, [selected]);

  return (
    <main className="container">
      <section className="app-page-heading"><div><div className="eyebrow">TASKS</div><h1>AI 任务</h1><p className="muted">查看任务状态、进度和最终答案。</p></div><Link className="button secondary" href="/dashboard/settings">配置模型</Link></section>
      <div className="card">
        {error && <div className="notice">{error}</div>}
        {!error && tasks.length === 0 && <p className="muted">还没有任务。桌面客户端提交截图后，任务会出现在这里。</p>}
        {tasks.length > 0 && <TaskList tasks={tasks} onSelect={setSelected} />}
      </div>
      {selected && <TaskDetail task={selected} result={result} />}
    </main>
  );
}
