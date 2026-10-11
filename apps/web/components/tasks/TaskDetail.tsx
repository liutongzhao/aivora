"use client";

import { useState } from "react";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { AnswerViewer } from "./AnswerViewer";
import { Progress } from "../ui";
import { modes } from "./TaskList";
import { getApiBase } from "../../lib/api-client";

type TaskResult = { content?: string; rawContent?: string; parsed?: Record<string, unknown>; parseWarning?: string | null; images?: { id: string; url: string; contentType?: string }[] };

export function TaskDetail({ task, result }: { task: { id?: string; mode: string; status: string; stage: string; progress: number; created_at: string; error_message?: string | null }; result?: TaskResult | null }) {
  const images = result?.images ?? [];
  const imageUrl = (url: string) => new URL(url, getApiBase()).toString();
  const [imageError, setImageError] = useState(false);

  return <section className="task-detail motion-scale-in">
    <div className="task-detail-head"><div><h2>{modes[task.mode] ?? task.mode}</h2><p className="muted">{new Date(task.created_at).toLocaleString("zh-CN")} · {task.id ?? ""}</p></div><TaskStatusBadge status={task.status} /></div>
    {["queued", "processing", "streaming"].includes(task.status) && <div className="task-detail-progress"><div><span>处理进度</span><strong>{task.progress}%</strong></div><Progress value={task.progress} label="任务处理进度" /><small>{task.stage}</small></div>}
    {task.error_message && <div className="notice">{task.error_message}</div>}
    <div className="task-detail-columns">
      <div className="task-question"><div className="answer-section-label">题目截图</div>{images.length ? <div className="task-images">{images.map((image, index) => <a href={imageUrl(image.url)} target="_blank" rel="noreferrer" key={image.id}><img src={imageUrl(image.url)} alt={`题目截图 ${index + 1}`} loading={index === 0 ? "eager" : "lazy"} decoding="async" onError={() => setImageError(true)} /><span>截图 {index + 1} · 点击查看原图</span></a>)}{imageError && <div className="notice" role="alert">题目截图读取失败，请刷新后重试。</div>}</div> : <div className="task-image-empty">暂无截图</div>}</div>
      <div className="task-answer"><AnswerViewer content={result?.content} rawContent={result?.rawContent} parsed={result?.parsed} warnings={result?.parseWarning ? [result.parseWarning] : []} /></div>
    </div>
  </section>;
}
