# License Entitlements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement one-time license-code activation that grants a configurable number of calendar months and supports safe renewal.

**Architecture:** Generate high-entropy codes in the backend, persist only hashes, lock codes during redemption, and represent resulting access as user entitlement records. Code duration is fixed at batch creation time.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/Flyway, Argon2-compatible hashing utilities, pytest, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-aivora-registration-entitlement-design.md`

## Global Constraints

- Default new-code duration is 6 calendar months.
- Administrators can configure future batches; existing batches never change.
- A code can be redeemed once and binds to the first account that redeems it.
- Redemption is transactional and rate-limited.
- Renewal starts at the current entitlement expiry when still active.
- Expiry blocks new tasks but does not block login, history, or model configuration.

## Review Focus

- Two concurrent redemption requests for one code must produce one activation.
- Code plaintext must not be recoverable from the database after generation/export.
- A duration-setting change must not mutate existing batch durations.
- Month-end renewal must use a deterministic calendar-month rule.
- An expired entitlement must not accidentally grant trial usage or allow new tasks.

### Task 1: License and entitlement migrations/models

**Files:**
- Create: `services/backend/db/migrations/V026__license_entitlements.sql`
- Create: `services/backend/app/modules/licenses/models.py`
- Create: `services/backend/app/modules/licenses/schemas.py`
- Test: `tests/licenses/test_license_migration_contract.py`

- [ ] Write tests for batch, code, entitlement fields, statuses, indexes, and foreign keys.
- [ ] Add versioned migration with unique code hashes and entitlement lookup indexes.
- [ ] Add models and validation schemas.
- [ ] Run migration and model tests.
- [ ] Commit as `feat: 建立授权码和权益模型`.

### Task 2: Secure code generation and batch service

**Files:**
- Create: `services/backend/app/modules/licenses/service.py`
- Create: `services/backend/app/modules/licenses/codecs.py`
- Test: `tests/licenses/test_license_generation.py`

**Interfaces:**
- `LicenseCodeService.create_batch(admin_id, name, quantity, duration_months) -> LicenseBatchResult`
- `LicenseCodeService.revoke_code(admin_id, code_id, reason) -> None`
- `LicenseCodeService.mask_code_suffix(code) -> str`

- [ ] Write tests for format, uniqueness, configured maximum duration, one-time plaintext return, and masking.
- [ ] Generate cryptographically secure codes and store only hashes.
- [ ] Save fixed duration on each batch and validate positive month values.
- [ ] Ensure generated plaintext is not included in later list responses or logs.
- [ ] Run focused tests.
- [ ] Commit as `feat: 增加授权码批量生成`.

### Task 3: Redemption and renewal service

**Files:**
- Modify: `services/backend/app/modules/licenses/service.py`
- Create: `services/backend/app/modules/licenses/errors.py`
- Test: `tests/licenses/test_license_redemption.py`

**Interfaces:**
- `LicenseCodeService.redeem(user_id, raw_code) -> Entitlement`
- `LicenseCodeService.get_current_entitlement(user_id) -> Entitlement | None`
- `LicenseCodeService.extend_entitlement(user_id, months, source, actor_id) -> Entitlement`

- [ ] Write tests for valid redemption, duplicate redemption, revoked code, unverified account, concurrent redemption, active renewal, and expired renewal.
- [ ] Lock the code row during redemption and create the entitlement in one transaction.
- [ ] Calculate calendar-month expiry with deterministic end-of-month handling.
- [ ] Prevent redemption from transferring a code to another account.
- [ ] Run focused tests.
- [ ] Commit as `feat: 实现授权码激活和续期`.

### Task 4: User entitlement API and task permission integration

**Files:**
- Create: `services/backend/app/modules/licenses/router.py`
- Modify: `services/backend/app/main.py`
- Modify: `services/backend/app/modules/tasks/service.py`
- Test: `tests/api/test_license_redemption_access.py`

- [ ] Add `GET /api/account/entitlements` and `POST /api/licenses/redeem`.
- [ ] Test ordinary-user ownership and stable errors for expired/revoked states.
- [ ] Make task creation consult entitlement before trial reservation.
- [ ] Ensure expired users can access history and configuration but cannot create tasks.
- [ ] Run API, task, and usage tests.
- [ ] Commit as `feat: 接入用户期限授权`.

### Task 5: Frontend activation and expiry experience

**Files:**
- Create: `apps/web/components/licenses/LicenseRedeemForm.tsx`
- Modify: `apps/web/app/(user)/dashboard/page.tsx`
- Modify: `apps/web/app/(user)/dashboard/settings/page.tsx`
- Modify: `apps/desktop/src/components/AccountSettings/AccountSettings.tsx`
- Test: `apps/web/components/licenses/license-redeem.test.tsx`

- [ ] Write tests for successful activation, invalid code, expired entitlement, and renewal display.
- [ ] Implement redemption form with no code persistence beyond submission.
- [ ] Show current start/end dates and remaining days from server data.
- [ ] Map permission errors to activation/configuration actions.
- [ ] Run web and desktop tests.
- [ ] Commit as `feat: 增加授权激活界面`.

