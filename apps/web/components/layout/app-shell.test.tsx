import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";

describe("AppShell", () => {
  it("renders workspace navigation and an account menu", () => {
    render(
      <AppShell>
        <main>页面内容</main>
      </AppShell>,
    );

    expect(screen.getByRole("link", { name: /工作台/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /个人中心/ })).toBeInTheDocument();
    expect(screen.getByText("页面内容")).toBeInTheDocument();
  });

  it("opens the mobile navigation with an accessible toggle", () => {
    render(
      <AppShell>
        <main>页面内容</main>
      </AppShell>,
    );

    const toggle = screen.getByRole("button", { name: "打开导航菜单" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "导航菜单" })).toBeInTheDocument();
  });
});

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ replace: vi.fn() }),
}));
