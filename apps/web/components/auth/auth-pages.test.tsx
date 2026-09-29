import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import LoginPage from "../../app/(public)/login/page";

describe("认证页面", () => {
  it("shows the formal login layout and local service status", () => {
    render(<LoginPage />);
    expect(screen.getAllByText("Aivora").length).toBeGreaterThan(0);
    expect(screen.getByLabelText("邮箱")).toBeInTheDocument();
    expect(screen.getByText(/本地服务/)).toBeInTheDocument();
  });
});
