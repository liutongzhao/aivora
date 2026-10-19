# Model Configuration Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Simplify Web and desktop model setup into one model-first flow while keeping topic routing separate and allowing a read-only built-in trial model.

**Architecture:** Add a backend aggregate discovery/save contract while preserving existing fine-grained endpoints for compatibility. Resolve trial tasks through a server-owned built-in model and keep user model routing explicit. Update both clients to remove the editable vision flag and present only a warning.

**Tech Stack:** FastAPI, SQLAlchemy/Flyway, Next.js/React, Electron/React, Vitest/pytest.

**Spec:** `optimization/TASK-004-免费体验与模型配置流程优化.md` plus the approved conversation design.

## Global Constraints

- Do not commit, push, publish, or modify production data.
- Existing connections, models, defaults, and desktop API contracts remain compatible.
- Model setup never assigns a user model to a topic automatically.
- Built-in trial model is read-only to users and must not expose credentials.
- Do not claim provider vision support; show a warning only.

## Review Focus

- Trial users without BYOK configuration can still create tasks through the server-owned model.
- Adding a custom model does not change any topic default.
- Duplicate connection names are rejected consistently.
- Legacy clients can still use old connection/model endpoints and fields.
- Provider/model discovery failures identify the failing step and are recoverable.

### Task 1: Backend runtime and aggregate model setup

**Files:** `services/backend/app/modules/byok/*`, `services/backend/app/modules/tasks/service.py`, usage/identity settings, migrations if needed, backend tests.

- Add discovery/save request models and service methods that validate unique connection names, probe the provider, and save exactly one selected model without changing defaults.
- Add server-owned trial-model resolution with a read-only response shape and preserve existing BYOK endpoints.
- Keep `supports_vision` accepted for old data but stop requiring it in new flows.
- Add tests for trial fallback, selected-model save, duplicate names, and unchanged defaults.

### Task 2: Web model settings

**Files:** `apps/web/app/(user)/dashboard/settings/page.tsx`, related CSS/tests and API types.

- Replace connection-first controls with an add-model flow: URL/key, discovery, model select, save.
- Render one model table with built-in read-only row and user rows.
- Keep topic routing and prompts as separate sections; do not assign modes during model save.
- Remove the vision checkbox and show the image-model warning.

### Task 3: Desktop model settings

**Files:** `apps/desktop/src/components/ConnectionSettings/*`, `ModelPromptCenter/*`, user config types/service/tests.

- Mirror the Web model-first flow using the aggregate API, while retaining legacy service methods.
- Remove editable vision controls and keep routing filters from depending on the user-entered flag.
- Preserve topic routing as an independent panel.

### Task 4: Verification

- Run focused backend/frontend tests, typechecks, builds, and inspect the final diff.
- Do not commit or push.
