import { useState } from "react";
import { Button } from "../ui";

export function AnswerViewer({ content, rawContent, parsed, warnings = [] }: { content?: string | null; rawContent?: string | null; parsed?: Record<string, unknown>; warnings?: string[] }) {
  const [copied, setCopied] = useState(false);
  const answer = content || rawContent || "暂无答案";
  async function copy() { await navigator.clipboard?.writeText(answer); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <div className="answer-viewer"><div className="answer-viewer-head"><div><div className="eyebrow">ANSWER</div><h2>处理结果</h2></div><Button variant="secondary" onClick={copy}>{copied ? "已复制" : "复制答案"}</Button></div>{warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}<div className="answer-content" data-testid="answer-content">{answer}</div>{parsed && Object.keys(parsed).length > 0 && <details className="answer-raw"><summary>查看结构化数据</summary><pre>{JSON.stringify(parsed, null, 2)}</pre></details>}</div>;
}
