const SESSION_KEY = "aivora_session_id";

export function getWebSessionId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(SESSION_KEY);
}

export function setWebSessionId(value: string): void {
  window.localStorage.setItem(SESSION_KEY, value);
}

export function clearWebSessionId(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(SESSION_KEY);
}
