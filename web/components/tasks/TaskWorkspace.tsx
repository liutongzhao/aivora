"use client";

import { ArrowUpRight, Inbox } from "lucide-react";
import { TaskDetail } from "./TaskDetail";
import { TaskList, type TaskSummary } from "./TaskList";
import { Pagination } from "./Pagination";

type TaskResult = {
  content?: string;
  rawContent?: string;
  parsed?: Record<string, unknown>;
  parseWarning?: string | null;
  images?: { id: string; url: string; contentType?: string }[];
};

export function TaskWorkspace({
  tasks,
  selected,
  result,
  filter,
  filters,
  onFilter,
  onSelect,
  page,
  pageSize,
  total,
  onPage,
}: {
  tasks: TaskSummary[];
  selected: TaskSummary | null;
  result: TaskResult | null;
  filter: string;
  filters: [string, string][];
  onFilter: (value: string) => void;
  onSelect: (task: TaskSummary) => void;
  page?: number;
  pageSize?: number;
  total?: number;
  onPage?: (page: number) => void;
}) {
  const visibleTasks = filter === "all" ? tasks : tasks.filter((task) => task.status === filter || task.mode === filter);
  return <div className="task-workspace">
    <section className="task-inbox">
      <div className="task-toolbar"><div className="filter-group">{filters.map(([value, label]) => <button className={`filter-button ${filter === value ? "is-active" : ""}`} key={value} onClick={() => onFilter(value)}>{label}</button>)}</div><span className="muted task-count">{visibleTasks.length} 项</span></div>
      {visibleTasks.length ? <TaskList tasks={visibleTasks} onSelect={onSelect} selectedId={selected?.id} /> : <div className="task-empty"><Inbox size={20} /><strong>没有符合条件的任务</strong><span>换一个筛选条件试试。</span></div>}
      {page && pageSize && typeof total === "number" && onPage && <Pagination page={page} pageSize={pageSize} total={total} onChange={onPage} />}
    </section>
    <section className="task-inspector">
      {selected ? <TaskDetail task={selected} result={result} /> : <div className="task-inspector-empty"><ArrowUpRight size={22} /><strong>选择一项任务</strong><span>答案、解析和题目截图会显示在这里。</span></div>}
    </section>
  </div>;
}
