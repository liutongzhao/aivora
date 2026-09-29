export function BrandMark({ compact = false }: { compact?: boolean }) {
  return <div className={`brand-lockup ${compact ? "brand-lockup-compact" : ""}`}><span className="brand-symbol">A</span><span className="brand-name">Aivora</span></div>;
}
