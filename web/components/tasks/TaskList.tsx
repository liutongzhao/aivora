import { ArrowUpRight } from "lucide-react";
import { Progress } from "../ui";
import { TaskStatusBadge } from "./TaskStatusBadge";

export type TaskSummary = { id: string; mode: string; status: string; stage: string; progress: number; created_at: string };

const modes: Record<string, string> = { programming: "编程题", single_choice: "单选题", multiple_choice: "多选题", debug: "代码调试", universal: "通用题" };

export function TaskList({ tasks, onSelect }: { tasks: TaskSummary[]; onSelect: (task: TaskSummary) => void }) {
  return <div className="task-list">{tasks.map((task) => <button className="task-row" key={task.id} onClick={() => onSelect(task)}><div className="task-row-main"><div className="task-row-title">{modes[task.mode] ?? task.mode}<TaskStatusBadge status={task.status} /></div><div className="task-row-meta">{new Date(task.created_at).toLocaleString("zh-CN")} · {task.stage}</div></div><div className="task-row-progress">{["queued", "processing", "streaming"].includes(task.status) ? <Progress value={task.progress} /> : <span className="task-progress-copy">{task.status === "completed" ? "处理完成" : "查看详情"}</span>}<ArrowUpRight size={17} /></div></button>)}</div>;
}
