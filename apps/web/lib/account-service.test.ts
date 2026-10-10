import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getAccountEntitlements,
  getAccountSnapshot,
  type AccountSnapshot,
} from "./account-service";

const user = {
  id: "user-1",
  email: "user@example.com",
  username: "测试用户",
  role: "user",
  is_active: true,
  email_verified_at: "2026-10-01T00:00:00Z",
  created_at: "2026-09-01T00:00:00Z",
};

const usage = {
  trialTotal: 5,
  trialUsed: 2,
  trialRemaining: 3,
  entitlementActive: true,
  entitlementExpiresAt: "2027-04-01T00:00:00Z",
  entitlementStatus: "active",
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe("account service", () => {
  it("builds one normalized snapshot from account, usage, entitlement, and model data", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const path = new URL(input).pathname;
        const payload: Record<string, unknown> = {
          "/api/session_status": { success: true, user },
          "/api/account/usage": usage,
          "/api/account/entitlements": [
            {
              id: "entitlement-1",
              status: "active",
              starts_at: "2026-10-01T00:00:00Z",
              expires_at: "2027-04-01T00:00:00Z",
              source: "license_code",
            },
          ],
          "/api/ai/models": [
            {
              id: "model-1",
              name: "vision-model",
              display_name: "Vision Model",
              supports_vision: true,
              enabled: true,
            },
            {
              id: "model-2",
              name: "text-model",
              display_name: "Text Model",
              supports_vision: false,
              enabled: false,
            },
          ],
        };
        return new Response(JSON.stringify(payload[path]), { status: 200 });
      }),
    );

    const snapshot = await getAccountSnapshot();

    expect(snapshot.user.email).toBe("user@example.com");
    expect(snapshot.usage.trialRemaining).toBe(3);
    expect(snapshot.entitlement).toMatchObject({
      id: "entitlement-1",
      startsAt: "2026-10-01T00:00:00Z",
      expiresAt: "2027-04-01T00:00:00Z",
      source: "license_code",
    });
    expect(snapshot.modelStatus).toEqual({
      total: 2,
      enabled: 1,
      visionCapable: 1,
      ready: true,
    });
    expect(snapshot.issues).toEqual([]);
  });

  it("keeps usable data when one account dependency fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async (input: string) => {
        const path = new URL(input).pathname;
        if (path === "/api/ai/models") {
          return new Response(JSON.stringify({ detail: "模型服务不可用" }), { status: 503 });
        }
        const payload =
          path === "/api/session_status"
            ? { success: true, user }
            : path === "/api/account/usage"
              ? usage
              : [];
        return new Response(JSON.stringify(payload), { status: 200 });
      }),
    );

    const snapshot = await getAccountSnapshot();

    expect(snapshot.user.email).toBe("user@example.com");
    expect(snapshot.usage.entitlementActive).toBe(true);
    expect(snapshot.modelStatus).toEqual({
      total: 0,
      enabled: 0,
      visionCapable: 0,
      ready: false,
    });
    expect(snapshot.issues).toEqual([
      { source: "models", message: "模型服务不可用" },
    ]);
  });

  it("normalizes entitlement records from the API contract", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify([
            {
              id: "entitlement-1",
              status: "active",
              starts_at: "2026-10-01T00:00:00Z",
              expires_at: "2027-04-01T00:00:00Z",
              source: "license_code",
            },
          ]),
          { status: 200 },
        ),
      ),
    );

    await expect(getAccountEntitlements()).resolves.toEqual([
      {
        id: "entitlement-1",
        status: "active",
        startsAt: "2026-10-01T00:00:00Z",
        expiresAt: "2027-04-01T00:00:00Z",
        source: "license_code",
      },
    ]);
  });
});

const _typeCheck: AccountSnapshot | null = null;
void _typeCheck;
