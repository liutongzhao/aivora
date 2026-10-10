import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ProfilePage from "./page";
import type { AccountSnapshot, UsageRecord } from "../../../../types/account";

const getAccountSnapshot = vi.fn();
const getAccountUsageHistory = vi.fn();
const apiFetch = vi.fn();

vi.mock("../../../../lib/account-service", () => ({
  getAccountSnapshot: (...args: unknown[]) => getAccountSnapshot(...args),
  getAccountUsageHistory: (...args: unknown[]) => getAccountUsageHistory(...args),
}));

vi.mock("../../../../lib/api-client", () => ({
  apiFetch: (...args: unknown[]) => apiFetch(...args),
}));

const baseSnapshot: AccountSnapshot = {
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

const history: UsageRecord[] = [
  {
    id: "usage-1",
    usageType: "trial",
    amount: 1,
    status: "consumed",
    createdAt: "2026-10-10T08:00:00Z",
    taskId: "task-1",
  },
];

beforeEach(() => {
  getAccountSnapshot.mockReset().mockResolvedValue(baseSnapshot);
  getAccountUsageHistory.mockReset().mockResolvedValue(history);
  apiFetch.mockReset().mockResolvedValue({ expiresAt: "2027-04-10T00:00:00Z" });
});

describe("个人中心", () => {
  it("shows account, trial balance, model readiness, and usage history", async () => {
    render(<ProfilePage />);

    expect(await screen.findByRole("heading", { name: "个人中心" })).toBeInTheDocument();
    expect(screen.getByText("user@example.com")).toBeInTheDocument();
    expect(screen.getByText("剩余 3 次")).toBeInTheDocument();
    expect(screen.getByText("模型已就绪")).toBeInTheDocument();
    expect(screen.getByText(/2026.*10.*10/)).toBeInTheDocument();
  });

  it("explains exhausted trial and expired entitlement states", async () => {
    getAccountSnapshot.mockResolvedValueOnce({
      ...baseSnapshot,
      usage: { ...baseSnapshot.usage, trialRemaining: 0, trialUsed: 5 },
      entitlement: {
        id: "entitlement-1",
        status: "expired",
        startsAt: "2026-04-10T00:00:00Z",
        expiresAt: "2026-10-01T00:00:00Z",
        source: "license_code",
      },
    });

    render(<ProfilePage />);

    expect(await screen.findByText("授权已过期")).toBeInTheDocument();
    expect(screen.getByText("体验次数已用完")).toBeInTheDocument();
    expect(screen.getByText("兑换授权码后继续使用")).toBeInTheDocument();
  });

  it("refreshes the account snapshot after redeeming a license", async () => {
    getAccountSnapshot
      .mockResolvedValueOnce(baseSnapshot)
      .mockResolvedValueOnce({
        ...baseSnapshot,
        usage: { ...baseSnapshot.usage, entitlementActive: true, trialRemaining: 0, entitlementStatus: "active", entitlementExpiresAt: "2027-04-10T00:00:00Z" },
        entitlement: {
          id: "entitlement-2",
          status: "active",
          startsAt: "2026-10-10T00:00:00Z",
          expiresAt: "2027-04-10T00:00:00Z",
          source: "license_code",
        },
      });

    render(<ProfilePage />);
    await screen.findByRole("heading", { name: "个人中心" });
    fireEvent.change(screen.getByLabelText("授权码"), { target: { value: "AVR-TEST" } });
    fireEvent.click(screen.getByRole("button", { name: "激活授权码" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/licenses/redeem",
      expect.objectContaining({ method: "POST" }),
    ));
    expect(await screen.findByText("期限授权有效")).toBeInTheDocument();
    expect(getAccountSnapshot).toHaveBeenCalledTimes(2);
  });
});
