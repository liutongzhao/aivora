"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowUpRight, RefreshCw, Settings2 } from "lucide-react";
import { getAccountSnapshot, getAccountUsageHistory } from "../../../../lib/account-service";
import type { AccountSnapshot, UsageRecord } from "../../../../types/account";
import { AccountOverview } from "../../../../components/account/AccountOverview";
import { EntitlementPanel } from "../../../../components/account/EntitlementPanel";
import { UsageHistory } from "../../../../components/account/UsageHistory";
import { ErrorState, LoadingState } from "../../../../components/ui";

export default function ProfilePage() {
  const [snapshot, setSnapshot] = useState<AccountSnapshot | null>(null);
  const [history, setHistory] = useState<UsageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else setLoading(true);
    setError("");
    try {
      const [nextSnapshot, nextHistory] = await Promise.all([getAccountSnapshot(), getAccountUsageHistory()]);
      setSnapshot(nextSnapshot);
      setHistory(nextHistory);
      if (nextSnapshot.issues.length) setError(nextSnapshot.issues.map((issue) => issue.message).join("；"));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "个人中心加载失败");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) return <main className="container"><LoadingState label="正在加载个人中心" /></main>;
  if (!snapshot) return <main className="container"><ErrorState message={error || "个人中心暂时无法加载"} onRetry={() => void load()} /></main>;

  return (
    <main className="container profile-page">
      <section className="app-page-heading">
        <div><div className="eyebrow">ACCOUNT CENTER</div><h1>个人中心</h1><p>统一管理账号、授权期限、体验额度和使用记录。</p></div>
        <button className="button ghost" type="button" onClick={() => void load(true)} disabled={refreshing}><RefreshCw size={15} className={refreshing ? "remote-spin" : ""} />刷新状态</button>
      </section>
      {error && <div className="notice" role="alert">部分数据暂时无法更新：{error}</div>}
      <AccountOverview snapshot={snapshot} />
      <div className="profile-grid">
        <EntitlementPanel snapshot={snapshot} onRedeemed={() => void load(true)} />
        <section className="panel profile-shortcuts">
          <div className="panel-heading"><div><span className="eyebrow">WORKSPACE</span><h2>常用入口</h2></div></div>
          <Link href="/dashboard/settings"><Settings2 size={17} />模型设置 <ArrowUpRight size={14} /></Link>
          <Link href="/dashboard/tasks"><RefreshCw size={17} />AI 任务 <ArrowUpRight size={14} /></Link>
          <Link href="/help"><span className="profile-shortcut-dot" />帮助与反馈 <ArrowUpRight size={14} /></Link>
        </section>
      </div>
      <UsageHistory records={history} />
    </main>
  );
}
