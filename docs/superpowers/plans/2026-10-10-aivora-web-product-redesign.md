# Aivora Web Product Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将 Aivora Web 端重构为可持续使用的用户工作台和管理员运营后台，第一阶段交付个人中心、权益可见性、统一工作台和用户权益管理。

**Architecture:** 保留现有 Next.js App Router 和 CSS token 体系，在页面组件之上增加账户快照和管理员数据服务层，统一加载、空状态、错误反馈和抽屉交互。页面先改信息架构和核心状态，再补充接口，避免把请求逻辑继续堆在页面组件中。

**Tech Stack:** Next.js 15、React 19、TypeScript、Lucide、现有 CSS、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-10-10-aivora-web-product-redesign-design.md`

## Global Constraints

- 使用 `design-system/aivora/MASTER.md` 作为全局视觉来源。
- 页面实现使用 `frontend-design-skill`，交互和可访问性使用 `ui-ux-pro-max` 校验。
- 不使用 emoji 作为图标；图标按钮必须有可访问名称。
- 支持 375px、768px、1024px、1440px 宽度。
- 不改变现有注册、邮箱验证、授权码和额度服务端规则。
- 权限判断以服务端为准，前端只负责状态展示和提前拦截。

## Review Focus

- 账户快照部分请求失败时，页面仍应显示可解释的局部错误，而不是整页空白。
- 授权刚激活后，工作台和个人中心必须刷新到同一份权益数据。
- 管理员打开用户详情后再筛选或分页，不能展示上一个用户的详情。
- 移动端打开抽屉、菜单和表格时不能产生横向滚动。
- 普通用户不能通过前端路由直接访问管理员页面。

### Task 1: Account Data Service

**Files:**
- Create: `apps/web/lib/account-service.ts`
- Create: `apps/web/types/account.ts`
- Modify: `apps/web/lib/api-client.ts` only if shared error normalization is required
- Test: `apps/web/lib/account-service.test.ts`

**Interfaces:**
- Produces `UserProfile`, `UsageSummary`, `Entitlement`, `ModelStatus`, `DesktopStatus`, `AccountSnapshot`.
- Produces `getAccountSnapshot(): Promise<AccountSnapshot>`.
- Produces `getAccountEntitlements(): Promise<Entitlement[]>`.
- Produces `getAccountUsageHistory(): Promise<UsageRecord[]>`.

- [ ] Write failing tests for successful snapshot loading, partial request failure, and consistent entitlement normalization.
- [ ] Run the focused Vitest file and verify it fails because the service is missing.
- [ ] Implement the typed service using existing `apiFetch`, keeping endpoint composition outside page components.
- [ ] Run the focused tests and verify they pass.
- [ ] Run the existing Web test suite.
- [ ] Commit as `feat: add account snapshot service`.

### Task 2: User AppShell And Navigation

**Files:**
- Modify: `apps/web/components/layout/AppShell.tsx`
- Modify: `apps/web/components/layout/Sidebar.tsx`
- Modify: `apps/web/components/layout/Topbar.tsx`
- Modify: `apps/web/app/globals.css`
- Create: `apps/web/components/layout/AccountMenu.tsx`
- Test: `apps/web/components/layout/app-shell.test.tsx`

**Interfaces:**
- `AppShell` keeps the existing `navigation` prop and adds optional account snapshot display.
- `AccountMenu` exposes links to `/dashboard/profile`, `/dashboard/settings`, and logout.

- [ ] Add tests for active navigation, account menu links, and mobile menu semantics.
- [ ] Verify the new tests fail before implementation.
- [ ] Implement the desktop sidebar, mobile navigation, topbar account state, focus styles, and responsive menu.
- [ ] Verify tests pass and inspect at 375px and 1440px.
- [ ] Commit as `feat: improve user workspace shell`.

### Task 3: User Profile And Entitlements

**Files:**
- Create: `apps/web/app/(user)/dashboard/profile/page.tsx`
- Create: `apps/web/components/account/AccountOverview.tsx`
- Create: `apps/web/components/account/EntitlementPanel.tsx`
- Create: `apps/web/components/account/UsageHistory.tsx`
- Modify: `apps/web/components/licenses/LicenseRedeemForm.tsx`
- Modify: `apps/web/app/(user)/dashboard/page.tsx`
- Test: `apps/web/app/(user)/dashboard/profile/page.test.tsx`

**Interfaces:**
- The profile page consumes `getAccountSnapshot`, `getAccountEntitlements`, and `getAccountUsageHistory`.
- `LicenseRedeemForm` accepts an `onRedeemed` callback that receives the refreshed account snapshot or triggers a service refresh.

- [ ] Test valid entitlement, remaining trial, exhausted trial, expired entitlement, and redeem failure states.
- [ ] Verify the profile tests fail before implementation.
- [ ] Implement the profile page with account overview, entitlement panel, redeem form, history, and security section placeholders backed by existing capabilities.
- [ ] Move the dashboard license action into a compact CTA while keeping the main entitlement state visible.
- [ ] Verify focused and full Web tests pass.
- [ ] Commit as `feat: add account center`.

### Task 4: User Dashboard And Task State UX

**Files:**
- Modify: `apps/web/app/(user)/dashboard/page.tsx`
- Modify: `apps/web/components/dashboard/MetricCard.tsx`
- Modify: `apps/web/components/dashboard/DesktopStatusCard.tsx`
- Modify: `apps/web/components/tasks/TaskStatusBadge.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/components/dashboard/dashboard-state.test.tsx`

**Interfaces:**
- Dashboard consumes one `AccountSnapshot` source and exposes actionable states for entitlement, model configuration, desktop connection, and task failures.

- [ ] Test loading, no entitlement, exhausted trial, no model, and active desktop states.
- [ ] Verify the tests fail before implementation.
- [ ] Implement the first-screen status hierarchy, actionable empty states, task summary, and clear error copy.
- [ ] Verify responsive layouts at the four required widths.
- [ ] Commit as `feat: improve user dashboard states`.

### Task 5: Admin Account Data Service

**Files:**
- Create: `apps/web/lib/admin-service.ts`
- Create: `apps/web/types/admin.ts`
- Test: `apps/web/lib/admin-service.test.ts`

**Interfaces:**
- Produces `AdminOverview`, `AdminUserRow`, `AdminUserDetail`, `AdminUserFilters`.
- Produces `getAdminOverview(): Promise<AdminOverview>`.
- Produces `listAdminUsers(filters: AdminUserFilters): Promise<{ users: AdminUserRow[]; total: number }>`.
- Produces `getAdminUserDetail(userId: string): Promise<AdminUserDetail>`.

- [ ] Test overview loading, user filters, pagination query serialization, and user-detail loading.
- [ ] Verify tests fail before implementation.
- [ ] Implement the service using existing admin endpoints and clearly mark endpoint additions required by the spec.
- [ ] Run focused and full Web tests.
- [ ] Commit as `feat: add admin account service`.

### Task 6: Admin Overview

**Files:**
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Create: `apps/web/components/admin/AdminMetricGrid.tsx`
- Create: `apps/web/components/admin/AdminAttentionList.tsx`
- Modify: `apps/web/components/admin/ServiceHealthGrid.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/app/(admin)/admin/admin-overview.test.tsx`

**Interfaces:**
- Admin overview consumes `getAdminOverview` and links each attention item to the corresponding management page.

- [ ] Test metrics, service health, empty health state, and actionable attention links.
- [ ] Verify tests fail before implementation.
- [ ] Implement the operations-focused overview with dense but scannable hierarchy.
- [ ] Verify keyboard navigation and responsive layout.
- [ ] Commit as `feat: rebuild admin overview`.

### Task 7: Admin Users And Entitlement Drawer

**Files:**
- Modify: `apps/web/app/(admin)/admin/users/page.tsx`
- Create: `apps/web/components/admin/UserFilters.tsx`
- Create: `apps/web/components/admin/UserDetailDrawer.tsx`
- Modify: `apps/web/components/admin/AdminTable.tsx`
- Modify: `apps/web/components/admin/ConfirmActionDialog.tsx`
- Test: `apps/web/app/(admin)/admin/admin-users.test.tsx`

**Interfaces:**
- User list supports search, status, role, verification, entitlement, and trial filters.
- Detail drawer consumes `getAdminUserDetail` and exposes status, trial, entitlement, session, and task actions.

- [ ] Test filtering, pagination, opening and closing a detail drawer, stale-detail clearing, and dangerous-action confirmation.
- [ ] Verify tests fail before implementation.
- [ ] Implement the list and drawer without nesting cards; preserve table usability on mobile through responsive row treatment or horizontal table containment.
- [ ] Verify admin authorization remains enforced by `AuthGuard`.
- [ ] Commit as `feat: improve admin user entitlement management`.

### Task 8: Shared UI Quality And Browser Verification

**Files:**
- Modify: `apps/web/app/globals.css`
- Modify: affected UI components from Tasks 2-7
- Create: `apps/web/e2e/product-shell.spec.ts`

**Interfaces:**
- Browser coverage verifies the user dashboard/profile and admin overview/users flows against a running local Web server.

- [ ] Add Playwright coverage for desktop and 375px mobile navigation, entitlement CTA, profile redemption state, admin drawer, and keyboard close.
- [ ] Run Playwright against the local server and capture screenshots outside the repository.
- [ ] Run the `frontend-design-skill` 8-item quality gate and fix every failed item.
- [ ] Run Web tests, Desktop typecheck/tests, and available backend tests.
- [ ] Commit as `test: verify web product redesign`.

## Execution Order

Tasks 1-4 deliver the user-facing foundation. Tasks 5-7 deliver the administrator foundation. Task 8 is the release gate. Do not start Task 5 until Task 3 has a stable account data contract, and do not start Task 8 until Tasks 1-7 are complete.
