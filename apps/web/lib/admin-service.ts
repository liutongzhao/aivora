import { apiFetch } from "./api-client";
import type { AdminOverview, AdminUserDetail, AdminUserFilters, AdminUserRow } from "../types/admin";

type ApiUserRow = {
  id: string;
  email: string;
  username?: string | null;
  role?: string;
  is_active?: boolean;
  status?: string;
  created_at?: string | null;
};

export async function getAdminOverview(): Promise<AdminOverview> {
  const result = await apiFetch<{ users: number; tasks: number; running_tasks: number }>("/api/admin/overview");
  return { users: Number(result.users), tasks: Number(result.tasks), runningTasks: Number(result.running_tasks) };
}

export async function listAdminUsers(filters: AdminUserFilters = {}): Promise<{ users: AdminUserRow[]; total: number }> {
  const query = new URLSearchParams();
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  if (filters.limit) query.set("limit", String(filters.limit));
  const result = await apiFetch<{ users: ApiUserRow[] }>(`/api/admin/users${query.size ? `?${query.toString()}` : ""}`);
  const users = result.users.map((user) => ({
    id: user.id,
    email: user.email,
    username: user.username ?? null,
    role: user.role ?? "user",
    status: user.status ?? (user.is_active === false ? "suspended" : "active"),
    isActive: user.is_active !== false,
    createdAt: user.created_at ?? null,
  }));
  return { users, total: users.length };
}

export async function getAdminUserDetail(userId: string): Promise<AdminUserDetail> {
  const result = await apiFetch<{
    user: AdminUserDetail["user"] & { created_at: string | null; last_login_at: string | null; email_verified: boolean };
    usage: { trial_total: number; trial_used: number; trial_remaining: number; task_count: number };
    entitlement: { status: string; starts_at: string; expires_at: string } | null;
  }>(`/api/admin/users/${userId}`);
  return {
    user: {
      id: result.user.id,
      email: result.user.email,
      username: result.user.username,
      status: result.user.status,
      emailVerified: result.user.email_verified,
      createdAt: result.user.created_at,
      lastLoginAt: result.user.last_login_at,
    },
    usage: {
      trialTotal: result.usage.trial_total,
      trialUsed: result.usage.trial_used,
      trialRemaining: result.usage.trial_remaining,
      taskCount: result.usage.task_count,
    },
    entitlement: result.entitlement ? {
      status: result.entitlement.status,
      startsAt: result.entitlement.starts_at,
      expiresAt: result.entitlement.expires_at,
    } : null,
  };
}
