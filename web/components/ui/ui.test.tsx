import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Button, ErrorState } from "./index";
import { Toast } from "./Toast";

describe("基础交互组件", () => {
  it("renders a loading button with an accessible status", () => {
    render(<Button loading>保存</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button")).toBeDisabled();
  });

  it("renders an error state with retry action", () => {
    const retry = vi.fn();
    render(<ErrorState message="服务不可用" onRetry={retry} />);
    fireEvent.click(screen.getByRole("button", { name: "重试" }));
    expect(retry).toHaveBeenCalledOnce();
  });

  it("renders a transient toast with its message", () => {
    render(<Toast tone="success" message="连接已保存" onDismiss={() => undefined} />);
    expect(screen.getByRole("status")).toHaveTextContent("连接已保存");
  });
});
