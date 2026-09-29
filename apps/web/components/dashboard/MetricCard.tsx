export function MetricCard({ label, value, detail }: { label: string; value: string | number; detail: string }) {
  return <div className="metric-card motion-slide-up"><span>{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
