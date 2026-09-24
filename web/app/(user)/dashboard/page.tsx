"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";

type Task = { id: string; status: string; mode: string; created_at: string };
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
      <section className="hero">
        <div><div className="eyebrow">AI WORKSPACE</div><h1>你的工作台</h1><p className="muted">集中管理 AI 任务、模型配置和桌面设备。</p></div>
        <Link className="button" href="/dashboard/tasks">查看任务</Link>
      </section>
      <section className="grid">
        <div className="card"><div className="muted">进行中的任务</div><div className="stat">{activeCount}</div><div className="muted">实时同步</div></div>
        <div className="card"><div className="muted">历史任务</div><div className="stat">{tasks.length}</div><div className="muted">保存在你的账户中</div></div>
        <div className="card"><div className="muted">可用模型</div><div className="stat">{models.length}</div><div className="muted">{models[0]?.display_name ?? "尚未配置"}</div></div>
      </section>
    </main>
  );
}
