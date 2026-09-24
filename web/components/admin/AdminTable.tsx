import type { ReactNode } from "react";

export function AdminTable({ children }: { children: ReactNode }) {
  return <div className="admin-table-wrap"><table className="table">{children}</table></div>;
}
