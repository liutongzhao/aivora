import { getWebSessionId } from "./session";

const configuredApiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

export function getApiBase(): string {
  if (configuredApiBase) return configuredApiBase;
  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:18000`;
  }
  return "http://127.0.0.1:18000";
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const sessionId = getWebSessionId();
  let response: Response;
  try {
    response = await fetch(`${getApiBase()}${path}`, {
      ...init,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(sessionId ? { "X-Session-Id": sessionId } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch {
    throw new Error(`无法连接服务，请确认 API 服务正在运行（${getApiBase()}）`);
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body?.detail;
    const message = typeof detail === "string" ? detail : detail?.message;
    if (response.status === 401) throw new Error(message ?? "登录已失效，请重新登录");
    throw new Error(message ?? `请求失败（${response.status}）`);
  }
  return body as T;
}
