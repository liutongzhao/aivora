"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { RecentTasks } from "../../../components/dashboard/RecentTasks";
import { DesktopStatusCard } from "../../../components/dashboard/DesktopStatusCard";
import type { TaskSummary } from "../../../components/tasks/TaskList";

type Task = TaskSummary;
type Model = { name: string; display_name: string };

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [models, setModels] = useState<Model[]>([]);

  useEffect(() => {
    Promise.all([
      apiFetch<{ tasks: Task[] }>("/api/ai/tasks?limit=100"),
      apiFetch<Model[]>("/api/ai/models"),
    ]).then(([taskResult, modelResult]) => {
      setTasks(taskResult.tasks);
      setModels(modelResult);
    }).catch(() => undefined);
  }, []);

  const activeCount = tasks.filter((task) => ["queued", "processing", "streaming"].includes(task.status)).length;

  return (
    <main className="container">
      <section className="app-page-heading"><div><div className="eyebrow">OVERVIEW</div><h1>工作台</h1><p className="muted">今天的任务和桌面工作流，都在这里。</p></div><Link className="button" href="/dashboard/tasks">查看全部任务</Link></section>
      <section className="metric-grid"><MetricCard label="进行中的任务" value={activeCount} detail="实时同步" /><MetricCard label="历史任务" value={tasks.length} detail="保存在你的账户中" /><MetricCard label="当前模型" value={models[0]?.display_name ?? "—"} detail={`${models.length} 个可用模型`} /></section>
      <section className="dashboard-columns"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>最近任务</h2></div><Link href="/dashboard/history">查看历史</Link></div>{tasks.length ? <RecentTasks tasks={tasks} /> : <div className="empty-inline">还没有任务，打开桌面端开始第一次处理。</div>}</div><DesktopStatusCard /></section>
    </main>
  );
}
