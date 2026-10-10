import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersPage from "./page";

const listAdminUsers = vi.fn();
const getAdminUserDetail = vi.fn();
const apiFetch = vi.fn();

vi.mock("../../../../lib/admin-service", () => ({
  listAdminUsers: (...args: unknown[]) => listAdminUsers(...args),
  getAdminUserDetail: (...args: unknown[]) => getAdminUserDetail(...args),
}));

vi.mock("../../../../lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

beforeEach(() => {
  listAdminUsers.mockResolvedValue({ total: 1, users: [{ id: "u1", email: "a@example.com", username: "A", role: "user", status: "active", isActive: true, createdAt: "2026-10-01" }] });
  getAdminUserDetail.mockResolvedValue({ user: { id: "u1", email: "a@example.com", username: "A", status: "active", emailVerified: true, createdAt: "2026-10-01", lastLoginAt: null }, usage: { trialTotal: 5, trialUsed: 1, trialRemaining: 4, taskCount: 2 }, entitlement: null });
  apiFetch.mockResolvedValue({ success: true });
});

describe("管理员用户管理", () => {
  it("filters users, opens a detail drawer, and clears stale details when filters change", async () => {
    render(<AdminUsersPage />);
    expect(await screen.findByText("a@example.com")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "查看详情" }));
    expect(await screen.findByRole("complementary", { name: "用户详情" })).toBeInTheDocument();
    expect(screen.getByText("4 / 5 次")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText("搜索邮箱或用户名"), { target: { value: "none" } });
    await waitFor(() => expect(listAdminUsers).toHaveBeenLastCalledWith({ search: "none", limit: 100 }));
    expect(screen.queryByText("4 / 5 次")).not.toBeInTheDocument();
  });
});
