# Aivora Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the上线必需的桌面端权限门禁、授权状态同步、异常反馈和发布验证。

**Architecture:** Electron 主进程在快捷键和处理助手入口先调用后端 `/api/account/usage`，阻止无权限任务进入截图采集；React 渲染层保留同一接口的二次检查，处理完成、失败、取消和认证事件统一刷新状态。后端继续作为最终权限判定来源。

**Tech Stack:** Electron, React, TypeScript, Vitest, FastAPI, pytest.

**Spec:** `docs/superpowers/specs/2026-10-10-release-readiness-design.md`

## Global Constraints

- 不引入新的 UI 框架或运行时依赖。
- 不把“无法确认权限”当作允许使用。
- 不在桌面端自行扣减或缓存额度。
- 所有用户可见阻断必须显示明确中文提示。
- 先写失败测试，再实现。

## Review Focus

- 无权限快捷键不会触发截图采集。
- API 网络错误不会放行任务。
- 授权有效时不受免费次数限制。
- 任务结束、失败、取消后额度状态刷新。
- 会话失效后清理状态并阻止继续提交。

### Task 1: 主进程权限预检

**Files:**
- Create: `apps/desktop/electron/usageEntitlement.ts`
- Create: `apps/desktop/electron/usageEntitlement.test.ts`
- Modify: `apps/desktop/electron/main.ts`
- Modify: `apps/desktop/electron/LightweightProcessingHelper.ts`
- Modify: `apps/desktop/electron/shortcuts.ts`

- [ ] Write failing tests for entitlement/trial allowance, expired/exhausted blocking, and network failure blocking.
- [ ] Run `npm test -- usageEntitlement.test.ts` and confirm failure.
- [ ] Implement authenticated usage fetch with actionable reason codes and notification payload.
- [ ] Inject a `checkUsageAccess` dependency into the processing helper and shortcut path before screenshot capture.
- [ ] Run focused Electron tests and typecheck.

### Task 2: Renderer state synchronization

**Files:**
- Modify: `apps/desktop/src/services/usageEntitlement.ts`
- Modify: `apps/desktop/src/hooks/useAIProcessing.ts`
- Modify: `apps/desktop/src/App.tsx`
- Modify: `apps/desktop/src/components/ModelPromptCenter/ModelPromptCenter.tsx`
- Test: `apps/desktop/src/services/usageEntitlement.test.ts`
- Test: `apps/desktop/src/hooks/useAIProcessing.test.ts`

- [ ] Add normalized usage refresh/error behavior and test it.
- [ ] Refresh usage after completed, failed, and cancelled task events.
- [ ] Refresh and clear local processing state when auth status becomes unauthenticated.
- [ ] Surface session-expired and entitlement messages through existing toast/status UI.
- [ ] Run focused tests.

### Task 3: End-to-end release verification

**Files:**
- Modify: `apps/desktop/package.json` only if verification script is needed.
- Test: existing desktop, web, and backend suites.

- [ ] Run desktop tests and typecheck.
- [ ] Run Web tests, TypeScript, and production build.
- [ ] Run backend tests.
- [ ] Build desktop renderer and Electron bundles.
- [ ] Run `screen` service restart and health checks.
- [ ] Commit the completed release-readiness changes.
