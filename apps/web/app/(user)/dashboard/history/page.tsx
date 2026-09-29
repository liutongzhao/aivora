"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "../../../../lib/api-client";
import { TaskWorkspace } from "../../../../components/tasks/TaskWorkspace";
import { type TaskSummary } from "../../../../components/tasks/TaskList";
import { Search } from "lucide-react";

export default function HistoryPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selected, setSelected] = useState<TaskSummary | null>(null);
  const [result, setResult] = useState<{ content?: string; rawContent?: string; parsed?: Record<string, unknown>; parseWarning?: string | null; images?: { id: string; url: string; contentType?: string }[] } | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  useEffect(() => { apiFetch<{ tasks: TaskSummary[]; total: number }>(`/api/ai/tasks?page=${page}&page_size=20&status=completed,failed`).then((result) => { setTasks(result.tasks); setTotal(result.total); setSelected(result.tasks[0] ?? null); }).catch((reason) => setError(reason instanceof Error ? reason.message : "历史记录加载失败")); }, [page]);
  useEffect(() => {
    if (!selected?.id) return;
    setResult(null);
    apiFetch<{ result: NonNullable<typeof result> }>(`/api/ai/tasks/${selected.id}`).then((response) => setResult(response.result)).catch((reason) => setError(reason instanceof Error ? reason.message : "答案加载失败"));
  }, [selected?.id]);
  const visible = tasks.filter((task) => (statusFilter === "all" || task.status === statusFilter) && `${task.mode} ${task.created_at}`.toLowerCase().includes(query.toLowerCase()));
  const filteredSelected = selected && visible.some((task) => task.id === selected.id) ? selected : visible[0] ?? null;
  useEffect(() => {
    if (filteredSelected?.id !== selected?.id) setSelected(filteredSelected);
  }, [filteredSelected?.id, selected?.id]);
  return <main className="container">
    <div className="app-page-heading"><div><div className="eyebrow">HISTORY</div><h1>历史记录</h1><p>复习过去完成的题目和答案。</p></div><div className="history-summary"><strong>{tasks.length}</strong><span>已完成任务</span></div></div>
    {error && <div className="notice" role="alert">{error}</div>}
    <div className="history-toolbar"><div className="history-search"><Search size={16} aria-hidden="true" /><input aria-label="搜索历史记录" placeholder="搜索题型或时间" value={query} onChange={(event) => setQuery(event.target.value)} /></div><span className="muted">{visible.length} 条记录</span></div>
    {error && <div className="notice">{error}</div>}
    {tasks.length === 0 && total === 0 ? <div className="card empty-inline"><p>暂无历史记录。</p></div> : visible.length === 0 ? <div className="card empty-inline"><p>没有匹配的历史记录。</p></div> : <TaskWorkspace tasks={visible} selected={filteredSelected} result={result} filter={statusFilter} filters={[["all", "全部"], ["completed", "已完成"], ["failed", "失败"]]} onFilter={setStatusFilter} onSelect={setSelected} page={page} pageSize={20} total={total} onPage={setPage} />}
  </main>;
}
