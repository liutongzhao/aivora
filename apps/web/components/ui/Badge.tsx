import type { PropsWithChildren } from "react";

export function Badge({ children, tone = "neutral" }: PropsWithChildren<{ tone?: "neutral" | "info" | "success" | "warning" | "danger" }>) {
  return <span className={`ui-badge ui-badge-${tone}`}>{children}</span>;
}
