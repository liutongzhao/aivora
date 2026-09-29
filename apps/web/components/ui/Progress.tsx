export function Progress({ value, label }: { value: number; label?: string }) {
  const safeValue = Math.max(0, Math.min(100, value));
  return (
    <div className="ui-progress" aria-label={label ?? "处理进度"} aria-valuemin={0} aria-valuemax={100} aria-valuenow={safeValue} role="progressbar">
      <span style={{ width: `${safeValue}%` }} />
    </div>
  );
}
