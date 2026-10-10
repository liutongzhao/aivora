"use client";

import { Search, X } from "lucide-react";

export function UserFilters({ search, status, onSearch, onStatus, onClear }: { search: string; status: string; onSearch: (value: string) => void; onStatus: (value: string) => void; onClear: () => void }) {
  return (
    <div className="admin-user-filters" aria-label="用户筛选">
      <label className="admin-search"><Search size={16} aria-hidden="true" /><span className="sr-only">搜索用户</span><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder="搜索邮箱或用户名" /></label>
      <label className="admin-filter-select"><span>状态</span><select value={status} onChange={(event) => onStatus(event.target.value)}><option value="all">全部</option><option value="active">正常</option><option value="suspended">已停用</option></select></label>
      {(search || status !== "all") && <button className="button ghost admin-clear-filter" type="button" onClick={onClear}><X size={14} />清除筛选</button>}
    </div>
  );
}
