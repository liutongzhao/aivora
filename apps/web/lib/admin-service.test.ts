import { afterEach, describe, expect, it, vi } from "vitest";
import { getAdminOverview, getAdminUserDetail, listAdminUsers } from "./admin-service";

const apiFetch = vi.fn();
vi.mock("./api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

afterEach(() => vi.clearAllMocks());

describe("admin service", () => {
  it("normalizes overview and user list data", async () => {
    apiFetch
      .mockResolvedValueOnce({ users: 12, tasks: 40, running_tasks: 3 })
      .mockResolvedValueOnce({ users: [{ id: "u1", email: "a@example.com", username: null, role: "user", is_active: true, created_at: "2026-10-01" }] });

    expect(await getAdminOverview()).toEqual({ users: 12, tasks: 40, runningTasks: 3 });
    expect(await listAdminUsers({ search: "a@example.com", limit: 10 })).toEqual({
      users: [{ id: "u1", email: "a@example.com", username: null, role: "user", status: "active", isActive: true, createdAt: "2026-10-01" }],
      total: 1,
    });
    expect(apiFetch).toHaveBeenLastCalledWith("/api/admin/users?search=a%40example.com&limit=10");
  });

  it("normalizes user detail and entitlement fields", async () => {
    apiFetch.mockResolvedValueOnce({
      user: { id: "u1", email: "a@example.com", username: "A", status: "active", email_verified: true, created_at: "2026-10-01", last_login_at: null },
      usage: { trial_total: 5, trial_used: 2, trial_remaining: 3, task_count: 4 },
      entitlement: { status: "active", starts_at: "2026-10-01", expires_at: "2027-04-01" },
    });
    expect(await getAdminUserDetail("u1")).toMatchObject({
      user: { email: "a@example.com", emailVerified: true },
      usage: { trialRemaining: 3, taskCount: 4 },
      entitlement: { status: "active", expiresAt: "2027-04-01" },
    });
  });
});
