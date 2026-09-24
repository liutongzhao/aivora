import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  use: { baseURL: process.env.WEB_BASE_URL || "http://127.0.0.1:3000", ...devices["Desktop Chrome"] },
  reporter: "list",
});
