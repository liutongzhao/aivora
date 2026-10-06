import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import RemotePage from "./page";

const handlers: Record<string, (...args: any[]) => void> = {};
const socket = {
  on: vi.fn((event: string, handler: (...args: any[]) => void) => { handlers[event] = handler; }),
  emit: vi.fn(),
  timeout: vi.fn(),
  disconnect: vi.fn(),
  connected: true,
};
vi.mock("socket.io-client", () => ({ io: () => socket }));
vi.mock("../../lib/api-client", () => ({ getApiBase: () => "http://127.0.0.1:18000", apiFetch: vi.fn().mockResolvedValue([]) }));

beforeEach(() => {
  vi.clearAllMocks();
  Object.keys(handlers).forEach((key) => delete handlers[key]);
  window.localStorage.setItem("aivora_session_id", "test");
  socket.timeout.mockReturnValue(socket);
  socket.connected = true;
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

test("does not start a command when the socket is disconnected", async () => {
  render(<RemotePage />);
  fireEvent.change(screen.getByPlaceholderText("请输入连接码"), { target: { value: "1234ABCD" } });
  fireEvent.click(screen.getByRole("button", { name: "连接" }));
  await act(async () => { handlers.connect(); });
  const ack = socket.emit.mock.calls.find(([event]) => event === "remote:mobile_register")?.[2];
  await act(async () => {
    ack(null, { success: true, sessionId: "session-1" });
    handlers["remote:session_state"]({ status: "active", sessionId: "session-1", connectedAt: Date.now() });
  });
  socket.connected = false;
  fireEvent.click(screen.getByRole("button", { name: "截图" }));
  expect(socket.emit.mock.calls.some(([event]) => event === "remote:command")).toBe(false);
  expect(screen.getByText("连接已失效，请重新连接")).toBeTruthy();
  expect(screen.queryByText("发送中")).toBeNull();
});

test("marks a command as failed when the send acknowledgement times out", async () => {
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
  await act(async () => {
    command?.[2](new Error("timeout"), null);
  });
  expect(screen.getByText("失败")).toBeTruthy();
  expect(screen.getAllByText("发送超时，请重新连接后重试").length).toBeGreaterThan(0);
});

test("sends a command on an HTTP origin without crypto.randomUUID", async () => {
  const original = window.crypto.randomUUID;
  Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: undefined });
  try {
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
    expect(socket.emit.mock.calls.find(([event]) => event === "remote:command")?.[1].requestId).toMatch(/^[0-9a-f-]{36}$/);
  } finally {
    Object.defineProperty(window.crypto, "randomUUID", { configurable: true, value: original });
  }
});
