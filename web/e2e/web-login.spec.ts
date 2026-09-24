import { test, expect } from "@playwright/test";

test("登录页展示本地服务状态并可进入注册", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "欢迎回来" })).toBeVisible();
  await expect(page.getByText("本地服务正常")).toBeVisible();
  await page.getByRole("link", { name: "创建账号" }).click();
  await expect(page).toHaveURL(/\/register$/);
  await expect(page.getByRole("heading", { name: "创建账号" })).toBeVisible();
});
