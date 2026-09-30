# Remote Control Session Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将远程控制升级为单账号单会话、状态可见、命令可追踪并持久化连接历史的完整系统。

**Architecture:** 后端新增远程控制 service，统一负责配对码、会话、命令和单账号并发约束；Socket.IO handler 只做协议适配，数据库保存会话与命令历史。桌面端和 Web 端统一消费 `remote:session_state` 与 `remote:command_status`，通过 `requestId` 跟踪每次操作。

**Tech Stack:** FastAPI, SQLAlchemy Async, PostgreSQL/Flyway, Python Socket.IO, Electron, React, Next.js, Socket.IO client, Vitest, pytest.

**Spec:** `docs/superpowers/specs/2026-09-30-remote-control-session-design.md`

## Global Constraints

- 一个账号同时最多一个 `pending`、`connecting`、`active` 或 `closing` 远程会话。
- 连接码为 8 位，默认有效期 5 分钟，成功配对后立即消费。
- 保持 `/remote` Socket.IO namespace 和现有动作名称兼容。
- 服务端和桌面端都执行远程动作白名单校验。
- 桌面端正式版继续使用 `interview-coder-v1`，开发版继续使用 `interview-coder-v1-dev`。
- 新协议需要兼容旧客户端一段时间，完成新客户端验证后再移除旧事件。
- 所有异步命令必须携带单会话内唯一的 `requestId`。

## Review Focus

- 同账号第二台手机配对时，旧手机和旧桌面会话必须收到 `replaced`，不能继续发送命令。
- 手机 Socket 断开后，服务端不能继续向失效 Socket 转发结果。
- 桌面端执行失败、超时和未知动作必须回传明确状态，不能让手机端停留在“执行中”。
- 服务端重启后，数据库中的旧 active 会话不能继续被当作在线会话。
- 开发版和正式版同时运行时，设备 ID、Socket 映射和会话不能互相覆盖。

---

### Task 1: 数据库迁移和远程领域模型

**Files:**
- Create: `services/backend/db/migrations/V019__remote_control_sessions.sql`
- Create: `services/backend/db/migrations/V020__remote_control_commands.sql`
- Modify: `services/backend/app/modules/devices/models.py`
- Test: `services/backend/tests/modules/test_remote_models.py`

**Interfaces:**
- Produces `RemoteSession`、`RemoteCommand` SQLAlchemy models。
- `RemoteSession.status` 支持 `pending`、`connecting`、`active`、`closing`、`closed`、`expired`、`replaced`。
- `RemoteCommand.status` 支持 `created`、`accepted`、`running`、`success`、`failed`、`timeout`、`rejected`、`cancelled`。

- [ ] **Step 1: Write failing model and migration tests**

验证新表字段、枚举值、外键和同账号活跃会话唯一约束。

- [ ] **Step 2: Run backend tests and verify they fail**

Run: `conda run -n aivora-backend pytest services/backend/tests/modules/test_remote_models.py -v`

- [ ] **Step 3: Add Flyway migrations and SQLAlchemy models**

为 `remote_sessions` 增加 session lifecycle、连接时间、断开原因和时长字段；新增 `remote_commands`，并建立 `request_id` 的会话内唯一约束。

- [ ] **Step 4: Run model tests and migration validation**

Run: `conda run -n aivora-backend pytest services/backend/tests/modules/test_remote_models.py -v`

- [ ] **Step 5: Commit**

```bash
git add services/backend/db/migrations services/backend/app/modules/devices/models.py services/backend/tests/modules/test_remote_models.py
git commit -m "feat: add remote session and command models"
```

### Task 2: Remote session service

**Files:**
- Create: `services/backend/app/modules/devices/service.py`
- Modify: `services/backend/app/modules/devices/router.py`
- Test: `services/backend/tests/modules/test_remote_service.py`

**Interfaces:**
- `create_pairing(user_id, device_id) -> PairingResult`
- `consume_pairing(user_id, code) -> PairingResult`
- `open_session(user_id, device_id, pairing_id) -> RemoteSession`
- `replace_active_session(user_id, reason) -> None`
- `close_session(session_id, reason) -> RemoteSession`
- `record_command(session_id, request_id, action) -> RemoteCommand`
- `update_command(request_id, status, error_code=None, error_message=None) -> RemoteCommand`

- [ ] **Step 1: Write failing service tests**

覆盖连接码撤销、单账号单活跃会话、重复消费、第二手机替换、命令状态流转和非法动作。

- [ ] **Step 2: Run tests and verify failure**

Run: `conda run -n aivora-backend pytest services/backend/tests/modules/test_remote_service.py -v`

- [ ] **Step 3: Implement transactional service methods**

所有会话创建和替换逻辑使用数据库事务；通过行锁或条件更新避免两个手机同时配对产生两个 active 会话。

- [ ] **Step 4: Refactor REST router to use service**

保留设备注册和连接码创建接口；新增撤销连接码、当前会话、关闭会话、会话历史和命令历史接口。

- [ ] **Step 5: Run tests and commit**

```bash
conda run -n aivora-backend pytest services/backend/tests/modules/test_remote_service.py -v
git add services/backend/app/modules/devices/service.py services/backend/app/modules/devices/router.py services/backend/tests/modules/test_remote_service.py
git commit -m "feat: add remote session service"
```

### Task 3: Socket.IO session lifecycle

**Files:**
- Modify: `services/backend/app/infrastructure/socketio.py`
- Test: `services/backend/tests/infrastructure/test_remote_socketio.py`

**Interfaces:**
- `remote:session_state`
- `remote:command`
- `remote:command_status`
- 保留 `remote:desktop_register`、`remote:mobile_register`、`remote:execute`、`remote:result` 作为兼容事件。

- [ ] **Step 1: Write failing Socket.IO tests**

覆盖桌面注册、手机配对、旧会话替换、手机断开清理、桌面断开通知、非桌面端伪造结果和服务端重启后的失效会话。

- [ ] **Step 2: Run tests and verify failure**

Run: `conda run -n aivora-backend pytest services/backend/tests/infrastructure/test_remote_socketio.py -v`

- [ ] **Step 3: Add typed Socket context and session mappings**

上下文必须包含 `user_id`、`kind`、`device_id`、`session_id`；手机和桌面 Socket 分别登记。

- [ ] **Step 4: Implement session events**

配对成功后同时向两端发送 `remote:session_state`；替换、关闭、过期和断线都发送带原因的状态事件。

- [ ] **Step 5: Implement command forwarding and authorization**

手机端发送 `remote:command` 后创建命令记录并返回 accepted；仅允许对应 active session 的手机发送命令，仅允许桌面端回传 command status。

- [ ] **Step 6: Run tests and commit**

```bash
conda run -n aivora-backend pytest services/backend/tests/infrastructure/test_remote_socketio.py -v
git add services/backend/app/infrastructure/socketio.py services/backend/tests/infrastructure/test_remote_socketio.py
git commit -m "feat: enforce remote session lifecycle"
```

### Task 4: Desktop remote client state and acknowledgements

**Files:**
- Modify: `apps/desktop/electron/RemoteControlClient.ts`
- Modify: `apps/desktop/electron/preload.ts`
- Modify: `apps/desktop/src/types/electron.ts`
- Test: `apps/desktop/electron/RemoteControlClient.test.ts`

**Interfaces:**
- Desktop event state includes `status`, `sessionId`, `connectedAt`, `device`, `reason`, `code`, `expiresAt`, `remoteUrl`, `error`.
- Desktop command status includes `requestId`, `action`, `status`, `errorCode`, `errorMessage`, `durationMs`.

- [ ] **Step 1: Write failing client tests**

验证配对成功清除等待状态、被替换清理状态、未知动作 rejected、执行中返回 running、成功/失败/超时回执和耗时动作并发限制。

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test -- RemoteControlClient.test.ts`

- [ ] **Step 3: Replace paired/pairing flags with a session state**

集中维护会话状态，兼容旧 UI 所需的 `code`、`expiresAt` 和 `remoteUrl` 字段。

- [ ] **Step 4: Implement new command event handling**

桌面端收到 `remote:execute` 后校验 action，先发送 running，再执行 `shortcutsHelper.executeAction`，最后发送 success/failed/timeout。

- [ ] **Step 5: Update preload types and run tests**

Run: `npm test -- RemoteControlClient.test.ts && npm run typecheck`

- [ ] **Step 6: Commit**

```bash
git add apps/desktop/electron/RemoteControlClient.ts apps/desktop/electron/preload.ts apps/desktop/src/types/electron.ts apps/desktop/electron/RemoteControlClient.test.ts
git commit -m "feat: add desktop remote session state"
```

### Task 5: Desktop UI connection experience

**Files:**
- Modify: `apps/desktop/src/_pages/ConfigPage.tsx`
- Modify: `apps/desktop/src/components/Settings/SettingsDialog.tsx`
- Modify: `apps/desktop/src/components/RemotePairingPanel.tsx`
- Test: existing ConfigPage and SettingsDialog tests

**Interfaces:**
- All three UI surfaces consume the same `remoteControl.onState` contract。
- Waiting state shows code and countdown; connected state shows device, start time and duration; replaced/closed/error states show explicit feedback。

- [ ] **Step 1: Add failing UI tests**

验证 connected 状态隐藏倒计时、显示连接时间；replaced 和 closed 显示对应提示；disconnect 清除本地状态。

- [ ] **Step 2: Implement shared state rendering**

保持现有页面结构，抽出轻量状态映射，避免三个组件继续各自解释 Socket 事件。

- [ ] **Step 3: Run desktop UI tests**

Run: `npm test -- ConfigPage SettingsDialog RemotePairingPanel`

- [ ] **Step 4: Commit**

```bash
git add apps/desktop/src/_pages/ConfigPage.tsx apps/desktop/src/components/Settings/SettingsDialog.tsx apps/desktop/src/components/RemotePairingPanel.tsx
git commit -m "fix: show remote connection state on desktop"
```

### Task 6: Web remote command flow

**Files:**
- Modify: `apps/web/app/remote/page.tsx`
- Modify: `apps/web/app/globals.css`
- Test: `apps/web/app/remote/page.test.tsx`

**Interfaces:**
- Web sends `remote:command` with `requestId` and `action`.
- Web consumes `remote:session_state` and `remote:command_status`.
- Each command row owns its own status and error state.

- [ ] **Step 1: Write failing Web tests**

覆盖连接成功、连接替换、主动断开、按钮 loading、success、failed、timeout 和快速重复点击。

- [ ] **Step 2: Run tests and verify failure**

Run: `npm test --prefix apps/web -- app/remote/page.test.tsx`

- [ ] **Step 3: Implement session-aware remote page**

拆分连接状态、当前会话、操作分组和最近操作；保留现有 action labels。

- [ ] **Step 4: Implement requestId command tracking**

按钮发送后进入 executing，按对应 requestId 接收 accepted/running/success/failed，不能被其他操作覆盖。

- [ ] **Step 5: Run Web tests and commit**

```bash
npm test --prefix apps/web -- app/remote/page.test.tsx
git add apps/web/app/remote/page.tsx apps/web/app/globals.css apps/web/app/remote/page.test.tsx
git commit -m "feat: show remote command execution status"
```

### Task 7: Management history views

**Files:**
- Modify: `apps/web/app/remote/page.tsx`
- Create: `apps/web/components/remote/RemoteSessionSummary.tsx`
- Create: `apps/web/components/remote/RemoteHistory.tsx`
- Test: `apps/web/components/remote/remote-history.test.tsx`

**Interfaces:**
- Consumes `/api/remote/session/current`、`/api/remote/sessions` 和 `/api/remote/commands`。
- Displays current device, connection start time, current duration, recent sessions and recent command outcomes.

- [ ] **Step 1: Write failing component tests**

验证空状态、active 会话、历史分页、断开原因和命令错误显示。

- [ ] **Step 2: Add history API client methods**

统一处理认证、错误信息和分页参数。

- [ ] **Step 3: Implement summary and history components**

使用现有 Web 端样式和卡片布局，避免把操作结果压缩成单一全局 message。

- [ ] **Step 4: Run tests and commit**

```bash
npm test --prefix apps/web -- components/remote/remote-history.test.tsx
git add apps/web/app/remote/page.tsx apps/web/components/remote apps/web/lib/api-client.ts
git commit -m "feat: add remote session history"
```

### Task 8: End-to-end verification and compatibility cleanup

**Files:**
- Modify: `services/backend/app/modules/devices/router.py`
- Modify: `apps/web/app/remote/page.tsx`
- Create or modify: `services/backend/tests/integration/test_remote_flow.py`
- Create or modify: `apps/web/e2e/remote.spec.ts`
- Create or modify: `apps/desktop/electron/RemoteControlClient.test.ts`

- [ ] **Step 1: Add end-to-end scenarios**

验证正常配对、第二手机替换、断线、服务端重启、命令执行失败、开发版/正式版同时运行。

- [ ] **Step 2: Run backend and frontend suites**

```bash
conda run -n aivora-backend pytest -q
npm test --prefix apps/desktop
npm test --prefix apps/web
```

- [ ] **Step 3: Run typecheck and builds**

```bash
npm run typecheck --prefix apps/desktop
npm run build --prefix apps/desktop
npm run typecheck --prefix apps/web
```

- [ ] **Step 4: Remove or deprecate old protocol paths only after compatibility passes**

保留旧事件兼容窗口；确认新客户端和服务端均已部署后，再删除未使用的 REST pairing verify 和旧 UI fallback。

- [ ] **Step 5: Commit**

```bash
git add services/backend apps/desktop apps/web
git commit -m "test: verify remote control session flow"
```
