"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { AnswerViewer } from "../../../../components/tasks/AnswerViewer";
import { TaskStatusBadge } from "../../../../components/tasks/TaskStatusBadge";
import { modes } from "../../../../components/tasks/TaskList";
import { X } from "lucide-react";

type Task = { id: string; user_id: string; mode: string; status: string; stage: string; progress: number; error_message: string | null; created_at: string };
type Detail = { task: Task; answer: { content?: string; raw_content?: string; parsed?: Record<string, unknown>; parse_warning?: string | null } | null; images: { id: string; url: string; content_type: string }[] };

export default function AdminTasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<{ tasks: Task[] }>("/api/admin/tasks").then((result) => setTasks(result.tasks)).catch((reason) => setError(reason instanceof Error ? reason.message : "任务加载失败")); }, []);
  async function selectTask(task: Task) {
    setError("");
    try { setDetail(await apiFetch<Detail>(`/api/admin/tasks/${task.id}`)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "详情加载失败"); }
  }
  return <main className="container">
    <div className="app-page-heading"><div><div className="eyebrow">ADMIN / TASKS</div><h1>任务监控</h1><p className="muted">查看任务状态、截图和答案。</p></div><span className="muted task-count">{tasks.length} 项任务</span></div>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className={`admin-monitor ${detail ? "has-detail" : ""}`}>
      <div className="table-surface admin-table-wrap">{tasks.length === 0 ? <div className="empty-inline">暂无任务数据。</div> : <table className="table"><thead><tr><th>用户</th><th>模式</th><th>状态</th><th>进度</th><th>创建时间</th><th aria-label="查看详情" /></tr></thead><tbody>{tasks.map((task) => <tr className={detail?.task.id === task.id ? "is-active" : ""} key={task.id}><td>{task.user_id.slice(0, 8)}</td><td>{modes[task.mode] ?? task.mode}</td><td><TaskStatusBadge status={task.status} /></td><td>{task.progress}%</td><td>{new Date(task.created_at).toLocaleString("zh-CN")}</td><td><button className="button ghost" onClick={() => void selectTask(task)}>查看</button></td></tr>)}</tbody></table>}</div>
      {detail && <section className="admin-detail" aria-label="任务详情"><div className="panel-heading"><div><span className="eyebrow">TASK DETAIL</span><h2>{detail.task.id.slice(0, 12)}</h2><p className="muted">{modes[detail.task.mode] ?? detail.task.mode} · {new Date(detail.task.created_at).toLocaleString("zh-CN")}</p></div><button className="icon-button" title="关闭详情" aria-label="关闭详情" onClick={() => setDetail(null)}><X size={18} /></button></div>
        {detail.task.error_message && <div className="notice">{detail.task.error_message}</div>}
        <div className="admin-detail-columns"><div><h3>用户截图</h3>{detail.images.length ? <div className="admin-images">{detail.images.map((image, index) => <a key={image.id} href={image.url} target="_blank" rel="noreferrer"><img src={image.url} alt={`任务截图 ${index + 1}`} /><span>截图 {index + 1} · 点击查看原图</span></a>)}</div> : <p className="muted">暂无截图。</p>}</div><div><h3>处理结果</h3>{detail.answer ? <AnswerViewer content={detail.answer.content} rawContent={detail.answer.raw_content} parsed={detail.answer.parsed} warnings={detail.answer.parse_warning ? [detail.answer.parse_warning] : []} /> : <p className="muted">暂无答案。</p>}</div></div>
      </section>}
    </div>
  </main>;
}
