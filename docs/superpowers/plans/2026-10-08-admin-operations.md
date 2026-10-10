# Admin Operations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing admin area into an auditable console for users, trial adjustments, license batches, entitlements, and operational review.

**Architecture:** Reuse the existing `require_admin` dependency and `admin_audit_logs` table. Add narrowly scoped admin endpoints that never expose SMTP credentials, password material, license plaintext, or user BYOK secrets.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL, Next.js, React, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-08-aivora-registration-entitlement-design.md`

## Global Constraints

- Every sensitive admin mutation requires an audit record and an operator reason where applicable.
- An administrator cannot suspend the only active administrator account.
- User BYOK secrets are never returned in admin responses.
- License plaintext is shown/exported only during batch creation.
- Trial and entitlement values are changed through ledger/adjustment records, not silent balance mutation.

## Review Focus

- Ordinary users cannot call admin endpoints even if they know object IDs.
- Admin list/detail responses do not leak passwords, SMTP credentials, session tokens, or BYOK keys.
- Suspending a user revokes all active sessions.
- Audit failure must not silently report a successful sensitive mutation.
- Pagination and filters cannot return records outside the requested scope.

### Task 1: Admin adjustment and audit models

**Files:**
- Create: `services/backend/db/migrations/V027__entitlement_adjustments.sql`
- Create: `services/backend/app/modules/admin/schemas.py`
- Modify: `services/backend/app/modules/admin/router.py`
- Test: `tests/api/test_admin_entitlement_contract.py`

- [ ] Write tests for adjustment fields, actor ownership, reasons, and audit payload redaction.
- [ ] Add adjustment tables for trial grants, entitlement extensions, pauses, and revocations.
- [ ] Add typed admin request/response schemas.
- [ ] Add a shared audit helper that rejects secret-bearing metadata.
- [ ] Run focused API tests.
- [ ] Commit as `feat: 建立管理员权益调整记录`.

### Task 2: User operations and account detail APIs

**Files:**
- Modify: `services/backend/app/modules/admin/router.py`
- Create: `services/backend/app/modules/admin/service.py`
- Test: `tests/api/test_admin_user_operations.py`

**Interfaces:**
- `AdminUserService.get_user_detail(user_id) -> AdminUserDetail`
- `AdminUserService.set_status(actor_id, user_id, status, reason) -> User`
- `AdminUserService.revoke_sessions(actor_id, user_id, reason) -> int`
- `AdminUserService.adjust_trial(actor_id, user_id, amount, reason) -> UsageAdjustment`

- [ ] Write tests for search/pagination, detail aggregation, suspend/reactivate, session revocation, trial adjustments, and self-suspension protection.
- [ ] Implement user-scoped aggregation for verification, trial, entitlement, and task summary.
- [ ] Revoke active sessions when suspending a user.
- [ ] Persist audit events for every mutation.
- [ ] Run admin access and isolation tests.
- [ ] Commit as `feat: 完善管理员用户运营接口`.

### Task 3: License batch and code management APIs

**Files:**
- Modify: `services/backend/app/modules/admin/router.py`
- Create: `services/backend/app/modules/admin/license_service.py`
- Test: `tests/api/test_admin_license_operations.py`

- [ ] Write tests for default duration configuration, batch creation, one-time export, list masking, and revocation.
- [ ] Implement configurable default duration with a safe maximum.
- [ ] Return plaintext codes only from the creation/export response required by the operator.
- [ ] Store only masked suffixes in list/detail responses.
- [ ] Audit batch creation, export, and revoke operations.
- [ ] Run API tests with ordinary-user denial coverage.
- [ ] Commit as `feat: 增加管理员授权码管理`.

### Task 4: Admin web pages

**Files:**
- Create: `apps/web/app/(admin)/admin/licenses/page.tsx`
- Create: `apps/web/components/admin/LicenseBatchForm.tsx`
- Create: `apps/web/components/admin/UserEntitlementPanel.tsx`
- Modify: `apps/web/app/(admin)/admin/users/page.tsx`
- Modify: `apps/web/app/(admin)/admin/page.tsx`
- Test: `apps/web/components/admin/admin-entitlement-pages.test.tsx`

- [ ] Write tests for user status, trial summary, entitlement dates, batch form, and masked-code list.
- [ ] Add user detail actions with confirmation and reason fields.
- [ ] Add license batch generation with one-time plaintext display warning.
- [ ] Add entitlement extension, pause, revoke, and trial adjustment controls.
- [ ] Add loading, empty, error, success, and keyboard focus states.
- [ ] Run Vitest and Playwright admin flows.
- [ ] Commit as `feat: 增加管理员权益运营页面`.

### Task 5: Audit query and security hardening

**Files:**
- Create: `apps/web/app/(admin)/admin/audit/page.tsx`
- Modify: `services/backend/app/modules/admin/router.py`
- Modify: `services/backend/app/modules/identity/dependencies.py`
- Test: `tests/api/test_admin_audit_and_redaction.py`

- [ ] Write tests for audit filtering, pagination, redaction, and ordinary-user denial.
- [ ] Add audit search by actor, action, resource, and date.
- [ ] Add explicit redaction for email verification codes, license codes, SMTP values, session IDs, and BYOK secrets.
- [ ] Add protection against suspending the only active admin.
- [ ] Run security-focused tests and existing admin tests.
- [ ] Commit as `feat: 增加管理员审计和敏感信息脱敏`.

### Task 6: Operational documentation and release gate

**Files:**
- Create: `docs/operations/license-operations.md`
- Create: `docs/operations/registration-operations.md`
- Modify: `docs/本地开发与验收.md`

- [ ] Document QQ mailbox setup, authorization-code handling, license generation, one-time export, and revocation.
- [ ] Document trial and expiry support rules.
- [ ] Document rollback and migration checks.
- [ ] Add end-to-end release checklist for registration, redemption, expiry, suspension, and audit.
- [ ] Run the full backend/web test suites and publish the verified commands.
- [ ] Commit as `docs: 补充注册授权运营手册`.

