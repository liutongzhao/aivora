import Link from "next/link";
import { modes, type TaskSummary } from "../tasks/TaskList";
import { TaskStatusBadge } from "../tasks/TaskStatusBadge";

export function RecentTasks({ tasks }: { tasks: TaskSummary[] }) {
  return <div className="recent-tasks">{tasks.slice(0, 5).map((task) => <Link href={`/dashboard/tasks?id=${task.id}`} className="recent-task" key={task.id}><div><strong>{modes[task.mode] ?? task.mode}</strong><small>{new Date(task.created_at).toLocaleString("zh-CN")}</small></div><TaskStatusBadge status={task.status} /></Link>)}</div>;
}
