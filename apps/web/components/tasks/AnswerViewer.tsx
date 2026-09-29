import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Check, Copy } from "lucide-react";
import { Button } from "../ui";

function parseStructuredContent(content?: string | null, rawContent?: string | null, parsed?: Record<string, unknown>) {
  if (parsed && Object.keys(parsed).length > 0) return parsed;
  for (const candidate of [content, rawContent]) {
    if (!candidate?.trim()) continue;
    try {
      const value = JSON.parse(candidate);
      if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    } catch {
      // The model may return ordinary Markdown instead of JSON.
    }
  }
  return {};
}

export function AnswerViewer({ content, rawContent, parsed, warnings = [] }: { content?: string | null; rawContent?: string | null; parsed?: Record<string, unknown>; warnings?: string[] }) {
  const [copied, setCopied] = useState(false);
  const structured = parseStructuredContent(content, rawContent, parsed);
  const answer = typeof structured.answer === "string" ? structured.answer : "";
  const answers = Array.isArray(structured.answers) ? structured.answers.join(", ") : "";
  const explanation = String(structured.explanation ?? structured.reasoning ?? structured.thoughts ?? "");
  const code = typeof structured.code === "string" ? structured.code : "";
  const question = typeof structured.question === "string" ? structured.question : "";
  const options = structured.options && typeof structured.options === "object" && !Array.isArray(structured.options) ? Object.entries(structured.options as Record<string, unknown>) : [];
  const modelWarnings = Array.isArray(structured.warnings) ? structured.warnings.map(String) : [];
  const isContentJson = Boolean(content?.trim() && (() => { try { return typeof JSON.parse(content) === "object"; } catch { return false; } })());
  const modelText = !isContentJson && content?.trim() ? content : "";
  const copyValue = code || answer || answers || explanation || modelText || question || "暂无答案";
  const renderText = (value: string) => <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>;
  async function copy() { await navigator.clipboard?.writeText(copyValue); setCopied(true); window.setTimeout(() => setCopied(false), 1600); }
  return <div className="answer-viewer">
    <div className="answer-viewer-head"><div><div className="eyebrow">ANSWER</div><h2>处理结果</h2></div><Button variant="secondary" onClick={copy}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "已复制" : "复制结果"}</Button></div>
    {[...warnings, ...modelWarnings].map((warning) => <div className="notice" key={warning}>{warning}</div>)}
    {question && <div className="answer-question markdown-body"><div className="answer-section-label">题目</div>{renderText(question)}</div>}
    {options.length > 0 && <div className="answer-options"><div className="answer-section-label">选项</div>{options.map(([key, value]) => <div className={`answer-option ${answer.split(",").map((item) => item.trim()).includes(key) ? "is-correct" : ""}`} key={key}><strong>{key}</strong><span>{String(value)}</span></div>)}</div>}
    {(answer || answers) && <div className="answer-choice" data-testid="answer-choice"><span>答案</span><strong>{answer || answers}</strong></div>}
    {code && <><div className="answer-section-label">代码</div><pre className="answer-code" data-testid="answer-code"><code>{code}</code></pre></>}
    {explanation && <div className="answer-explanation markdown-body" data-testid="answer-explanation">{renderText(explanation)}</div>}
    {!question && !answer && !answers && !code && modelText && <div className="answer-source"><div className="answer-section-label">模型回答</div><div className="answer-content markdown-body" data-testid="answer-model-content">{renderText(modelText)}</div></div>}
    {!question && !answer && !answers && !code && !modelText && <div className="answer-content" data-testid="answer-content">暂无答案</div>}
  </div>;
}
