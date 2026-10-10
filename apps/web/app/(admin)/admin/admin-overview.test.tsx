import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AdminPage from "./page";

const getAdminOverview = vi.fn();
const fetchMock = vi.fn();

vi.mock("../../../lib/admin-service", () => ({
  getAdminOverview: (...args: unknown[]) => getAdminOverview(...args),
}));

vi.mock("../../../lib/api-client", () => ({
  getApiBase: () => "http://127.0.0.1:18000",
}));

beforeEach(() => {
  getAdminOverview.mockResolvedValue({ users: 120, tasks: 860, runningTasks: 4 });
  fetchMock.mockResolvedValue({ json: async () => ({ checks: { database: "ok", redis: "ok" } }) });
  vi.stubGlobal("fetch", fetchMock);
});

describe("管理概览", () => {
  it("shows operational metrics and actionable management links", async () => {
    render(<AdminPage />);
    expect(await screen.findByText("120")).toBeInTheDocument();
    expect(screen.getByText("860")).toBeInTheDocument();
    expect(screen.getByText("运行中")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /用户管理/ })).toHaveAttribute("href", "/admin/users");
    expect(screen.getByRole("link", { name: /授权码与期限/ })).toHaveAttribute("href", "/admin/licenses");
  });
});
