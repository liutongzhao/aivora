import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminUsersPage from "../../app/(admin)/admin/users/page";
import AdminLicensesPage from "../../app/(admin)/admin/licenses/page";

const apiFetch = vi.fn();
const listAdminLicenseCodes = vi.fn();

vi.mock("../../lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("../../lib/admin-service", () => ({
  listAdminUsers: vi.fn().mockResolvedValue({ users: [], total: 0 }),
  getAdminUserDetail: vi.fn(),
  listAdminLicenseCodes: (...args: unknown[]) => listAdminLicenseCodes(...args),
}));

beforeEach(() => {
  apiFetch.mockImplementation(async (path: string) => {
    if (path === "/api/admin/license-settings") return { defaultDurationMonths: 6, maxDurationMonths: 24 };
    return {};
  });
  listAdminLicenseCodes.mockResolvedValue([{
    id: "code-1",
    batchId: "batch-1",
    batchName: "首发用户",
    durationMonths: 6,
    suffix: "ABCD",
    status: "unused",
    activatedBy: null,
    activatedAt: null,
    createdAt: "2026-10-10T00:00:00Z",
  }]);
});

describe("管理后台", () => {
  it("renders the user management page", () => {
    render(<AdminUsersPage />);
    expect(screen.getByText("用户管理")).toBeInTheDocument();
  });

  it("shows license policy and masked code operations", async () => {
    render(<AdminLicensesPage />);
    expect(await screen.findByText("期限策略")).toBeInTheDocument();
    expect(screen.getByText("••••-ABCD")).toBeInTheDocument();
    expect(screen.getByText("未使用")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "撤销" })).toBeInTheDocument();
  });
});
