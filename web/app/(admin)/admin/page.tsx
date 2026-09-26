"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { ServiceHealthGrid } from "../../../components/admin/ServiceHealthGrid";
import { getApiBase } from "../../../lib/api-client";

export default function AdminPage() {
  const [overview, setOverview] = useState<{ users: number; tasks: number; running_tasks: number } | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    apiFetch<typeof overview>("/api/admin/overview").then(setOverview).catch((reason) => setError(reason instanceof Error ? reason.message : "概览加载失败"));
    fetch(`${getApiBase()}/health/ready`).then((response) => response.json()).then((health) => setChecks(health.checks ?? {})).catch(() => undefined);
  }, []);
  const statuses = Object.values(checks);
  const healthLabel = statuses.length ? statuses.every((status) => status === "ok") ? "正常" : "异常" : "未知";
  return (
    <main className="container">
      <div className="app-page-heading"><div><div className="eyebrow">ADMIN CONSOLE</div><h1>管理后台</h1><p className="muted">管理用户、模型、任务和系统状态。</p></div></div>
      {error && <div className="notice" role="alert">{error}</div>}
      <section className="metric-grid">
        <div className="metric-card"><span>用户总数</span><strong>{overview?.users ?? "—"}</strong></div>
        <div className="metric-card"><span>任务总数</span><strong>{overview?.tasks ?? "—"}</strong></div>
        <div className="metric-card"><span>运行中</span><strong>{overview?.running_tasks ?? "—"}</strong></div>
      </section>
      <div className="admin-overview"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">MANAGE</span><h2>管理入口</h2></div></div><div className="admin-link-list"><Link href="/admin/users">用户管理 <span>→</span></Link><Link href="/admin/tasks">任务监控 <span>→</span></Link><Link href="/admin/models">模型目录 <span>→</span></Link></div></div><div><span className="eyebrow">SYSTEM</span><h2 className="admin-health-title">服务状态 · {healthLabel}</h2><ServiceHealthGrid checks={checks} /></div></div>
    </main>
  );
}
