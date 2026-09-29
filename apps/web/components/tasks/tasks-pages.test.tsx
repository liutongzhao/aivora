import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { TaskList } from "./TaskList";

describe("任务页面组件", () => {
  it("renders task progress and status", () => {
    render(<TaskList tasks={[{ id: "1", mode: "programming", status: "processing", stage: "ai_streaming", progress: 42, created_at: "2026-09-24T12:00:00Z" }]} onSelect={vi.fn()} />);
    expect(screen.getByText("处理中")).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("aria-valuenow", "42");
  });
});
