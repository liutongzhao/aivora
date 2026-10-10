"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { apiFetch } from "../../../lib/api-client";
import { MetricCard } from "../../../components/dashboard/MetricCard";
import { RecentTasks } from "../../../components/dashboard/RecentTasks";
import { DesktopStatusCard } from "../../../components/dashboard/DesktopStatusCard";
import type { TaskSummary } from "../../../components/tasks/TaskList";
import { ArrowUpRight, Sparkles } from "lucide-react";
import { LicenseRedeemForm } from "../../../components/licenses/LicenseRedeemForm";
import { getAccountSnapshot } from "../../../lib/account-service";
import type { AccountSnapshot } from "../../../types/account";

type Task = TaskSummary;
type Model = { name: string; display_name: string };

export default function DashboardPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      apiFetch<{ tasks: Task[] }>("/api/ai/tasks?page=1&page_size=100"),
      apiFetch<Model[]>("/api/ai/models"),
      getAccountSnapshot(),
    ]).then(([taskResult, modelResult, accountSnapshot]) => {
      setTasks(taskResult.tasks);
      setModels(modelResult);
      setSnapshot(accountSnapshot);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : "数据加载失败"));
  }, []);

  const activeCount = tasks.filter((task) => ["queued", "processing", "streaming"].includes(task.status)).length;
  const completedCount = tasks.filter((task) => task.status === "completed").length;
  const failedCount = tasks.filter((task) => task.status === "failed").length;
  const usage = snapshot?.usage;
  const canUse = Boolean(usage?.entitlementActive || (usage && usage.trialRemaining > 0));

  return <main className="container">
    <section className="app-page-heading"><div><div className="eyebrow">OVERVIEW</div><h1>工作台</h1><p>把截图交给 Aivora，答案会在这里准备好。</p></div><div className="dashboard-heading-actions"><Link className="button" href="/dashboard/tasks">查看任务 <ArrowUpRight size={15} /></Link><Link className="button ghost" href="/dashboard/profile">个人中心</Link></div></section>
    {error && <div className="notice" role="alert">工作台数据暂时无法加载：{error}</div>}
    <section className="metric-grid"><MetricCard label="进行中的任务" value={activeCount} detail="当前队列" /><MetricCard label="已完成" value={completedCount} detail={`最近 ${tasks.length} 项任务`} /><MetricCard label="处理失败" value={failedCount} detail="可在任务页查看原因" /><MetricCard label={usage?.entitlementActive ? "授权有效期" : "免费试用剩余"} value={usage?.entitlementActive ? (usage.entitlementExpiresAt ? new Date(usage.entitlementExpiresAt).toLocaleDateString("zh-CN") : "有效") : usage?.trialRemaining ?? "—"} detail={usage?.entitlementActive ? "期限授权" : "激活授权码可继续使用"} /></section>
    <section className="dashboard-columns">
      <div className="panel"><div className="panel-heading"><div><span className="eyebrow">RECENT ACTIVITY</span><h2>最近任务</h2></div><Link href="/dashboard/history">查看全部 <ArrowUpRight size={14} /></Link></div>{tasks.length ? <RecentTasks tasks={tasks} /> : <div className="empty-inline"><Sparkles size={22} /><p>还没有任务，打开桌面端开始第一次处理。</p></div>}</div>
      <div className="workspace-side">
      <div className={`panel dashboard-access ${canUse ? "" : "is-blocked"}`}><div className="panel-heading"><div><span className="eyebrow">ACCESS</span><h2>{usage?.entitlementActive ? "期限授权有效" : usage?.entitlementStatus === "active" ? "授权已过期" : usage?.trialRemaining === 0 ? "体验次数已用完" : "免费体验"}</h2></div></div><p className="muted">{usage?.entitlementActive ? `有效期至 ${new Date(usage.entitlementExpiresAt ?? "").toLocaleDateString("zh-CN")}` : usage?.entitlementStatus === "active" ? "当前授权已过期，兑换新的授权码后即可继续使用。" : usage?.trialRemaining === 0 ? "当前账号没有可用额度，请先激活授权码。" : `已验证账号可免费体验 ${usage?.trialRemaining ?? 0} 次，当前剩余 ${usage?.trialRemaining ?? 0} 次。`}</p>{!canUse && <Link className="button secondary" href="/dashboard/profile">前往激活授权码 <ArrowUpRight size={14} /></Link>}{canUse && <LicenseRedeemForm onRedeemed={() => window.location.reload()} />}</div>
        <div className="panel model-summary"><span className="eyebrow">MODELS</span><strong>{models.length ? `${models.length} 个可用模型` : "尚未配置模型"}</strong><span>{models.length ? models.map((model) => model.display_name).slice(0, 3).join(" · ") : "添加自己的 API 连接后即可使用。"}</span><Link href="/dashboard/settings">管理模型 <ArrowUpRight size={14} /></Link></div>
        <DesktopStatusCard />
      </div>
    </section>
  </main>;
}
