"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { apiFetch, getApiBase } from "../../../../lib/api-client";
import { getWebSessionId } from "../../../../lib/session";
import { TaskWorkspace } from "../../../../components/tasks/TaskWorkspace";
import type { TaskSummary } from "../../../../components/tasks/TaskList";

export default function TasksPage() {
  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [selected, setSelected] = useState<TaskSummary | null>(null);
  const [result, setResult] = useState<{ content?: string; rawContent?: string; parsed?: Record<string, unknown>; parseWarning?: string | null; images?: { id: string; url: string; contentType?: string }[] } | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const taskId = useSearchParams().get("id");

  useEffect(() => {
    apiFetch<{ tasks: typeof tasks; total: number }>(`/api/ai/tasks?page=${page}&page_size=20`)
      .then((result) => {
        setTasks(result.tasks);
        setTotal(result.total);
        setSelected(taskId ? result.tasks.find((task) => task.id === taskId) ?? result.tasks[0] ?? null : result.tasks[0] ?? null);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "任务加载失败"));
  }, [taskId, page]);
  useEffect(() => {
    if (!selected?.id) return;
    const selectedId = selected.id;
    let disposed = false;
    let source: EventSource | null = null;
    let content = "";
    const fields: Record<string, unknown> = {};

    const updateTask = (patch: Partial<TaskSummary>) => {
      setTasks((current) => current.map((item) => item.id === selectedId ? { ...item, ...patch } : item));
      setSelected((current) => current?.id === selectedId ? { ...current, ...patch } : current);
    };
    const applyEvent = (raw: any) => {
      const event = raw?.data ? { ...raw, ...raw.data } : raw;
      if (event.type === "content") {
        content = event.append === false ? String(event.content ?? "") : content + String(event.content ?? "");
        setResult((current) => ({ ...(current ?? {}), content, rawContent: content }));
      } else if (event.type === "code_delta") {
        fields.code = `${fields.code ?? ""}${event.delta ?? ""}`;
        setResult((current) => ({ ...(current ?? {}), content: String(fields.code), parsed: { ...(current?.parsed ?? {}), code: fields.code } }));
      } else if (event.type === "explanation_delta") {
        fields.explanation = `${fields.explanation ?? ""}${event.delta ?? ""}`;
        setResult((current) => ({ ...(current ?? {}), parsed: { ...(current?.parsed ?? {}), explanation: fields.explanation } }));
      } else if (event.type === "answer_set") {
        fields[event.field] = event.value;
        setResult((current) => ({ ...(current ?? {}), parsed: { ...(current?.parsed ?? {}), [event.field]: event.value } }));
      } else if (event.type === "progress") {
        updateTask({ status: event.status ?? (event.stage === "ai_streaming" ? "streaming" : selected.status), stage: event.stage ?? selected.stage, progress: Number(event.progress ?? selected.progress) });
      } else if (event.type === "completed") {
        const finalResult = event.result ?? (event.questionType || event.parsed ? event : null);
        if (finalResult) setResult(finalResult);
        updateTask({ status: "completed", stage: "completed", progress: 100 });
        source?.close();
      } else if (event.type === "error") {
        updateTask({ status: "failed", stage: "error" });
        source?.close();
      }
    };

    Promise.all([
      apiFetch<{ result: NonNullable<typeof result> }>(`/api/ai/tasks/${selectedId}`),
      apiFetch<{ token: string }>(`/api/ai/tasks/${selectedId}/stream-token`),
    ]).then(([detail, token]) => {
      if (disposed) return;
      setResult(detail.result);
      const session = getWebSessionId();
      const query = new URLSearchParams({ token: token.token });
      if (session) query.set("session_id", session);
      source = new EventSource(`${getApiBase()}/api/ai/stream/${selectedId}?${query.toString()}`);
      source.onmessage = (message) => {
        try { applyEvent(JSON.parse(message.data)); } catch { /* ignore malformed heartbeat */ }
      };
      source.onerror = () => {
        if (!disposed) source?.close();
      };
    }).catch(() => { if (!disposed) setResult(null); });

    return () => {
      disposed = true;
      source?.close();
    };
  }, [selected?.id]);
  return (
    <main className="container">
      <section className="app-page-heading"><div><div className="eyebrow">LIVE TASKS</div><h1>AI 任务</h1><p>查看正在处理的任务，并实时跟踪答案生成。</p></div><div className="page-heading-stat"><strong>{tasks.filter((task) => ["queued", "processing", "streaming"].includes(task.status)).length}</strong><span>进行中</span></div></section>
      {error && <div className="notice">{error}</div>}
      {!error && tasks.length === 0 && total === 0 ? <div className="card empty-inline"><p>还没有任务，桌面客户端提交截图后会出现在这里。</p></div> : <TaskWorkspace tasks={tasks} selected={selected} result={result} filter={filter} onFilter={setFilter} onSelect={setSelected} filters={[["all", "全部"], ["queued", "排队中"], ["processing", "处理中"], ["streaming", "生成中"], ["programming", "编程题"], ["single_choice", "选择题"]]} page={page} pageSize={20} total={total} onPage={(nextPage) => { setPage(nextPage); setSelected(null); }} />}
    </main>
  );
}
