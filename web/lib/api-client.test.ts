import { afterEach, describe, expect, it, vi } from "vitest";
import { apiFetch } from "./api-client";

describe("apiFetch", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    window.localStorage.clear();
  });

  it("adds the stored session id to API requests", async () => {
    window.localStorage.setItem("aivora_session_id", "session-test");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true }), { status: 200 }),
      ),
    );

    await apiFetch("/api/session_status");

    const expectedBase = `${window.location.protocol}//${window.location.hostname}:18000`;
    expect(fetch).toHaveBeenCalledWith(
      `${expectedBase}/api/session_status`,
      expect.objectContaining({
        headers: expect.objectContaining({ "X-Session-Id": "session-test" }),
      }),
    );
  });
});
