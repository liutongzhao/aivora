"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { ServiceHealthGrid } from "../../../components/admin/ServiceHealthGrid";

export default function AdminPage() {
  const [overview, setOverview] = useState<{ users: number; tasks: number; running_tasks: number } | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  useEffect(() => { Promise.all([apiFetch<typeof overview>("/api/admin/overview"), fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:18000"}/health/ready`).then((response) => response.json())]).then(([result, health]) => { setOverview(result); setChecks(health.checks ?? {}); }).catch(() => undefined); }, []);
  return (
    <main className="container">
      <div className="app-page-heading"><div><div className="eyebrow">ADMIN CONSOLE</div><h1>管理后台</h1><p className="muted">管理用户、模型、任务和系统状态。</p></div></div>
      <section className="grid">
        <div className="card"><div className="muted">用户</div><div className="stat">{overview?.users ?? "—"}</div></div>
        <div className="card"><div className="muted">运行任务</div><div className="stat">{overview?.running_tasks ?? "—"}</div></div>
        <div className="card"><div className="muted">服务状态</div><div className="stat">正常</div></div>
      </section>
      <div className="card admin-links" style={{ marginTop: 18 }}><div className="actions"><Link className="button secondary" href="/admin/users">用户管理</Link><Link className="button secondary" href="/admin/models">模型管理</Link><Link className="button secondary" href="/admin/tasks">任务监控</Link></div></div><div className="admin-health"><ServiceHealthGrid checks={checks} /></div>
    </main>
  );
}
