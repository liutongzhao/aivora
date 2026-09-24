"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";

type User = { id: string; email: string; username: string | null; role: string; is_active: boolean };

export default function AdminUsersPage() {
  const [users, setUsers] = useState<User[]>([]);
  const load = () => apiFetch<{ users: User[] }>("/api/admin/users").then((result) => setUsers(result.users)).catch(() => undefined);
  useEffect(() => { void load(); }, []);
  async function toggle(user: User) { await apiFetch(`/api/admin/users/${user.id}/status?is_active=${!user.is_active}`, { method: "PATCH" }); await load(); }
  return <main className="container"><div className="hero"><div><div className="eyebrow">ADMIN / USERS</div><h1>用户管理</h1><p className="muted">账号状态和会话管理。</p></div></div><div className="card"><table className="table"><thead><tr><th>邮箱</th><th>角色</th><th>状态</th><th>操作</th></tr></thead><tbody>{users.map((user) => <tr key={user.id}><td>{user.email}</td><td>{user.role}</td><td>{user.is_active ? "正常" : "已停用"}</td><td><button className="button ghost" onClick={() => toggle(user)}>{user.is_active ? "停用" : "启用"}</button></td></tr>)}</tbody></table>{users.length === 0 && <p className="muted">暂无用户数据。</p>}</div></main>;
}
