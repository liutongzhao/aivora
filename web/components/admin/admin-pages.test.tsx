import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import AdminUsersPage from "../../app/(admin)/admin/users/page";

describe("管理后台", () => {
  it("renders the user management page", () => {
    render(<AdminUsersPage />);
    expect(screen.getByText("用户管理")).toBeInTheDocument();
  });
});
