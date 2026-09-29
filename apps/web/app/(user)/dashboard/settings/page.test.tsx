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
    if (path === "/api/user/connections/connection-a/test") return { models: ["vision-model"] };
    if (path === "/api/user/models" && init?.method === "POST") return {};
    throw new Error(`Unexpected request: ${path}`);
  });
});

describe("模型设置", () => {
  it("syncs models from a selected connection and adds one without typing its ID", async () => {
    render(<SettingsPage />);
    const selector = await screen.findByRole("combobox", { name: "" });
    fireEvent.change(selector, { target: { value: "connection-a" } });
    const discovered = await screen.findByText("vision-model");
    fireEvent.click(within(discovered.parentElement!).getByRole("button", { name: "添加" }));

    await waitFor(() => expect(apiFetch).toHaveBeenCalledWith(
      "/api/user/models",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          connection_id: "connection-a",
          name: "vision-model",
          display_name: "vision-model",
          supports_vision: true,
        }),
      }),
    ));
    fireEvent.change(selector, { target: { value: "connection-b" } });
    expect(screen.queryByText("vision-model")).not.toBeInTheDocument();
  });
});
