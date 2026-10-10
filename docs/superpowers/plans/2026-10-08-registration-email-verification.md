# Registration Email Verification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement public registration with QQ SMTP verification, explicit account states, secure verification tickets, password reset, and registration abuse controls.

**Architecture:** Add an identity verification submodule around the existing FastAPI identity module. Store only hashes for codes and tickets, use Redis for rate limits, and keep mail delivery behind a provider interface so QQ SMTP can later be replaced.

**Tech Stack:** FastAPI, SQLAlchemy async, PostgreSQL/Flyway, Redis, Argon2, Pydantic, Next.js, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-10-08-aivora-registration-entitlement-design.md`

## Global Constraints

- New users must verify a normal personal or business email before account creation.
- Verification codes are six digits, valid for 10 minutes, single-use, and limited to 5 failed attempts.
- The same email can request a code once per 60 seconds and at most 10 times per day.
- The same IP can request at most 20 codes per hour.
- Code and ticket plaintext must never be logged or persisted.
- QQ SMTP uses an app-specific authorization code stored only in backend environment configuration.
- Existing users must not be silently locked out by the migration.

## Review Focus

- Expired, consumed, and five-times-failed codes must be rejected and cannot create accounts.
- SMTP failure must not create a user or grant trial usage.
- Duplicate emails with case differences must resolve to one normalized identity.
- Concurrent resend requests must not bypass the 60-second cooldown.
- Registration and reset responses must not reveal whether an email is already registered.

### Task 1: Identity schema and verification migrations

**Files:**
- Create: `services/backend/db/migrations/V024__registration_email_verification.sql`
- Modify: `services/backend/app/modules/identity/models.py`
- Modify: `services/backend/app/modules/identity/schemas.py`
- Test: `tests/identity/test_registration_migration_contract.py`

**Interfaces:**
- Add `User.status`, `User.email_normalized`, `User.email_verified_at`, `User.trial_granted_at`, `User.trial_total`, `User.trial_used`, `User.created_ip`, and `User.last_login_at`.
- Add `EmailVerificationCode` and `PasswordResetToken` models matching the migration.
- Expose request/response schemas for send-code, verify-code, and registration completion.

- [ ] Write migration/model contract tests for columns, status values, indexes, and uniqueness.
- [ ] Run the focused migration tests and verify failure before implementation.
- [ ] Add the versioned migration and SQL constraints without removing compatible legacy columns.
- [ ] Add SQLAlchemy models and Pydantic schemas with normalized email fields.
- [ ] Run focused tests and the migration guard suite.
- [ ] Commit as `feat: 建立注册验证数据模型`.

### Task 2: Mail sender and Redis rate-limit boundary

**Files:**
- Create: `services/backend/app/modules/identity/mail.py`
- Create: `services/backend/app/modules/identity/rate_limits.py`
- Modify: `services/backend/app/config.py`
- Modify: `services/backend/.env.example`
- Test: `tests/identity/test_mail_sender.py`
- Test: `tests/identity/test_identity_rate_limits.py`

**Interfaces:**
- `MailSender.send_verification_code(recipient: str, code: str, expires_minutes: int) -> None`
- `SmtpMailSender(settings: Settings)`
- `IdentityRateLimiter.check_send(email: str, ip: str) -> None`
- `IdentityRateLimiter.check_verify(email: str, ip: str) -> None`

- [ ] Write tests for TLS configuration, message subject/body, no code logging, and provider failure propagation.
- [ ] Write Redis rate-limit tests for email cooldown, daily email quota, IP hourly quota, and verify attempt quota.
- [ ] Add SMTP settings and an injectable mail sender factory; never use an application password in code.
- [ ] Implement atomic Redis counters with TTLs and stable error codes.
- [ ] Run the focused tests using a fake SMTP sender and fake Redis.
- [ ] Commit as `feat: 增加邮箱发信和身份限流`.

### Task 3: Registration verification service and endpoints

**Files:**
- Create: `services/backend/app/modules/identity/verification.py`
- Modify: `services/backend/app/modules/identity/service.py`
- Modify: `services/backend/app/modules/identity/router.py`
- Modify: `services/backend/app/modules/identity/dependencies.py`
- Test: `tests/identity/test_registration_flow.py`

**Interfaces:**
- `RegistrationService.send_code(email: str, ip: str) -> None`
- `RegistrationService.verify_code(email: str, code: str, ip: str) -> str`
- `IdentityService.register_verified(ticket: str, username: str | None, password: str, ip: str) -> User`

- [ ] Write tests covering send, verify, ticket expiry, ticket reuse, SMTP failure, duplicate email, and trial initialization.
- [ ] Run the focused registration tests and verify they fail against the current routes.
- [ ] Implement code hashing, single-use tickets, normalized email matching, and transaction boundaries.
- [ ] Add `POST /api/auth/registration/send-code`, `POST /api/auth/registration/verify-code`, and update registration completion.
- [ ] Return generic send responses and stable machine-readable error codes.
- [ ] Run identity tests and existing auth tests.
- [ ] Commit as `feat: 实现邮箱验证码注册流程`.

### Task 4: Password reset and account state behavior

**Files:**
- Modify: `services/backend/app/modules/identity/service.py`
- Modify: `services/backend/app/modules/identity/router.py`
- Modify: `apps/web/app/(public)/register/page.tsx`
- Create: `apps/web/app/(public)/forgot-password/page.tsx`
- Create: `apps/web/app/(public)/reset-password/page.tsx`
- Test: `tests/identity/test_password_reset.py`
- Test: `apps/web/components/auth/auth-pages.test.tsx`

- [ ] Write tests for generic reset responses, single-use reset tokens, expiry, and session revocation after reset.
- [ ] Implement reset-code delivery using the same mail and rate-limit boundaries.
- [ ] Add frontend states for requesting a reset and setting a new password.
- [ ] Ensure login rejects pending, suspended, and deleted accounts with stable codes.
- [ ] Run backend and web auth tests.
- [ ] Commit as `feat: 完善密码找回和账号状态`.

### Task 5: Registration UI and account status display

**Files:**
- Modify: `apps/web/app/(public)/register/page.tsx`
- Create: `apps/web/components/auth/VerificationCodeForm.tsx`
- Modify: `apps/web/lib/api-client.ts`
- Modify: `apps/web/components/layout/AppShell.tsx`
- Test: `apps/web/components/auth/registration-flow.test.tsx`

- [ ] Write tests for countdown, resend disabled state, validation errors, and successful completion.
- [ ] Implement the three-step registration UI without exposing whether an email exists.
- [ ] Map backend error codes to actionable UI messages.
- [ ] Add account status loading placeholders and sign-out cleanup.
- [ ] Run Vitest and the web Playwright login/register flow.
- [ ] Commit as `feat: 完成邮箱验证码注册界面`.

### Task 6: Verification and release checks

**Files:**
- Modify: `services/backend/.env.example`
- Modify: `deploy/compose.prod.yml`
- Create: `tests/e2e/test_registration_email_contract.sh`
- Create: `docs/operations/qq-mail-smtp.md`

- [ ] Document QQ mailbox authorization-code setup, secret injection, and rotation.
- [ ] Add production environment wiring without committing credentials.
- [ ] Add contract checks for required mail settings and HTTPS assumptions.
- [ ] Run backend, web, migration, and E2E tests.
- [ ] Verify no code, password, SMTP credential, or session token appears in logs.
- [ ] Commit as `docs: 补充邮箱注册上线说明`.

