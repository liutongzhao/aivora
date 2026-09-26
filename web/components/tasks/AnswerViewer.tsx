import { useState } from "react";
import { Button } from "../ui";

export function AnswerViewer({ content, rawContent, parsed, warnings = [] }: { content?: string | null; rawContent?: string | null; parsed?: Record<string, unknown>; warnings?: string[] }) {
  const [copied, setCopied] = useState(false);
  const answer = typeof parsed?.answer === "string" ? parsed.answer : "";
  const answers = Array.isArray(parsed?.answers) ? parsed.answers.join(", ") : "";
  const explanation = String(parsed?.explanation ?? parsed?.reasoning ?? parsed?.thoughts ?? "");
  const code = typeof parsed?.code === "string" ? parsed.code : "";
  const primary = code || answer || answers || content || rawContent || "暂无答案";
  const copyValue = code || answer || answers || explanation || content || rawContent || "";
  async function copy() { await navigator.clipboard?.writeText(copyValue); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  const renderText = (value: string) => value.split(/\n{2,}/).map((part, index) => <p key={index}>{part}</p>);
  return <div className="answer-viewer">
    <div className="answer-viewer-head"><div><div className="eyebrow">ANSWER</div><h2>处理结果</h2></div><Button variant="secondary" onClick={copy}>{copied ? "已复制" : "复制结果"}</Button></div>
    {warnings.map((warning) => <div className="notice" key={warning}>{warning}</div>)}
    {(answer || answers) && <div className="answer-choice" data-testid="answer-choice"><span>答案</span><strong>{answer || answers}</strong></div>}
    {code ? <pre className="answer-code" data-testid="answer-code"><code>{code}</code></pre> : !answer && !answers && <div className="answer-content" data-testid="answer-content">{primary}</div>}
    {explanation && <div className="answer-explanation" data-testid="answer-explanation">{renderText(explanation)}</div>}
    {parsed && Object.keys(parsed).length > 0 && <details className="answer-raw"><summary>查看原始结果</summary><pre>{JSON.stringify(parsed, null, 2)}</pre></details>}
  </div>;
}
