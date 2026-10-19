import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SettingsPage from "./page";

const apiFetch = vi.fn();
vi.mock("../../../../lib/api-client", () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }));

const connections = [
  { id: "connection-a", name: "Pixel", base_url: "https://pixel.example/v1", enabled: true },
  { id: "connection-b", name: "另一供应商", base_url: "https://other.example/v1", enabled: true },
];

beforeEach(() => {
  apiFetch.mockReset();
  apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
    if (path === "/api/user/connections") return connections;
    if (path === "/api/user/models") return [];
    if (path === "/api/user/models/defaults") return [];
    if (path === "/api/user/trial-model") return { enabled: true, display_name: "Aivora 内置模型", model_name: "gpt-6-sol", trial_total: 20, trial_used: 2, trial_remaining: 18 };
    if (path === "/api/user/connections/connection-a/test") return { models: ["vision-model"] };
    if (path === "/api/user/models" && init?.method === "POST") return {};
    throw new Error(`Unexpected request: ${path}`);
  });
});

describe("模型设置", () => {
  it("discovers and saves one selected model without changing routing", async () => {
    render(<SettingsPage />);
    fireEvent.click(await screen.findByRole("button", { name: "添加模型" }));
    fireEvent.change(screen.getByLabelText("连接名称"), { target: { value: "Pixel" } });
    fireEvent.change(screen.getByLabelText("API 地址"), { target: { value: "https://pixel.example/v1" } });
    fireEvent.change(screen.getByLabelText("API 密钥"), { target: { value: "secret-api-key" } });
    apiFetch.mockImplementation(async (path: string, init?: RequestInit) => {
      if (path === "/api/user/connections") return connections;
      if (path === "/api/user/models") return [];
      if (path === "/api/user/models/defaults") return [];
      if (path === "/api/user/connections/test") return { models: ["vision-model"] };
      if (path === "/api/user/models/setup" && init?.method === "POST") return {};
      throw new Error(`Unexpected request: ${path}`);
    });
    fireEvent.click(screen.getByRole("button", { name: "获取模型" }));
    await screen.findByRole("option", { name: "vision-model" });
    fireEvent.click(screen.getByRole("button", { name: "保存模型" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/user/models/setup",
      expect.objectContaining({
        method: "POST",
      }),
    ));
    expect(screen.getByText(/不会自动改变题型默认模型/)).toBeInTheDocument();
  });

  it("offers the built-in model with its remaining trial count", async () => {
    render(<SettingsPage />);
    const select = await screen.findByLabelText("编程题");
    expect(within(select).getByRole("option", { name: /内置.*18 次/ })).toBeInTheDocument();
  });
});
