import type { AIProcessResult } from '../../services/aiService'
import './ChoiceResult.css'

function readable(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (Array.isArray(value)) return value.map(readable).filter(Boolean).join('、')
  return ''
}

export function ChoiceResult({ result }: { result: AIProcessResult }) {
  const raw = result.rawContent || result.content || ''
  let parsed = result.parsed
  if (!parsed && raw) {
    try {
      const value = JSON.parse(raw)
      if (value && typeof value === 'object' && !Array.isArray(value)) parsed = value
    } catch {
      // The original response remains available below.
    }
  }

  const answer = result.parseWarning ? '' : readable(parsed?.answers) || readable(parsed?.answer)
  const explanation = readable(parsed?.explanation)
  const warnings = [
    ...(!answer ? ['未能确认答案，请核对题目与原始输出。'] : []),
    ...(typeof parsed?.warnings === 'string' ? [parsed.warnings] : parsed?.warnings || []),
    ...(result.parseWarning ? [result.parseWarning] : [])
  ].filter(Boolean)
  const options = parsed?.options
  const optionEntries = Array.isArray(options)
    ? options.map((value, index) => [String.fromCharCode(65 + index), readable(value)] as const)
    : Object.entries(options || {}).map(([label, value]) => [label, readable(value)] as const)

  return (
    <section className="client-choice-result text-[color:var(--text-color)] space-y-4">
      <div>
        <h2 className="text-xs font-medium opacity-70 mb-2">答案</h2>
        <p className="text-xl font-semibold leading-snug break-words">{answer || '待核对'}</p>
      </div>
      {explanation && (
        <div>
          <h2 className="text-xs font-medium opacity-70 mb-2">解题原因</h2>
          <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
            {explanation}
          </p>
        </div>
      )}
      {warnings.length > 0 && (
        <div role="status" className="text-xs leading-relaxed text-amber-300">
          {warnings.join('；')}
        </div>
      )}
      {(parsed?.question || optionEntries.length > 0) && (
        <details className="text-sm">
          <summary role="button" className="cursor-pointer text-xs opacity-75 py-2">查看题目与选项</summary>
          <div className="pt-2 space-y-2 leading-relaxed break-words">
            {parsed.question && <p>{parsed.question}</p>}
            {optionEntries.map(([label, value]) => <p key={label}>{label}. {value}</p>)}
          </div>
        </details>
      )}
      {raw && (
        <details className="text-sm">
          <summary role="button" className="cursor-pointer text-xs opacity-75 py-2">原始输出</summary>
          <pre className="mt-2 whitespace-pre-wrap break-all text-xs leading-relaxed max-h-64 overflow-auto">
            {raw}
          </pre>
        </details>
      )}
    </section>
  )
}
