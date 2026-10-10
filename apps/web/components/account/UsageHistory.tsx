import { Clock3, FileCheck2 } from "lucide-react";
import type { UsageRecord } from "../../types/account";

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-CN");
}

export function UsageHistory({ records }: { records: UsageRecord[] }) {
  return (
    <section className="panel account-history">
      <div className="panel-heading"><div><span className="eyebrow">USAGE HISTORY</span><h2>使用记录</h2></div><Clock3 size={18} className="muted" aria-hidden="true" /></div>
      {records.length === 0 ? <p className="muted">暂无使用记录。</p> : <div className="account-history-list">
        {records.map((record) => <div className="account-history-row" key={record.id}>
          <span className="account-history-icon" aria-hidden="true"><FileCheck2 size={16} /></span>
          <div><strong>{record.usageType === "trial" ? "免费体验" : record.usageType === "entitlement" ? "授权额度" : record.usageType}</strong><small>{formatDate(record.createdAt)}{record.taskId ? ` · 任务 ${record.taskId.slice(0, 8)}` : ""}</small></div>
          <span className="account-history-amount">-{record.amount} 次</span>
        </div>)}
      </div>}
    </section>
  );
}
