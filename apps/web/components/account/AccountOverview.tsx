import { CheckCircle2, Mail, ShieldCheck, UserRound } from "lucide-react";
import type { AccountSnapshot } from "../../types/account";

export function AccountOverview({ snapshot }: { snapshot: AccountSnapshot }) {
  const displayName = snapshot.user.username || snapshot.user.email.split("@")[0];
  return (
    <section className="account-overview panel">
      <div className="account-overview-identity">
        <span className="account-profile-avatar" aria-hidden="true">{displayName.slice(0, 1).toUpperCase()}</span>
        <div>
          <span className="eyebrow">ACCOUNT</span>
          <h2>{displayName}</h2>
          <p>{snapshot.user.email}</p>
        </div>
      </div>
      <div className="account-overview-facts">
        <div><Mail size={16} aria-hidden="true" /><span>邮箱状态</span><strong>{snapshot.user.emailVerifiedAt ? "已验证" : "待验证"}</strong></div>
        <div><ShieldCheck size={16} aria-hidden="true" /><span>账号角色</span><strong>{snapshot.user.role === "admin" ? "管理员" : "普通用户"}</strong></div>
        <div><UserRound size={16} aria-hidden="true" /><span>账号状态</span><strong>{snapshot.user.isActive ? "正常使用" : "已停用"}</strong></div>
        <div><CheckCircle2 size={16} aria-hidden="true" /><span>模型状态</span><strong>{snapshot.modelStatus.ready ? "模型已就绪" : "待配置模型"}</strong></div>
      </div>
    </section>
  );
}
