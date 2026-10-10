import { CalendarClock, KeyRound, Sparkles } from "lucide-react";
import type { AccountSnapshot } from "../../types/account";
import { LicenseRedeemForm } from "../licenses/LicenseRedeemForm";

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "—";
}

export function EntitlementPanel({ snapshot, onRedeemed }: { snapshot: AccountSnapshot; onRedeemed: () => void }) {
  const active = snapshot.usage.entitlementActive && snapshot.entitlement?.status === "active";
  const expired = snapshot.entitlement?.status === "expired" || snapshot.usage.entitlementStatus === "active";
  const exhausted = !active && snapshot.usage.trialRemaining <= 0;
  const title = active ? "期限授权有效" : expired ? "授权已过期" : exhausted ? "体验次数已用完" : "免费体验中";
  const description = active
    ? `当前授权有效期至 ${formatDate(snapshot.entitlement?.expiresAt ?? snapshot.usage.entitlementExpiresAt)}。`
    : expired
      ? `当前账号没有可用的期限授权。${exhausted ? "体验次数已用完。" : ""}兑换授权码后继续使用。`
      : exhausted
        ? "免费体验额度已经用完，兑换授权码后继续使用 Aivora。"
        : `已验证账号可免费体验 ${snapshot.usage.trialTotal} 次，当前剩余 ${snapshot.usage.trialRemaining} 次。`;

  return (
    <section className={`entitlement-panel panel ${active ? "is-active" : exhausted || expired ? "is-blocked" : "is-trial"}`}>
      <div className="panel-heading">
        <div>
          <span className="eyebrow">ACCESS &amp; ENTITLEMENT</span>
          <h2>{title}</h2>
          <p className="muted">{description}</p>
        </div>
        <span className="entitlement-icon" aria-hidden="true">{active ? <CalendarClock size={20} /> : <KeyRound size={20} />}</span>
      </div>
      <div className="entitlement-summary">
        <div><span>免费体验</span><strong>剩余 {snapshot.usage.trialRemaining} 次 <small>/ {snapshot.usage.trialTotal} 次</small></strong></div>
        <div><span>当前授权</span><strong>{active ? formatDate(snapshot.entitlement?.expiresAt ?? null) : "未激活"}</strong></div>
      </div>
      {exhausted && <p className="entitlement-warning" role="status">体验次数已用完</p>}
      {expired && <p className="entitlement-expired-copy">兑换授权码后继续使用</p>}
      {!active && (
        <div className="entitlement-redeem">
          <div className="form-panel-heading"><div><strong>激活授权码</strong><span>激活后按管理员配置的期限使用，默认期限为 6 个月。</span></div><Sparkles size={18} aria-hidden="true" /></div>
          <LicenseRedeemForm onRedeemed={onRedeemed} />
        </div>
      )}
    </section>
  );
}
