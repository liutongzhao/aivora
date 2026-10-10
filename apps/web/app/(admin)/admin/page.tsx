"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ServiceHealthGrid } from "../../../components/admin/ServiceHealthGrid";
import { getApiBase } from "../../../lib/api-client";
import { getAdminOverview } from "../../../lib/admin-service";

export default function AdminPage() {
  const [overview, setOverview] = useState<{ users: number; tasks: number; runningTasks: number } | null>(null);
  const [checks, setChecks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  useEffect(() => {
    getAdminOverview().then(setOverview).catch((reason) => setError(reason instanceof Error ? reason.message : "概览加载失败"));
    fetch(`${getApiBase()}/health/ready`).then((response) => response.json()).then((health) => setChecks(health.checks ?? {})).catch(() => undefined);
  }, []);
  const statuses = Object.values(checks);
  const healthLabel = statuses.length ? statuses.every((status) => status === "ok") ? "正常" : "异常" : "未知";
  return (
    <main className="container">
      <div className="app-page-heading"><div><div className="eyebrow">ADMIN CONSOLE</div><h1>管理后台</h1><p className="muted">管理用户、模型、任务和系统状态。</p></div></div>
      {error && <div className="notice" role="alert">{error}</div>}
      <section className="metric-grid admin-metric-grid">
        <div className="metric-card"><span>用户总数</span><strong>{overview?.users ?? "—"}</strong><small>已注册账号</small></div>
        <div className="metric-card"><span>任务总数</span><strong>{overview?.tasks ?? "—"}</strong><small>累计任务记录</small></div>
        <div className="metric-card"><span>运行中</span><strong>{overview?.runningTasks ?? "—"}</strong><small>需要关注的实时任务</small></div>
      </section>
      <div className="admin-overview"><div className="panel"><div className="panel-heading"><div><span className="eyebrow">OPERATIONS</span><h2>运营入口</h2><p className="muted">从这里处理用户、任务和授权生命周期。</p></div></div><div className="admin-link-list"><Link href="/admin/users"><span><strong>用户管理</strong><small>账号状态、额度与授权详情</small></span><span aria-hidden="true">→</span></Link><Link href="/admin/tasks"><span><strong>任务监控</strong><small>查看实时任务和失败原因</small></span><span aria-hidden="true">→</span></Link><Link href="/admin/models"><span><strong>模型目录</strong><small>控制全局模型可用状态</small></span><span aria-hidden="true">→</span></Link><Link href="/admin/licenses"><span><strong>授权码与期限</strong><small>生成批次并查看兑换状态</small></span><span aria-hidden="true">→</span></Link></div></div><div><span className="eyebrow">SYSTEM</span><h2 className="admin-health-title">服务状态 · {healthLabel}</h2><ServiceHealthGrid checks={checks} /></div></div>
    </main>
  );
}
