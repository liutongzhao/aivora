import { Badge } from "../ui";

const labels: Record<string, [string, "neutral" | "info" | "success" | "warning" | "danger"]> = {
  queued: ["排队中", "neutral"],
  processing: ["处理中", "info"],
  streaming: ["生成答案", "info"],
  completed: ["已完成", "success"],
  failed: ["失败", "danger"],
  cancelled: ["已取消", "warning"],
};

export function TaskStatusBadge({ status }: { status: string }) {
  const [label, tone] = labels[status] ?? [status, "neutral"];
  return <Badge tone={tone}>{label}</Badge>;
}
