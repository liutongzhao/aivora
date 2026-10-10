"use client";

import { X } from "lucide-react";
import type { AdminUserDetail } from "../../types/admin";

function date(value: string | null) {
  return value ? new Date(value).toLocaleDateString("zh-CN") : "暂无";
}

export function UserDetailDrawer({ detail, loading, onClose, onGrantTrial, onExtendEntitlement, onPauseEntitlement, onRevokeEntitlement }: { detail: AdminUserDetail | null; loading: boolean; onClose: () => void; onGrantTrial?: () => void; onExtendEntitlement?: () => void; onPauseEntitlement?: () => void; onRevokeEntitlement?: () => void }) {
  return (
    <aside className="admin-user-drawer" aria-label="用户详情">
      <div className="admin-user-drawer-head"><div><span className="eyebrow">USER DETAIL</span><h2>{detail?.user.username || detail?.user.email || "用户详情"}</h2></div><button className="icon-button" type="button" aria-label="关闭用户详情" title="关闭用户详情" onClick={onClose}><X size={18} /></button></div>
      {loading && <div className="ui-loading" role="status">正在加载用户详情</div>}
      {!loading && detail && <div className="admin-user-drawer-body">
        <p className="admin-user-email">{detail.user.email}</p>
        <div className="admin-detail-status"><span className={`ui-badge ${detail.user.status === "active" ? "ui-badge-success" : "ui-badge-danger"}`}>{detail.user.status === "active" ? "正常" : "已停用"}</span><span className="ui-badge ui-badge-info">{detail.user.emailVerified ? "邮箱已验证" : "邮箱未验证"}</span></div>
        <div className="admin-user-facts"><div><span>体验额度</span><strong>{detail.usage.trialRemaining} / {detail.usage.trialTotal} 次</strong></div><div><span>已使用</span><strong>{detail.usage.trialUsed} 次</strong></div><div><span>任务总数</span><strong>{detail.usage.taskCount}</strong></div><div><span>注册时间</span><strong>{date(detail.user.createdAt)}</strong></div><div><span>最近登录</span><strong>{date(detail.user.lastLoginAt)}</strong></div><div><span>授权状态</span><strong>{detail.entitlement?.status === "active" ? `有效至 ${date(detail.entitlement.expiresAt)}` : "未激活或已过期"}</strong></div></div>
        <div className="admin-drawer-actions"><button className="button secondary" type="button" onClick={onGrantTrial}>增加体验次数</button>{detail.entitlement?.status === "active" && <><button className="button ghost" type="button" onClick={onExtendEntitlement}>延长授权</button><button className="button ghost" type="button" onClick={onPauseEntitlement}>暂停授权</button><button className="button ghost danger-text" type="button" onClick={onRevokeEntitlement}>撤销授权</button></>}</div>
      </div>}
    </aside>
  );
}
