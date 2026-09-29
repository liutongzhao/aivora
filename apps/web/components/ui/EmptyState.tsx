import type { ReactNode } from "react";

export function EmptyState({ title, description, action }: { title: string; description: string; action?: ReactNode }) {
  return <div className="ui-empty"><div className="ui-empty-icon" aria-hidden="true">○</div><h3>{title}</h3><p>{description}</p>{action}</div>;
}
