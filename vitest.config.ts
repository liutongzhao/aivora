import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["./web/test/setup.ts"],
    globals: true,
    exclude: ["**/node_modules/**", "**/dist/**", "web/e2e/**"],
  },
});
