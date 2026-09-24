import { TaskStatusBadge } from "./TaskStatusBadge";
import { AnswerViewer } from "./AnswerViewer";
import { Progress } from "../ui";

export function TaskDetail({ task, result }: { task: { mode: string; status: string; stage: string; progress: number; created_at: string }; result?: { content?: string; rawContent?: string; parsed?: Record<string, unknown> } | null }) {
  return <section className="task-detail motion-scale-in"><div className="task-detail-head"><div><span className="eyebrow">TASK DETAIL</span><h2>任务详情</h2><p className="muted">{new Date(task.created_at).toLocaleString("zh-CN")} · {task.mode}</p></div><TaskStatusBadge status={task.status} /></div><div className="task-detail-progress"><div><span>处理进度</span><strong>{task.progress}%</strong></div><Progress value={task.progress} label="任务处理进度" /><small>{task.stage}</small></div>{result && <AnswerViewer {...result} />}</section>;
}
