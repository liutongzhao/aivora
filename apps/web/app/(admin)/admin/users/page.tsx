"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { AdminTable } from "../../../../components/admin/AdminTable";
import { ConfirmActionDialog } from "../../../../components/admin/ConfirmActionDialog";
import { listAdminUsers, getAdminUserDetail } from "../../../../lib/admin-service";
import type { AdminUserDetail, AdminUserRow } from "../../../../types/admin";
import { UserFilters } from "../../../../components/admin/UserFilters";
import { UserDetailDrawer } from "../../../../components/admin/UserDetailDrawer";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [pending, setPending] = useState<AdminUserRow | null>(null);
  const [detail, setDetail] = useState<AdminUserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [error, setError] = useState("");
  const load = async (nextSearch = search, nextStatus = status) => {
    setError("");
    try {
      const result = await listAdminUsers({ search: nextSearch, limit: 100 });
      setUsers(result.users.filter((user) => nextStatus === "all" || user.status === nextStatus));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "用户加载失败");
    }
  };
  useEffect(() => { void load(); }, []);
  async function openDetail(user: AdminUserRow) {
    setDetail(null);
    setDetailLoading(true);
    try { setDetail(await getAdminUserDetail(user.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "用户详情加载失败"); }
    finally { setDetailLoading(false); }
  }
  async function toggle(user: AdminUserRow) { await apiFetch(`/api/admin/users/${user.id}/status?is_active=${!user.isActive}`, { method: "PATCH" }); setPending(null); await load(); }
  async function grantTrial() {
    if (!detail) return;
    const amount = window.prompt("增加体验次数", "5");
    if (!amount || !/^\d+$/.test(amount) || Number(amount) < 1) return;
    const reason = window.prompt("调整原因", "管理员补发体验次数");
    if (!reason) return;
    try {
      await apiFetch(`/api/admin/users/${detail.user.id}/trial-adjustments`, { method: "POST", body: JSON.stringify({ amount: Number(amount), reason }) });
      setDetail(await getAdminUserDetail(detail.user.id));
      await load();
    } catch (reasonError) {
      setError(reasonError instanceof Error ? reasonError.message : "体验次数调整失败");
    }
  }
  function updateSearch(value: string) { setSearch(value); setDetail(null); void load(value, status); }
  function updateStatus(value: string) { setStatus(value); setDetail(null); void load(search, value); }
  return <main className="container"><div className="app-page-heading"><div><div className="eyebrow">ADMIN / USERS</div><h1>用户管理</h1><p className="muted">管理账号状态、免费体验额度和期限授权。</p></div><span className="page-heading-stat"><strong>{users.length}</strong><span>当前用户</span></span></div>{error && <div className="notice" role="alert">{error}</div>}<UserFilters search={search} status={status} onSearch={updateSearch} onStatus={updateStatus} onClear={() => { setSearch(""); setStatus("all"); setDetail(null); void load("", "all"); }} /><div className={`admin-monitor ${detail || detailLoading ? "has-detail" : ""}`}><div className="card"><AdminTable><thead><tr><th>账号</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr className={detail?.user.id === user.id ? "is-active" : ""} key={user.id}><td><strong>{user.email}</strong><small className="table-subline">{user.username || "未设置用户名"}</small></td><td>{user.role === "admin" ? "管理员" : "普通用户"}</td><td><span className={`ui-badge ${user.isActive ? "ui-badge-success" : "ui-badge-danger"}`}>{user.isActive ? "正常" : "已停用"}</span></td><td>{user.createdAt ? new Date(user.createdAt).toLocaleDateString("zh-CN") : "—"}</td><td><div className="actions"><button className="button ghost" onClick={() => void openDetail(user)}>查看详情</button><button className="button ghost" onClick={() => setPending(user)}>{user.isActive ? "停用" : "启用"}</button></div></td></tr>)}</tbody></AdminTable>{users.length === 0 && <p className="muted">没有符合条件的用户。</p>}</div>{(detail || detailLoading) && <UserDetailDrawer detail={detail} loading={detailLoading} onClose={() => setDetail(null)} onGrantTrial={() => void grantTrial()} />}</div>{pending && <ConfirmActionDialog title={`${pending.isActive ? "停用" : "启用"}用户`} description={`确定要${pending.isActive ? "停用" : "启用"} ${pending.email} 吗？`} onCancel={() => setPending(null)} onConfirm={() => void toggle(pending)} />}</main>;
}
