"use client";

import { useEffect, useState } from "react";
import { listAdminAuditLogs } from "../../../../lib/admin-service";
import type { AdminAuditLog } from "../../../../types/admin";

const actionLabels: Record<string, string> = {
  user_suspended: "停用用户",
  user_reactivated: "恢复用户",
  trial_adjusted: "调整体验次数",
  license_settings_updated: "更新授权策略",
  license_batch_created: "生成授权码",
  license_code_revoked: "撤销授权码",
  entitlement_extended: "延长用户授权",
  entitlement_paused: "暂停用户授权",
  entitlement_revoked: "撤销用户授权",
};

function details(value: Record<string, unknown>) {
  return Object.entries(value).map(([key, item]) => `${key}: ${String(item)}`).join(" · ");
}

export default function AdminAuditPage() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState("");
  const [resourceType, setResourceType] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const result = await listAdminAuditLogs({ action, resourceType, search });
      setLogs(result.logs);
      setTotal(result.total);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "操作日志加载失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  return <main className="container">
    <div className="app-page-heading"><div><div className="eyebrow">ADMIN / AUDIT</div><h1>操作日志</h1><p className="muted">追踪管理员操作，敏感信息已自动脱敏。</p></div><span className="page-heading-stat"><strong>{total}</strong><span>条记录</span></span></div>
    {error && <div className="notice" role="alert">{error}</div>}
    <section className="panel audit-filter-panel">
      <div className="audit-filters">
        <label>搜索<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="操作、资源 ID" /></label>
        <label>操作类型<select value={action} onChange={(event) => setAction(event.target.value)}><option value="">全部操作</option>{Object.entries(actionLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
        <label>资源类型<select value={resourceType} onChange={(event) => setResourceType(event.target.value)}><option value="">全部资源</option><option value="user">用户</option><option value="license_code">授权码</option><option value="license_batch">授权批次</option><option value="license_settings">授权策略</option></select></label>
        <button className="button" type="button" onClick={() => void load()}>筛选</button>
      </div>
    </section>
    <section className="panel audit-list-panel">
      <div className="panel-heading"><div><span className="eyebrow">AUDIT TRAIL</span><h2>管理员活动</h2></div><span className="muted">{loading ? "加载中..." : `显示 ${logs.length} 条`}</span></div>
      <div className="admin-table-wrap"><table className="table"><thead><tr><th>时间</th><th>操作</th><th>管理员</th><th>资源</th><th>详情</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{new Date(log.createdAt).toLocaleString("zh-CN")}</td><td><strong>{actionLabels[log.action] ?? log.action}</strong><small className="table-subline">{log.action}</small></td><td>{log.actorEmail}</td><td>{log.resourceType}{log.resourceId ? ` · ${log.resourceId}` : ""}</td><td className="audit-detail-cell">{details(log.details)}</td></tr>)}</tbody></table>{!loading && logs.length === 0 && <p className="muted">暂无符合条件的操作记录。</p>}</div>
    </section>
  </main>;
}
