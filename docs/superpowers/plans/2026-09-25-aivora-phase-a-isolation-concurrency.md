# Aivora Phase A Isolation and Concurrency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让多个普通用户的任务公平、可靠、互不串号地并发执行，并对现有任务/SSE/文件/设备边界进行可重复的隔离验收。

**Architecture:** 保留 FastAPI、PostgreSQL、Redis Streams、Celery 模块化单体。任务及有序图片输入持久化后由数据库单一事务公平领取、建立带代际标识的租约，再向 Celery 派发；Worker 以租约代际原子更新任务，短事务保存状态，不跨模型流占用数据库连接。调度器周期对账、释放崩溃租约并补发；每任务事件仍使用既有 Redis Stream。

**Tech Stack:** Python >=3.12, FastAPI, SQLAlchemy asyncio, PostgreSQL 16, Redis 7, Celery 5, Flyway, pytest, MinIO, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-25-aivora-multiuser-product-design.md`，尤其第 4、5、11、12、13 节；全产品依赖见 `docs/superpowers/plans/2026-09-25-aivora-product-roadmap.md`。

## Global Constraints

- BYOK-only；本阶段不得新增平台密钥依赖或把现有环境密钥暴露给用户。B 阶段必须在正式开放多用户推理前接通每用户密钥。
- 初始全局同时运行槽位 4、每用户 2；至少 10 名用户同时提交且 4 名不同用户同时推理。
- 任务、截图、设备、SSE 不跨用户；管理员访问只通过已授权接口。
- 新截图默认保留 30 天；旧截图不延长原到期时间。此迁移属于 F 阶段，不在 A 中改变现有保留行为。
- 保留旧任务/答案读取和现有桌面端 API 形状；不直接展示原始 JSON 的 UI 与字段流改造属于 C/D/E。
- 仅通过 Flyway 增量迁移更改数据库；不删除用户现有改动。

## Review Focus

- 同一用户同时重复提交相同 `client_request_id`：只生成一个任务与一次模型请求；Task 1、4 的并发测试。
- Worker 已开始推理后取消，而模型随后完成：任务保持 `cancelled`，不产生确定答案；Task 3 的竞态测试。
- 派发消息成功但 API/调度器在确认前退出：重复消息不能重复调用模型；Task 2、3 的代际测试。
- 某用户模型限流或图片读取超时：另一用户任务仍可开始并完成；Task 3、5 的故障注入测试。
- 伪造别人的 SSE token/图片 ID/设备 ID 或重连事件 ID：不能获得资源或事件；Task 4 的身份矩阵测试。

---

## File Map And Contract

| 文件 | 职责 |
| --- | --- |
| `backend/db/migrations/V011__task_dispatch_lease.sql` | 持久化任务图片顺序、租约代际、派发/心跳时间与必要索引；保持 V005 状态 CHECK 不变 |
| `backend/app/modules/tasks/models.py` | 映射新增任务字段与 `TaskImage`；无明文密钥 |
| `backend/app/modules/tasks/dispatch.py` | `claim_next(db, now, global_limit, user_limit) -> Claim | None`、`mark_published(db, claim) -> None`、`reconcile(db, now) -> list[UUID]`；PostgreSQL 行锁/事务与用户公平 |
| `backend/app/modules/tasks/service.py` | 用户作用域幂等创建、图片持久化；不直接 `send_task` |
| `backend/app/workers/dispatcher.py` | Beat 周期调度、派发及派发结果确认/重试；共享同一数据库的多调度器安全 |
| `backend/app/workers/ai_tasks.py` | `run_ai_task(task_id, generation)`；原子领取、短会话、故障分类、取消栅栏 |
| `backend/app/workers/celery_app.py`, `scripts/start-aivora.sh`, `docker-compose.yml`, `backend/app/config.py` | Beat、4 个可配置 prefork 槽、预取及任务超时 |
| `backend/app/modules/tasks/router.py`, `backend/app/infrastructure/events.py`, `src/services/sseService.ts` | SSE 用户绑定/重连、事件 ID、桌面鉴权迁移与终态 |
| `backend/app/modules/files/service.py`, `backend/app/modules/devices/router.py` | 只修复隔离测试发现的越权缺口；管理员新功能留到 E |

任务保持 `queued/processing/streaming/completed/failed/cancelled` 状态；租约 `reserved/running` 是**独立字段**，不向旧 API 暴露新状态。调度按用户最老待处理任务轮转，先确保不同用户各占一个槽，再允许同一用户第二槽；优先使用 SQL 排序与 `FOR UPDATE SKIP LOCKED`，同一事务内锁定单行调度互斥键（PostgreSQL `pg_advisory_xact_lock`），计算活跃租约数并选人，避免多 Beat 进程超分配。`Claim` 携带任务 ID、用户 ID、整数 generation；派发消息只带 ID 和代际，不带用户截图或密钥。

租约从 `reserved` 启动时切 `running`；消息重复或租约过期后旧代际消息必须立即退出。`reserved` 在未发布/发布未确认时都可能重发；只有原子 `reserved -> running` 的一个 Worker 可以调用模型。`running` 的到期时间必须大于 Celery hard limit，并在有心跳的长调用期间刷新；超时后重新调度必须先确认旧执行不再有效，最终写入始终校验代际与非取消状态。若进程在上游已接单但提交结果前崩溃，外部模型调用无法证明“恰好一次”；该任务明确标记 `WORKER_LOST_UNCERTAIN`，**不自动重试可能已经计费的调用**，由用户明确发起新任务。消息丢失和数据库短时不可用由周期对账处理；绝不依赖进程内 semaphore。

## Task 1: 持久化输入、幂等与租约基础

**Files:**
- Create: `backend/db/migrations/V011__task_dispatch_lease.sql`
- Modify: `backend/app/modules/tasks/models.py`, `backend/app/modules/tasks/service.py`
- Test: `tests/tasks/test_task_create_idempotency.py`, `tests/tasks/test_task_input_persistence.py`

**Interfaces:**
- Produces: `TaskImage(task_id: UUID, ordinal: int, stored_file_id: UUID)`；任务字段 `dispatch_generation: int`, `lease_state: str | None`, `lease_expires_at: datetime | None`, `published_at: datetime | None`。
- Produces: `TaskService.create(user_id: UUID, request: ProcessScreenshotRequest) -> tuple[AITask, str]`，重复请求仅刷新**该用户任务**的 stream token。

- [ ] **Step 1: 写失败测试。** 在 Postgres + MinIO 测试 fixture 中并发 `asyncio.gather` 提交同一用户、同一请求 ID 的两次请求，断言同一任务 ID、一组按 ordinal 排列的图片，以及无直接 `celery_app.send_task`；不同用户同键各有一个任务。再测 MinIO 上传失败：不留一个可派发的 `queued` 任务。
  ```python
  first, second = await asyncio.gather(create_for(user_a, "same"), create_for(user_a, "same"))
  assert first.id == second.id
  assert await count_tasks(user_a, "same") == 1
  assert await image_ordinals(first.id) == [0, 1]
  ```
- [ ] **Step 2: 运行红灯。** `PYTHONPATH=backend pytest -q tests/tasks/test_task_create_idempotency.py tests/tasks/test_task_input_persistence.py`；预期新测试失败。
- [ ] **Step 3: 实现最小改动。** V011 新增 `task_images`（`task_id` FK、`ordinal`、`stored_file_id` FK、唯一 `(task_id, ordinal)`）、租约四字段及 `status,created_at,user_id` 索引。创建任务先以不可派发状态持久化，再存图片；成功后以唯一 `(user_id,client_request_id)` 收敛冲突，事务内保存有序文件关联并置 `queued`，异常则清理已上传对象并将创建态任务标记失败。重复键返回原任务而不二次上传/派发。保留已创建任务的 Redis 输入读取作为过渡，新增任务读取 DB 关联；迁移不删现有字段。
  ```sql
  CREATE TABLE task_images (
      task_id UUID NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
      ordinal INTEGER NOT NULL CHECK (ordinal >= 0),
      stored_file_id UUID NOT NULL REFERENCES stored_files(id),
      PRIMARY KEY (task_id, ordinal)
  );
  ALTER TABLE ai_tasks ADD COLUMN dispatch_generation INTEGER NOT NULL DEFAULT 0;
  ALTER TABLE ai_tasks ADD COLUMN lease_state VARCHAR(16);
  ALTER TABLE ai_tasks ADD COLUMN lease_expires_at TIMESTAMPTZ;
  ALTER TABLE ai_tasks ADD COLUMN published_at TIMESTAMPTZ;
  CREATE INDEX idx_ai_tasks_dispatch ON ai_tasks(status, created_at, user_id);
  ```
- [ ] **Step 4: 运行绿灯及迁移验证。** 同 Step 2 命令应全绿；`docker compose run --rm flyway` 应成功；旧任务查询与图片顺序回归通过。
- [ ] **Step 5: 独立提交。** `git add backend/db/migrations/V011__task_dispatch_lease.sql backend/app/modules/tasks/models.py backend/app/modules/tasks/service.py tests/tasks/test_task_create_idempotency.py tests/tasks/test_task_input_persistence.py`，`git commit -m "feat: persist task inputs and dispatch lease state"`；若涉及已有未提交改动，逐块核对后仅暂存本任务改动。

## Task 2: 事务性公平领取与派发对账

**Files:**
- Create: `backend/app/modules/tasks/dispatch.py`, `backend/app/workers/dispatcher.py`
- Modify: `backend/app/workers/celery_app.py`, `backend/app/config.py`
- Test: `tests/tasks/test_dispatch_fairness.py`, `tests/tasks/test_dispatch_recovery.py`

**Interfaces:**
- Consumes: Task 1 的 `AITask` 租约字段与有序输入。
- Produces: `Claim(task_id: UUID, user_id: UUID, generation: int)`；`claim_next(db: AsyncSession, now: datetime, global_limit: int, user_limit: int) -> Claim | None`；`mark_published(db: AsyncSession, claim: Claim) -> None`；`reconcile(db: AsyncSession, now: datetime) -> list[UUID]`。
- Produces: Celery 周期任务 `aivora.dispatch_queued`，只发送 `aivora.run_ai_task` 的 `(task_id, generation)`。

- [ ] **Step 1: 写失败测试。** 用真实 PostgreSQL 两个独立 Session 同时调用 `claim_next`；用户 A 排队 6 个、B/C/D 各 1 个，前 4 个 Claim 用户须各不相同；第五个无槽、取消的任务不领取；另测单用户最多 2 槽与 2 个调度器不会超领。
- [ ] **Step 2: 运行红灯。** `PYTHONPATH=backend pytest -q tests/tasks/test_dispatch_fairness.py tests/tasks/test_dispatch_recovery.py`；预期缺少调度函数而失败。
- [ ] **Step 3: 实现调度与对账。** 事务内先获得同一 advisory lock，再计算活跃 `reserved/running` 租约，筛出尚有用户额度的最老 `queued` 任务；优先活跃数为 0 的用户，再按等待时间/用户 ID 稳定排序。Claim 原子递增 generation 并设置 `reserved` 和过期时间，提交后才发 Celery；成功标记 `published_at`，发布异常留待周期对账。过期 `reserved` 重新入队并提升代际；过期 `running` 由 Task 3 的故障策略标记为无法确定是否计费的失败，不凭空并行重调度。`reconcile` 定期处理消息丢失和卡住的租约，并保留取消/终态不重派发。
  ```python
  @dataclass(frozen=True)
  class Claim:
      task_id: UUID
      user_id: UUID
      generation: int
  ```
- [ ] **Step 4: 验证故障窗口。** 模拟 broker 发布成功后 `mark_published` 失败，重复发送同一 generation；模拟 publish 失败/Beat 被杀，下一轮补发；两种情况只允许一次 Worker 取得执行权。运行 Step 2 命令并确认全绿。
- [ ] **Step 5: 独立提交。** `git add backend/app/modules/tasks/dispatch.py backend/app/workers/dispatcher.py backend/app/workers/celery_app.py backend/app/config.py tests/tasks/test_dispatch_fairness.py tests/tasks/test_dispatch_recovery.py`，`git commit -m "feat: dispatch queued tasks fairly with durable leases"`。

## Task 3: Worker 原子状态、超时、重试和取消

**Files:**
- Modify: `backend/app/workers/ai_tasks.py`, `backend/app/modules/tasks/router.py`, `backend/app/modules/tasks/dispatch.py`
- Test: `tests/tasks/test_worker_lease.py`, `tests/tasks/test_worker_loop.py`, `tests/tasks/test_task_cancel_race.py`

**Interfaces:**
- Consumes: `run_ai_task(task_id: str, generation: int)` 对应 Task 2 Claim。
- Produces: `acquire_execution(db: AsyncSession, task_id: UUID, generation: int) -> bool`；`finish_if_current(db: AsyncSession, task_id: UUID, generation: int, answer: Answer) -> bool`；终态事件仅在成功提交终态后发送。

- [ ] **Step 1: 写失败测试。** 同一 `(task_id,generation)` 两条消息同时启动，provider 调用计数为 1；取消发生在首个 chunk 后，最终数据库状态为 `cancelled` 且无完成事件或标准答案；图片读取超时写错误码并释放槽位；一个 provider 长时间超时不阻止另一用户。
- [ ] **Step 2: 运行红灯。** `PYTHONPATH=backend pytest -q tests/tasks/test_worker_lease.py tests/tasks/test_task_cancel_race.py tests/tasks/test_worker_loop.py`；预期新竞态测试失败。
- [ ] **Step 3: 实现原子执行。** 用 `UPDATE ... WHERE id=:id AND dispatch_generation=:generation AND lease_state='reserved' AND status='queued' RETURNING id` 取得唯一执行权；开始与阶段事件在短会话提交后写入。图片按 `task_images.ordinal` 读取，旧任务仅在没有关联时兼容 Redis 输入；读图与模型请求限时，流中定期检查取消和刷新租约，任何完成/失败写入也以代际 + 未取消条件做 CAS。只在赢得 CAS 后写 `Answer` 和终态事件；上游明确拒绝且确定未计费的限流可有限次退避，发生可能已接单的超时/断线则标记无法确定是否计费，不自动重试。移除 Celery 自身重试和跨整个模型流的 SQLAlchemy session。
  ```sql
  UPDATE ai_tasks SET lease_state = 'running', status = 'processing'
  WHERE id = :task_id AND dispatch_generation = :generation
    AND lease_state = 'reserved' AND status = 'queued'
  RETURNING id;
  ```
- [ ] **Step 4: 运行绿灯与崩溃测试。** Step 2 命令及 `PYTHONPATH=backend pytest -q tests/tasks/test_dispatch_recovery.py` 全绿；强杀运行中 Worker，等待硬超时与租约对账，不得产生两个并行模型调用，已进入上游的任务清楚标记 `WORKER_LOST_UNCERTAIN`，不得自动重发。验证现有 `tests/e2e/test_screenshot_to_answer.py`。
- [ ] **Step 5: 独立提交。** `git add backend/app/workers/ai_tasks.py backend/app/modules/tasks/router.py backend/app/modules/tasks/dispatch.py tests/tasks/test_worker_lease.py tests/tasks/test_task_cancel_race.py`；`tests/tasks/test_worker_loop.py` 如已有用户未提交改动须仅按 hunk 暂存本任务修改；`git commit -m "feat: fence worker attempts and preserve cancellation"`。

## Task 4: 任务/文件/设备/SSE 身份矩阵

**Files:**
- Modify: `backend/app/modules/tasks/router.py`, `backend/app/infrastructure/events.py`, `backend/app/modules/files/service.py`, `backend/app/modules/devices/router.py`
- Modify: `src/services/sseService.ts`
- Test: `tests/api/test_tenant_isolation.py`, `tests/api/test_sse_authorization.py`, `src/services/sseService.test.ts`

**Interfaces:**
- Consumes: `TaskService.get_task(user_id,task_id)`、已有 `get_current_user`、`FileService.get_owned`。
- Produces: SSE token 与任务/发起会话绑定，服务端核对当前登录会话；失效/撤销不可读；`Last-Event-ID` 用真实 Redis ID；常规接口对跨用户目标返回 404。

- [ ] **Step 1: 写失败测试。** 建立用户 A/B 与管理员各一条会话，创建两组任务、图片和设备；对列表/详情/取消、签名下载/删除、设备列表/远程操作及 SSE 用 B 凭据访问 A 资源，断言不可枚举的拒绝且无事件泄漏。用 A 的 token 却带 B 的会话也应拒绝；过期与撤销 token、伪造 Last-Event-ID、重连时只回放本任务真实事件 ID。桌面测试覆盖 fetch 携带会话、重连和跨 chunk SSE 解析。
- [ ] **Step 2: 运行红灯。** `PYTHONPATH=backend pytest -q tests/api/test_tenant_isolation.py tests/api/test_sse_authorization.py` 及 `npm test -- --run src/services/sseService.test.ts`；预期 SSE 用户未绑定或 EventBus ID 缺失测试失败。
- [ ] **Step 3: 实现隔离缺口。** SSE 除 token 外验证当前会话与 `AITask.user_id`，token hash 比较用常时比较；会话撤销使流授权失效，带授权的重连/刷新不延长原任务的权限时限；`read_after/listen` 返回 XREAD 的 Redis ID 而非 payload 内随机 UUID，校验事件所属任务，非法 ID 返回 400。桌面改用携带安全会话头的 fetch SSE 读取器，按 `\n\n` 边界组帧并保留既有事件回调；服务端先兼容旧 EventSource 短时令牌，再在桌面更新覆盖率确认后的版本窗口关闭无会话入口，严格隔离验收必须在旧入口关闭之后进行。核对设备远程/socket 的 session 和归属，按测试修复；入口访问日志不得记录 token 查询参数。token 不出现在 URL 的最终迁移列入 C。
- [ ] **Step 4: 运行绿灯及回归。** Step 2 命令、`PYTHONPATH=backend pytest -q tests/api tests/e2e/test_screenshot_to_answer.py` 全绿；人工确认管理员只能通过管理接口、而非冒用普通用户 SSE token 查看业务数据。
- [ ] **Step 5: 独立提交。** 仅暂存上列文件和测试（含 `src/services/sseService.ts`），`git commit -m "test: enforce tenant boundaries for task events and files"`。

## Task 5: 部署参数、观测和真实负载验收

**Files:**
- Modify: `backend/app/config.py`, `backend/app/workers/celery_app.py`, `scripts/start-aivora.sh`, `docker-compose.yml`, `backend/app/modules/admin/router.py`
- Create: `tests/e2e/test_multiuser_dispatch.py`, `tests/e2e/test_worker_faults.py`, `docs/operations/aivora-task-queue.md`

**Interfaces:**
- Consumes: Task 2 租约与 Task 3/4 终态及归属。
- Produces: 配置项 `task_global_slots=4`, `task_user_slots=2`；内部队列指标（排队/运行数、队列等待、失败分类、租约超时）且不带截图/密钥/原文。

- [ ] **Step 1: 写失败验收。** 用 mock OpenAI 服务控制并发屏障：10 用户同时提交，全部成功（现有 API 默认 200，不强改为 201），前 4 个运行用户互异；单用户第三个排队，一个用户持续限流时其他用户完成。注入 Worker 退出、Redis 短时不可达与取消；按用户核对事件及结果不串号。
- [ ] **Step 2: 运行红灯。** `PYTHONPATH=backend pytest -q tests/e2e/test_multiuser_dispatch.py tests/e2e/test_worker_faults.py`；预期部署槽位/故障场景失败。
- [ ] **Step 3: 调整部署和指标。** Compose 和本地启动脚本以可配置 prefork 并发 4 启动 Worker，单独启动 Beat/调度周期任务；`worker_prefetch_multiplier=1`，硬/软超时与租约恢复窗口一致。管理概览提供排队数、活跃租约数和错误分类；结构化日志只含 task ID、匿名用户 ID、阶段、等待/首字段/总耗时、错误码与配置版本，不写图片、模型响应、token、密钥或 URL query。运行手册写启动、压测、看板、Beat/Worker 停启、过期租约对账、回滚前清空租约和故障定位的具体命令。
- [ ] **Step 4: 完整验证。** Step 2 命令、`PYTHONPATH=backend pytest -q tests/tasks tests/api tests/e2e`、`docker compose config`、Flyway migrate 通过；查看实际指标并检查日志不含敏感测试标记。用真实进程观察 4 个不同用户并发，记录样本与失败注入结果于运行手册验收记录。
- [ ] **Step 5: 独立提交。** 逐块暂存上列文件并 `git commit -m "ops: validate multiuser dispatch and expose queue health"`。

## 阶段完成条件

- Task 1-5 的测试、迁移与旧客户端回归均有实际输出；规范第 12.3 节第 1、3 项中 A 所属范围有可复现证据。
- 先发布数据库扩展，再部署调度器/Worker，最后关闭旧直接派发；切换期间不能让新旧 Worker 并行执行同一个任务。回滚先停调度，核对租约与在途任务，再恢复旧路径。
- B/C/D/E/F 的未完成项仍按路线图跟踪；尤其 BYOK、字段流、界面设计/实现及管理员截图审计未因 A 通过而视为已交付。
