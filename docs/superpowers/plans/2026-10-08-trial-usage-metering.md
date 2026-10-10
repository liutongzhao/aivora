# Trial Usage Metering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every successfully verified new user five one-time trial searches and enforce usage on the server without double-spending under retries or concurrency.

**Architecture:** Add an append-only usage ledger plus a transactional reservation service. Integrate the reservation into the existing `TaskService.create()` path before task dispatch; client-side credit code remains display/compatibility only.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/Flyway, Redis, Celery, pytest.

**Spec:** `docs/superpowers/specs/2026-10-08-aivora-registration-entitlement-design.md`

## Global Constraints

- Trial is granted once after verified registration and defaults to 5 tasks.
- Trial does not automatically replenish.
- A task with a valid entitlement does not consume trial usage.
- Reservation, task creation, and input association commit atomically.
- Repeated user idempotency keys cannot reserve twice.
- Failures before provider start reverse the reservation; provider-started failures remain consumed.

## Review Focus

- Two concurrent final trial requests must allow only one when one trial remains.
- Repeating the same `client_request_id` must return the existing task without another reservation.
- Broker acknowledgement uncertainty must not create a second paid/provider call or silently refund.
- Image upload failure must reverse a reservation.
- A user cannot submit a task by changing client-side credit fields.

### Task 1: Usage schema and ledger model

**Files:**
- Create: `services/backend/db/migrations/V025__trial_usage_ledger.sql`
- Create: `services/backend/app/modules/usage/models.py`
- Create: `services/backend/app/modules/usage/schemas.py`
- Test: `tests/usage/test_usage_migration_contract.py`

- [ ] Write tests for ledger statuses, unique idempotency key, positive amounts, and user/task foreign keys.
- [ ] Add migration and SQL indexes for user/time and task lookup.
- [ ] Add SQLAlchemy models and response schemas.
- [ ] Run migration guard and usage model tests.
- [ ] Commit as `feat: 建立试用次数流水模型`.

### Task 2: Transactional trial reservation service

**Files:**
- Create: `services/backend/app/modules/usage/service.py`
- Create: `services/backend/app/modules/usage/errors.py`
- Test: `tests/usage/test_trial_reservation.py`

**Interfaces:**
- `TrialUsageService.reserve_for_task(db, user_id, idempotency_key) -> Reservation`
- `TrialUsageService.commit(reservation_id, task_id) -> None`
- `TrialUsageService.reverse(reservation_id, reason) -> None`
- `TrialUsageService.get_summary(user_id) -> UsageSummary`

- [ ] Write tests for initial five uses, no uses after exhaustion, concurrent reservation, idempotency, commit, and reverse.
- [ ] Implement row locking or an atomic update so two transactions cannot spend the same remaining use.
- [ ] Ensure a repeated idempotency key returns the existing reservation/task relationship.
- [ ] Add stable errors `TRIAL_EXHAUSTED`, `TRIAL_NOT_AVAILABLE`, and `USAGE_CONFLICT`.
- [ ] Run focused service tests.
- [ ] Commit as `feat: 增加试用次数原子结算`.

### Task 3: Integrate task creation and lifecycle settlement

**Files:**
- Modify: `services/backend/app/modules/tasks/service.py`
- Modify: `services/backend/app/modules/tasks/router.py`
- Modify: `services/backend/app/workers/ai_tasks.py`
- Test: `tests/tasks/test_trial_task_settlement.py`

- [ ] Write tests for valid entitlement bypass, trial reservation, upload failure reversal, pre-provider cancellation reversal, and provider-started failure consumption.
- [ ] Reserve usage before task input upload and persist the reservation reference with the task.
- [ ] Commit the usage reservation when the provider call begins.
- [ ] Reverse only failures covered by the spec; preserve uncertain broker/provider states.
- [ ] Return stable API error payloads for exhausted trial usage.
- [ ] Run task, worker, idempotency, and direct enqueue tests.
- [ ] Commit as `feat: 将试用权限接入搜题任务`.

### Task 4: Usage account API and client display

**Files:**
- Create: `services/backend/app/modules/usage/router.py`
- Modify: `services/backend/app/main.py`
- Modify: `apps/web/components/layout/AppShell.tsx`
- Modify: `apps/web/app/(user)/dashboard/page.tsx`
- Modify: `apps/desktop/src/services/apiClient.ts`
- Test: `tests/api/test_usage_access.py`
- Test: `apps/web/components/usage/usage-display.test.tsx`

- [ ] Add `GET /api/account/usage` with user-scoped data only.
- [ ] Test ordinary user isolation and admin boundary.
- [ ] Display trial remaining, entitlement state, and expiry without trusting local values.
- [ ] Map `TRIAL_EXHAUSTED` to the authorization-code entry point.
- [ ] Run API and web tests.
- [ ] Commit as `feat: 展示账户试用和搜题权限`.

### Task 5: Rate and concurrency protection

**Files:**
- Create: `services/backend/app/modules/usage/rate_limits.py`
- Modify: `services/backend/app/modules/tasks/router.py`
- Modify: `services/backend/app/config.py`
- Test: `tests/usage/test_usage_limits.py`

- [ ] Write tests for per-user concurrent task limits, per-IP creation limits, and valid entitlement users still receiving service protection.
- [ ] Implement Redis-backed counters and database-safe active-task checks.
- [ ] Return `TASK_RATE_LIMITED` and `TASK_CONCURRENCY_LIMITED` without exposing internals.
- [ ] Run focused tests and full task suite.
- [ ] Commit as `feat: 增加搜题请求保护`.
