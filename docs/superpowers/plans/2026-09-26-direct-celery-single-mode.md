# Direct Celery Single-Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让任务创建后直接进入 Celery，由一个并发 Worker 处理多用户多任务，并移除 Beat、maintenance 和旧调度模式。

**Architecture:** FastAPI 在任务及图片事务提交后直接调用 `run_ai_task.apply_async(task_id)`。Worker 通过 PostgreSQL 原子更新抢占 `queued` 任务，重复消息直接退出；Redis 继续承担 Celery Broker 和 Redis Streams 事件传输，SSE 链路保持不变。

**Tech Stack:** FastAPI, SQLAlchemy Async, PostgreSQL, Celery 5, Redis, MinIO, pytest, Docker Compose, Bash.

**Spec:** `docs/superpowers/specs/2026-09-26-direct-celery-single-mode-design.md`

## Global Constraints

- 只保留一个直接入队执行模式。
- 日常运行不需要 Celery Beat 或 maintenance Worker。
- 默认 Worker 使用 `--pool=prefork --concurrency=4 --queues=aivora`。
- 任务状态只使用 `queued`, `processing`, `streaming`, `completed`, `failed`, `cancelled`。
- 保留用户级模型配置、SSE 鉴权、Redis Streams 和 MinIO 图片存储。
- 不引入新消息中间件，不实现 Transactional Outbox。
- 不修改与本次改造无关的工作区文件。

## Review Focus

- 数据库提交后直接入队：断言 API 调用 `apply_async`，而不是等待周期扫描。
- 重复 Celery 消息：并发执行同一任务时只允许一次 Provider 调用。
- 多用户并发：不同任务不共享状态，多个任务可以同时进入 Worker 槽位。
- 投递失败：任务进入 `failed` 并保留可诊断错误。
- 上传中断：已上传对象立即删除，且不再需要 maintenance 队列。

---

### Task 1: Replace Scheduled Dispatch With Direct Enqueue

**Files:**
- Modify: `backend/app/modules/tasks/service.py`
- Modify: `backend/app/config.py`
- Modify: `backend/app/modules/byok/service.py` call boundary if needed
- Test: `tests/tasks/test_direct_enqueue.py`
- Modify/Delete: `tests/tasks/test_worker_lease.py` old scheduled-creation cases

**Interfaces:**
- Produces `TaskService.create(...)` that commits a durable queued task and immediately calls `celery_app.send_task("aivora.run_ai_task", args=[str(task.id)], queue="aivora")` or an equivalent imported task signature.
- `BYOK_REQUIRED` independently controls model configuration resolution; no dispatch-mode setting remains.

- [ ] **Step 1: Write failing tests**

  Add tests asserting:
  - task creation persists `queued` and publishes exactly one Celery message;
  - the message contains only the task ID and the `aivora` queue;
  - `TASK_DISPATCH_ENABLED` is no longer required;
  - a broker exception marks the task `failed` with a dispatch error;
  - two different users can create tasks and both are published.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks/test_direct_enqueue.py
  ```

  Expected: FAIL because creation still branches on `task_dispatch_enabled` and does not publish durable tasks directly.

- [ ] **Step 3: Implement direct enqueue**

  In `TaskService.create`:
  - generate the task UUID before uploading;
  - upload all images and stage `StoredFile`/`TaskImage` rows in one session;
  - commit the task, image rows, and SSE token together as `queued`;
  - remove the `created` placeholder and scheduled/direct branch;
  - immediately publish `aivora.run_ai_task` with only `task_id`;
  - on publish failure, atomically change `queued` to `failed` with a stable error code and emit an error event;
  - resolve BYOK configuration whenever `settings.byok_required` is true.

  Remove the Redis task-input fallback from the creation path because all current tasks use durable `TaskImage` rows. On any upload or database failure, delete every object recorded in `uploaded_keys` before returning the error.

- [ ] **Step 4: Run the focused tests**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks/test_direct_enqueue.py
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/modules/tasks/service.py backend/app/config.py tests/tasks/test_direct_enqueue.py tests/tasks/test_worker_lease.py
  git commit -m "feat: enqueue tasks directly after creation"
  ```

### Task 2: Simplify Worker Claiming and Remove Lease Dispatch Code

**Files:**
- Modify: `backend/app/workers/ai_tasks.py`
- Modify: `backend/app/modules/tasks/models.py`
- Modify: `backend/app/modules/tasks/router.py`
- Delete: `backend/app/modules/tasks/dispatch.py`
- Delete: `backend/app/workers/dispatcher.py`
- Delete: `backend/app/workers/maintenance.py`
- Modify: `backend/app/workers/celery_app.py`
- Create: `backend/db/migrations/V016__remove_task_dispatch_fields.sql`
- Test: `tests/tasks/test_worker_direct_execution.py`
- Replace: `tests/tasks/test_dispatch_recovery.py`
- Replace: `tests/tasks/test_dispatch_fairness.py`
- Modify: `tests/tasks/test_worker_loop.py`
- Modify: `tests/tasks/test_worker_lease.py`
- Modify: `tests/tasks/test_task_cancel_race.py`

**Interfaces:**
- Produces `acquire_execution(db, task_id: UUID) -> bool`.
- Produces `run_ai_task(self, task_id: str) -> None`, with no generation argument.
- Worker execution starts only when `queued -> processing` succeeds.

- [ ] **Step 1: Write failing tests**

  Add or replace tests asserting:
  - one direct task message can execute a queued task;
  - two concurrent `_run_task(task_id)` calls invoke the Provider once;
  - a completed, failed, cancelled, or already-processing task does not invoke the Provider;
  - multiple task IDs can execute concurrently;
  - no worker code reads legacy Redis task-input payloads.

- [ ] **Step 2: Run focused worker tests and verify they fail**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks/test_worker_direct_execution.py tests/tasks/test_worker_loop.py tests/tasks/test_worker_lease.py
  ```

  Expected: FAIL because the worker currently requires generation/lease fields and supports legacy Redis input.

- [ ] **Step 3: Implement the single claim path**

  Replace generation and lease predicates with one conditional update from `queued` to `processing`. Keep short database sessions, task cancellation checks, stream event writes, answer persistence, and terminal state fencing. Remove legacy Redis input loading and all generation parameters from completion/failure helpers.

  Remove dispatch and maintenance task registrations from `celery_app.py`. Keep `acks_late`, `task_reject_on_worker_lost`, time limits, and the `aivora` default queue.

  Add migration `V016__remove_task_dispatch_fields.sql` to drop `dispatch_generation`, `lease_state`, `lease_expires_at`, and `published_at`, plus their dispatch index. Remove the matching ORM fields and router updates.

- [ ] **Step 4: Run focused worker tests**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks/test_worker_direct_execution.py tests/tasks/test_worker_loop.py tests/tasks/test_worker_lease.py tests/tasks/test_task_cancel_race.py
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/workers backend/app/modules/tasks backend/db/migrations/V016__remove_task_dispatch_fields.sql tests/tasks
  git commit -m "refactor: simplify worker execution to one claim mode"
  ```

### Task 3: Make Upload Cleanup Inline

**Files:**
- Modify: `backend/app/modules/tasks/service.py`
- Modify: `tests/tasks/test_task_input_persistence.py`
- Delete obsolete maintenance/reconciliation tests from `tests/tasks/test_dispatch_recovery.py`

**Interfaces:**
- Upload failures continue to delete all objects uploaded during the current request.
- No `reconcile_created_tasks` function or maintenance Celery task remains.

- [ ] **Step 1: Write failing cleanup tests**

  Assert:
  - a failure on the second image deletes both the first and second uploaded objects;
  - the task is marked `failed` with `TASK_INPUT_UPLOAD_FAILED`;
  - successful creation leaves no Redis task-input record;
  - no test or runtime path imports `reconcile_created_tasks`.

- [ ] **Step 2: Run focused cleanup tests and verify they fail**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks/test_task_input_persistence.py
  ```

  Expected: FAIL because cleanup currently relies on created placeholders and maintenance reconciliation.

- [ ] **Step 3: Implement inline cleanup**

  Remove placeholder reconciliation and Redis input cleanup. Keep the existing uploaded-key tracking in the exception path, but normalize the failure code/message and ensure cleanup runs before returning the error.

- [ ] **Step 4: Run focused cleanup tests**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks/test_task_input_persistence.py
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add backend/app/modules/tasks/service.py tests/tasks/test_task_input_persistence.py
  git commit -m "refactor: clean failed task uploads inline"
  ```

### Task 4: Remove Extra Services From Local and Compose Startup

**Files:**
- Modify: `scripts/start-aivora.sh`
- Modify: `scripts/stop-aivora.sh`
- Modify: `scripts/check-aivora.sh`
- Modify: `docker-compose.yml`
- Replace: `tests/e2e/test_worker_startup_config.py`
- Modify: `docs/本地开发与验收.md`

**Interfaces:**
- Local startup defines only `aivora-backend`, `aivora-worker`, `aivora-web`, and `aivora-dev`.
- Compose defines only one Celery `worker` service for task execution.
- No startup script contains Beat, maintenance queue, or `TASK_DISPATCH_ENABLED`.

- [ ] **Step 1: Write failing startup tests**

  Assert:
  - Beat and maintenance names are absent;
  - worker uses `--queues=aivora --pool=prefork --concurrency=4`;
  - API and worker do not export `TASK_DISPATCH_ENABLED`;
  - Compose contains no `beat:` or `maintenance:` services.

- [ ] **Step 2: Run startup tests and verify they fail**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/e2e/test_worker_startup_config.py
  ```

  Expected: FAIL because the current scripts and Compose still define both services.

- [ ] **Step 3: Update startup and documentation**

  Remove the two service launches and their check/stop entries. Remove the dispatch environment variable from all service definitions. Keep Flyway dependencies for API and worker and preserve the existing worker concurrency.

- [ ] **Step 4: Run startup tests**

  Run:

  ```bash
  PYTHONPATH=backend pytest -q tests/e2e/test_worker_startup_config.py
  ```

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add scripts docker-compose.yml tests/e2e/test_worker_startup_config.py docs/本地开发与验收.md
  git commit -m "chore: remove beat and maintenance services"
  ```

### Task 5: Full Verification and Runtime Smoke Test

**Files:**
- Modify only files required by failing tests or formatting.

- [ ] **Step 1: Run backend task and API tests**

  ```bash
  PYTHONPATH=backend pytest -q tests/tasks tests/api
  ```

  Expected: PASS.

- [ ] **Step 2: Run application checks**

  ```bash
  npm test
  npm run typecheck
  npm run build
  conda run -n aivora-backend python -m compileall -q backend/app
  ```

  Expected: PASS.

- [ ] **Step 3: Apply migration in an isolated database**

  Run the existing isolated infrastructure fixture or Flyway validation and confirm `V016` applies cleanly and historical task/answer rows remain readable.

- [ ] **Step 4: Run the local service check**

  Start the simplified stack with `./scripts/start-aivora.sh`, run `./scripts/check-aivora.sh`, and confirm only the backend, worker, web, and desktop processes are listed. Submit one mock task and verify it reaches `completed` through SSE.

- [ ] **Step 5: Commit verification updates**

  ```bash
  git status --short
  git diff --check
  git commit -m "test: verify direct celery task flow"
  ```
