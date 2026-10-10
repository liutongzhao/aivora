import { apiFetch } from "./api-client";
import type { AdminAuditLog, AdminOverview, AdminUserDetail, AdminUserFilters, AdminUserRow } from "../types/admin";
import type { AdminLicenseCode } from "../types/admin";

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

export async function listAdminLicenseCodes(status?: string): Promise<AdminLicenseCode[]> {
  const query = status ? `?status=${encodeURIComponent(status)}` : "";
  const result = await apiFetch<{ codes: Array<{
    id: string;
    batch_id: string;
    batch_name?: string | null;
    duration_months: number;
    suffix: string;
    status: string;
    activated_by: string | null;
    activated_at: string | null;
    created_at: string;
  }> }>(`/api/admin/license-codes${query}`);
  return result.codes.map((code) => ({
    id: code.id,
    batchId: code.batch_id,
    batchName: code.batch_name ?? null,
    durationMonths: code.duration_months,
    suffix: code.suffix,
    status: code.status,
    activatedBy: code.activated_by,
    activatedAt: code.activated_at,
    createdAt: code.created_at,
  }));
}

export async function listAdminAuditLogs(filters: {
  action?: string;
  resourceType?: string;
  search?: string;
  limit?: number;
  offset?: number;
} = {}): Promise<{ logs: AdminAuditLog[]; total: number }> {
  const query = new URLSearchParams();
  if (filters.action) query.set("action", filters.action);
  if (filters.resourceType) query.set("resource_type", filters.resourceType);
  if (filters.search?.trim()) query.set("search", filters.search.trim());
  query.set("limit", String(filters.limit ?? 50));
  query.set("offset", String(filters.offset ?? 0));
  const result = await apiFetch<{ logs: Array<{
    id: string;
    action: string;
    resource_type: string;
    resource_id: string | null;
    actor_email: string;
    details: Record<string, unknown>;
    created_at: string;
  }>; total: number }>(`/api/admin/audit-logs?${query.toString()}`);
  return {
    total: result.total,
    logs: result.logs.map((log) => ({
      id: log.id,
      action: log.action,
      resourceType: log.resource_type,
      resourceId: log.resource_id,
      actorEmail: log.actor_email,
      details: log.details,
      createdAt: log.created_at,
    })),
  };
}
