import { ChevronLeft, ChevronRight } from "lucide-react";

export function Pagination({ page, pageSize, total, onChange }: { page: number; pageSize: number; total: number; onChange: (page: number) => void }) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;
  return <div className="pagination" aria-label="分页">
    <button className="icon-button" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="上一页" title="上一页"><ChevronLeft size={16} /></button>
    <span>第 {page} / {totalPages} 页</span>
    <button className="icon-button" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label="下一页" title="下一页"><ChevronRight size={16} /></button>
  </div>;
}
