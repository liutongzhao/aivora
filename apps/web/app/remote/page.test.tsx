import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import RemotePage from "./page";

const handlers: Record<string, (...args: any[]) => void> = {};
const socket = {
  on: vi.fn((event: string, handler: (...args: any[]) => void) => { handlers[event] = handler; }),
  emit: vi.fn(),
  timeout: vi.fn(),
  disconnect: vi.fn(),
};
vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("../../lib/api-client", () => ({ getApiBase: () => "http://127.0.0.1:18000", apiFetch: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(handlers).forEach((key) => delete handlers[key]);
  window.localStorage.setItem("aivora_session_id", "test");
  socket.timeout.mockReturnValue(socket);
});

test("tracks a command by request id and shows its result", async () => {
  render(<RemotePage />);
  fireEvent.change(screen.getByPlaceholderText("请输入连接码"), { target: { value: "1234ABCD" } });
  fireEvent.click(screen.getByRole("button", { name: "连接" }));
  await act(async () => { handlers.connect(); });
  const ack = socket.emit.mock.calls.find(([event]) => event === "remote:mobile_register")?.[2];
  await act(async () => {
    ack(null, { success: true, sessionId: "session-1" });
    handlers["remote:session_state"]({ status: "active", sessionId: "session-1", connectedAt: Date.now() });
  });
  fireEvent.click(screen.getByRole("button", { name: "截图" }));
  const command = socket.emit.mock.calls.find(([event]) => event === "remote:command");
  expect(command).toBeDefined();
  await act(async () => {
    command?.[2](null, { success: true, status: "accepted" });
    handlers["remote:command_status"]({ requestId: command?.[1].requestId, status: "success" });
  });
  await waitFor(() => expect(screen.getByText("已完成")).toBeTruthy());
});

test("switches between command and connection history", async () => {
  render(<RemotePage />);
  fireEvent.click(screen.getByRole("tab", { name: "连接记录" }));
  expect(screen.getByRole("tab", { name: "连接记录" }).getAttribute("aria-selected")).toBe("true");
  expect(screen.getByText("暂无连接记录")).toBeTruthy();
  fireEvent.click(screen.getByRole("tab", { name: "操作记录" }));
  expect(screen.getByRole("tab", { name: "操作记录" }).getAttribute("aria-selected")).toBe("true");
});
