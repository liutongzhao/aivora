import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import DashboardPage from "../../app/(user)/dashboard/page";
import type { AccountSnapshot } from "../../types/account";

const apiFetch = vi.fn();
const getAccountSnapshot = vi.fn();

vi.mock("../../lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

vi.mock("../../lib/account-service", () => ({
  getAccountSnapshot: (...args: unknown[]) => getAccountSnapshot(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

const snapshot: AccountSnapshot = {
  user: {
    id: "user-1",
    email: "user@example.com",
    username: "测试用户",
    role: "user",
    isActive: true,
    emailVerifiedAt: "2026-10-01T00:00:00Z",
    createdAt: "2026-09-01T00:00:00Z",
  },
  usage: {
    trialTotal: 5,
    trialUsed: 2,
    trialRemaining: 3,
    entitlementActive: false,
    entitlementExpiresAt: null,
    entitlementStatus: null,
  },
  entitlement: null,
  modelStatus: { total: 1, enabled: 1, visionCapable: 1, ready: true },
  desktopStatus: { connected: false, lastSeenAt: null },
  issues: [],
};

beforeEach(() => {
  apiFetch.mockImplementation(async (path: string) => {
    if (path.startsWith("/api/ai/tasks")) return { tasks: [], total: 0 };
    if (path === "/api/ai/models") return [{ name: "vision", display_name: "Vision" }];
    throw new Error(`Unexpected request ${path}`);
  });
  getAccountSnapshot.mockResolvedValue(snapshot);
});

describe("工作台状态", () => {
  it("shows an actionable trial state when the account still has free uses", async () => {
    render(<DashboardPage />);
    expect(await screen.findByText("免费体验")).toBeInTheDocument();
    expect(screen.getByText(/当前剩余|免费体验剩余/)).toBeInTheDocument();
  });

  it("clearly blocks access after the trial is exhausted", async () => {
    getAccountSnapshot.mockResolvedValueOnce({
      ...snapshot,
      usage: { ...snapshot.usage, trialRemaining: 0, trialUsed: 5 },
    });
    render(<DashboardPage />);
    expect(await screen.findByText("体验次数已用完")).toBeInTheDocument();
    expect(screen.getByText("当前账号没有可用额度，请先激活授权码。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /前往激活授权码/ })).toHaveAttribute("href", "/dashboard/profile");
  });

  it("points users to model settings when no model is configured", async () => {
    apiFetch.mockImplementation(async (path: string) => {
      if (path.startsWith("/api/ai/tasks")) return { tasks: [], total: 0 };
      if (path === "/api/ai/models") return [];
      throw new Error(`Unexpected request ${path}`);
    });
    getAccountSnapshot.mockResolvedValueOnce({ ...snapshot, modelStatus: { ...snapshot.modelStatus, ready: false } });
    render(<DashboardPage />);
    expect(await screen.findByText("尚未配置模型")).toBeInTheDocument();
    expect(screen.getByText("添加自己的 API 连接后即可使用。")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /管理模型/ })).toHaveAttribute("href", "/dashboard/settings");
  });
});
