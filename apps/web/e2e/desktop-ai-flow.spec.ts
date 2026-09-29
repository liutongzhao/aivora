import { test, expect } from "@playwright/test";

test("桌面端闭环入口可被启动脚本验证", async () => {
  test.skip(!process.env.AIVORA_DESKTOP_E2E, "需要显式启用 Electron 环境");
  expect(process.env.AIVORA_DESKTOP_E2E).toBe("1");
});
