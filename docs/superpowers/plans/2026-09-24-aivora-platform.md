# Aivora Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个由 FastAPI、Celery Worker、Next.js Web、PostgreSQL、Redis 和 MinIO 组成的 Aivora 私有 AI 任务平台，并兼容 Electron 客户端的新版本 SSE 流程和手机远程控制。

**Architecture:** 后端采用模块化单体 API，API 只处理认证、配置、任务提交、SSE 和管理请求，耗时模型调用由 Celery Worker 执行。Web 工程同时提供用户门户、单管理员后台和远程控制页面；PostgreSQL 保存结构化数据，Redis 保存任务队列和事件流，MinIO 保存截图及导出文件。

**Tech Stack:** Python 3.12+, FastAPI, Pydantic, SQLAlchemy Async, Flyway, PostgreSQL, Redis, Celery, MinIO, Next.js App Router, React, TypeScript, Tailwind CSS, shadcn/ui, TanStack Query, Docker Compose, Socket.IO.

**Spec:** `docs/superpowers/specs/2026-09-24-aivora-platform-design.md`

## Global Constraints

- 使用新版 SSE AI 流程，不实现旧版 AI 轮询协议。
- Flyway 是数据库结构的唯一迁移工具；SQLAlchemy 不生成迁移。
- MinIO 是截图、答案附件和导出文件的唯一文件存储，不使用应用本地目录兜底。
- 只有 `user` 和 `admin` 两种角色。
- 不实现积分、配额、充值、支付、账单、邀请和返利模块。
- API 不直接执行耗时模型调用，AI 调用由 Celery Worker 执行。
- 桌面端 SSE 使用短时 `stream_token` 解决原生 EventSource 无法稳定携带自定义请求头的问题。
- 远程控制只能执行白名单命令，不能把任意 IPC 名称暴露给手机端。
- 所有 Git 提交使用“常见英文分类前缀 + 中文说明”。
- 服务启动和停止使用项目固定的 `screen` 会话 `aivora-dev`，不得操作其他项目服务。

## Review Focus

- 重复提交同一个 `client_request_id` 时只能创建一个 AI 任务；归入任务 API 的幂等性验证。
- SSE 连接断开并使用 `Last-Event-ID` 重连时，必须继续返回缺失事件或明确返回最终任务快照；归入 SSE 任务。
- MinIO 对象不存在、过期或无权访问时，API 必须返回结构化错误而不泄露 Bucket 信息；归入文件服务。
- 管理员停用用户后，该用户现有 Session、SSE Token 和远程设备会话必须失效；归入身份和管理服务。
- Worker 在模型调用超时、异常或重复投递时，任务必须进入可解释的失败状态，不能无限重试；归入 AI Worker。

---

### Task 1: 创建后端与 Web 工作区骨架

**Files:**
- Create: `backend/pyproject.toml`
- Create: `backend/app/main.py`
- Create: `backend/app/config.py`
- Create: `backend/app/dependencies.py`
- Create: `backend/app/modules/__init__.py`
- Create: `backend/app/infrastructure/__init__.py`
- Create: `backend/app/workers/__init__.py`
- Create: `web/package.json`
- Create: `web/tsconfig.json`
- Create: `web/next.config.ts`
- Create: `web/app/layout.tsx`
- Create: `web/app/page.tsx`
- Create: `docker-compose.yml`
- Create: `.env.example`
- Modify: `AGENT.md`

**Interfaces:**
- Produces `app.create_app()`, `app.settings`, `web` Next.js 启动入口，以及统一环境变量名称。

- [ ] **Step 1: 创建 Python 包和 FastAPI 健康入口**

  `backend/app/main.py` 暴露 `GET /health`，返回：

  ```json
  {"status": "ok", "service": "aivora-api"}
  ```

- [ ] **Step 2: 创建统一配置对象**

  `backend/app/config.py` 定义数据库、Redis、MinIO、会话、模型和 CORS 配置；所有密钥从环境变量读取，不在代码中提供生产默认值。

- [ ] **Step 3: 创建 Next.js 空页面**

  `web/app/page.tsx` 显示 Aivora Web 基础页面，并保留用户端、管理员端和远程端路由分组的目录结构。

- [ ] **Step 4: 创建 Docker Compose 基础服务**

  Compose 至少声明 `postgres`、`redis`、`minio`、`api`、`worker` 和 `web`，MinIO 使用命名卷 `minio_data`，PostgreSQL 使用命名卷 `postgres_data`。

- [ ] **Step 5: 更新 AGENT.md**

  增加后端、Web、Docker Compose、Flyway 和 MinIO 的开发命令与目录说明，并记录当前分支仍为 `main`。

- [ ] **Step 6: 验证骨架**

  运行：

  ```bash
  docker compose config
  python -m compileall backend/app
  ```

- [ ] **Step 7: 提交**

  ```bash
  git add backend web docker-compose.yml .env.example AGENT.md
  git commit -m "feat: 创建Aivora全栈项目骨架"
  ```

### Task 2: 建立 Flyway 和 PostgreSQL 数据结构

**Files:**
- Create: `backend/db/migrations/V001__create_users.sql`
- Create: `backend/db/migrations/V002__create_sessions.sql`
- Create: `backend/db/migrations/V003__create_user_configs.sql`
- Create: `backend/db/migrations/V004__create_ai_catalog.sql`
- Create: `backend/db/migrations/V005__create_ai_tasks.sql`
- Create: `backend/db/migrations/V006__create_task_events.sql`
- Create: `backend/db/migrations/V007__create_answers.sql`
- Create: `backend/db/migrations/V008__create_storage_and_devices.sql`
- Create: `backend/db/migrations/V009__create_admin_audit_logs.sql`
- Create: `backend/db/migrations/R__seed_default_models.sql`
- Create: `backend/app/infrastructure/database.py`
- Create: `backend/app/infrastructure/models.py`
- Modify: `docker-compose.yml`

**Interfaces:**
- Produces async SQLAlchemy engine/session factory and database tables matching the Flyway schema.
- `get_db_session() -> AsyncIterator[AsyncSession]` is the only API dependency for database sessions.

- [ ] **Step 1: 写用户和会话迁移**

  `users` 使用 UUID 主键、唯一邮箱、密码哈希、角色、启用状态和时间字段；`sessions` 保存 token 哈希、设备类型、过期时间、撤销时间和最后活跃时间。

- [ ] **Step 2: 写配置和模型迁移**

  建立 `user_configs`、`ai_providers`、`ai_models` 和 `prompt_templates`，密钥字段使用加密后的文本值，模型表包含题型、视觉能力、启用状态和排序。

- [ ] **Step 3: 写任务、事件和答案迁移**

  `ai_tasks` 保存状态、模式、幂等键、进度、阶段、错误和时间字段；`task_events` 保存事件 ID、序号、事件类型和 JSON 数据；`answers` 保存最终结构化结果。

- [ ] **Step 4: 写文件、设备和审计迁移**

  创建 `stored_files`、`desktop_devices`、`pairing_codes`、`remote_sessions`、`admin_audit_logs` 和 `client_releases`。

- [ ] **Step 5: 写可重复默认模型迁移**

  `R__seed_default_models.sql` 插入编程题、选择题和通用题默认模型，使用唯一键避免重复插入。

- [ ] **Step 6: 创建 SQLAlchemy 映射**

  `backend/app/infrastructure/models.py` 只定义表映射和关系，不包含迁移逻辑。

- [ ] **Step 7: 添加 Flyway Compose 服务**

  Flyway 使用 PostgreSQL JDBC URL，依赖 `postgres` 健康检查，执行 `validate` 和 `migrate`。

- [ ] **Step 8: 验证迁移**

  运行：

  ```bash
  docker compose up -d postgres
  docker compose run --rm flyway migrate
  docker compose run --rm flyway validate
  ```

- [ ] **Step 9: 提交**

  ```bash
  git add backend/db backend/app/infrastructure docker-compose.yml
  git commit -m "feat: 新增PostgreSQL和Flyway数据结构"
  ```

### Task 3: 实现用户认证、Session 和管理员权限

**Files:**
- Create: `backend/app/modules/identity/schemas.py`
- Create: `backend/app/modules/identity/repository.py`
- Create: `backend/app/modules/identity/service.py`
- Create: `backend/app/modules/identity/dependencies.py`
- Create: `backend/app/modules/identity/router.py`
- Create: `backend/app/modules/identity/passwords.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`
- `GET /api/session_status`
- `GET /api/auth/sessions`
- `DELETE /api/auth/sessions/{session_id}`
- `get_current_user(request) -> User`
- `require_admin(user) -> User`

- [ ] **Step 1: 定义认证 Schema**

  注册接受邮箱、密码和可选用户名；登录接受邮箱和密码；响应只返回用户公开信息和 session 信息，绝不返回密码哈希或模型密钥。

- [ ] **Step 2: 实现密码哈希**

  使用 Argon2id 封装 `hash_password()` 和 `verify_password()`。

- [ ] **Step 3: 实现 Session 服务**

  生成高熵随机 Token，数据库只保存 SHA-256 哈希；实现创建、解析、撤销和过期清理。

- [ ] **Step 4: 实现注册、登录和登出**

  登录成功返回 `sessionId`，兼容 Electron 当前协议；重复邮箱返回稳定错误码 `EMAIL_ALREADY_EXISTS`。

- [ ] **Step 5: 实现管理员依赖**

  `require_admin()` 只接受 `role == "admin"` 且 `is_active == true` 的用户。

- [ ] **Step 6: 注册路由并配置 CORS**

  Web 使用 Cookie 会话，Desktop 使用 `X-Session-Id`；不要允许任意 Origin。

- [ ] **Step 7: 验证认证接口**

  使用 `curl` 验证注册、登录、session_status、登出、重复邮箱和无效 Token 场景。

- [ ] **Step 8: 提交**

  ```bash
  git add backend/app/modules/identity backend/app/main.py
  git commit -m "feat: 新增用户认证和管理员权限"
  ```

### Task 4: 实现用户配置、模型目录和管理员配置接口

**Files:**
- Create: `backend/app/modules/settings/schemas.py`
- Create: `backend/app/modules/settings/service.py`
- Create: `backend/app/modules/settings/router.py`
- Create: `backend/app/modules/models/schemas.py`
- Create: `backend/app/modules/models/service.py`
- Create: `backend/app/modules/models/router.py`
- Create: `backend/app/modules/admin/router.py`

**Interfaces:**
- `GET /api/config`
- `PUT /api/config`
- `POST /api/config/shortcuts`
- `GET /api/ai/models`
- `GET /api/admin/models`
- `POST /api/admin/models`
- `PATCH /api/admin/models/{model_id}`
- `GET /api/admin/system`

- [ ] **Step 1: 定义默认用户配置**

  默认配置覆盖编程模型、选择题模型、通用模型、语言、主题、快捷键、窗口和处理选项。

- [ ] **Step 2: 实现配置读写**

  用户只能读取和修改自己的配置；响应不能返回供应商密钥。

- [ ] **Step 3: 实现模型目录**

  用户端只返回启用模型和公开字段；管理员端支持新增、修改、停用、排序和题型绑定。

- [ ] **Step 4: 实现管理配置**

  管理员可以读取系统配置和客户端版本配置，所有写操作写入审计日志。

- [ ] **Step 5: 验证配置隔离**

  使用两个用户验证不能读取彼此配置；使用普通用户访问管理接口应返回 403。

- [ ] **Step 6: 提交**

  ```bash
  git add backend/app/modules/settings backend/app/modules/models backend/app/modules/admin
  git commit -m "feat: 新增用户配置和模型管理"
  ```

### Task 5: 实现 MinIO 文件服务

**Files:**
- Create: `backend/app/infrastructure/storage.py`
- Create: `backend/app/modules/files/schemas.py`
- Create: `backend/app/modules/files/service.py`
- Create: `backend/app/modules/files/router.py`
- Modify: `backend/app/config.py`

**Interfaces:**
- `StorageProvider.put_bytes(key, data, content_type) -> StoredObject`
- `StorageProvider.delete(key) -> None`
- `StorageProvider.presigned_get(key, expires) -> str`
- `POST /api/files/upload`
- `GET /api/files/{file_id}/download-url`
- `DELETE /api/files/{file_id}`

- [ ] **Step 1: 实现 MinIO 客户端**

  连接信息只从环境变量读取；启动时检查 Bucket，不存在则创建私有 Bucket。

- [ ] **Step 2: 实现对象元数据服务**

  文件元数据写入 `stored_files`，对象 Key 必须包含用户 ID，避免跨用户路径混淆。

- [ ] **Step 3: 实现上传和预签名下载**

  校验 MIME 类型、大小和所属资源；下载 URL 只允许访问当前用户或管理员有权访问的文件。

- [ ] **Step 4: 实现删除和过期清理**

  删除数据库记录和对象；提供 Worker 清理过期临时对象的任务。

- [ ] **Step 5: 验证文件权限**

  验证上传、下载 URL、删除、错误 Key、不存在对象和跨用户访问。

- [ ] **Step 6: 提交**

  ```bash
  git add backend/app/infrastructure/storage.py backend/app/modules/files backend/app/config.py
  git commit -m "feat: 新增MinIO文件存储服务"
  ```

### Task 6: 实现 AI Provider 适配器和 Celery Worker

**Files:**
- Create: `backend/app/providers/base.py`
- Create: `backend/app/providers/openai_compatible.py`
- Create: `backend/app/modules/tasks/schemas.py`
- Create: `backend/app/modules/tasks/repository.py`
- Create: `backend/app/modules/tasks/service.py`
- Create: `backend/app/workers/celery_app.py`
- Create: `backend/app/workers/ai_tasks.py`
- Modify: `backend/app/config.py`

**Interfaces:**
- `AIProvider.analyze_images(images, mode, model, prompt) -> AsyncIterator[ProviderChunk]`
- `TaskService.create_task(user_id, request) -> TaskCreated`
- `run_ai_task(task_id) -> None`

- [ ] **Step 1: 定义 Provider 接口**

  Provider 接口只暴露题目模式、模型、图片和提示词，不让任务模块依赖具体供应商 SDK。

- [ ] **Step 2: 实现 OpenAI 兼容 Provider**

  支持视觉输入和流式输出；API Key、Base URL、超时和模型名称从服务端配置读取。

- [ ] **Step 3: 实现任务创建**

  校验图片数量、模式和幂等键；写入 `ai_tasks`，状态初始为 `queued`，再发送 Celery 任务。

- [ ] **Step 4: 实现 Worker 生命周期**

  Worker 状态依次更新为 `processing`、`streaming`、`completed` 或 `failed`；每次状态变化写入事件流。

- [ ] **Step 5: 实现模型异常策略**

  模型超时和临时网络错误最多重试两次；参数错误、认证错误和内容校验错误直接失败；禁止无限重试。

- [ ] **Step 6: 实现结果解析**

  保存原始输出和结构化字段；无法解析时保留原始输出并标记 `parse_warning`，不能丢失最终内容。

- [ ] **Step 7: 验证 Worker**

  使用可替换的 Fake Provider 验证成功、超时、供应商错误、重复投递和最终失败状态。

- [ ] **Step 8: 提交**

  ```bash
  git add backend/app/providers backend/app/modules/tasks backend/app/workers
  git commit -m "feat: 新增AI任务和Worker处理链路"
  ```

### Task 7: 实现 Redis Streams 和新版 SSE

**Files:**
- Create: `backend/app/infrastructure/events.py`
- Create: `backend/app/modules/tasks/sse.py`
- Modify: `backend/app/modules/tasks/router.py`
- Modify: `backend/app/main.py`

**Interfaces:**
- `EventBus.append(task_id, event) -> str`
- `EventBus.read_after(task_id, event_id) -> list[TaskEvent]`
- `POST /api/ai/process-screenshot`
- `GET /api/ai/stream/{task_id}?token={stream_token}`
- `GET /api/ai/tasks/{task_id}`
- `DELETE /api/ai/tasks/{task_id}`

- [ ] **Step 1: 实现 Redis Streams 事件总线**

  每个任务使用独立 Stream Key，事件包含递增 ID、类型、阶段、进度和 JSON 数据。

- [ ] **Step 2: 实现 Stream Token**

  创建任务时生成只绑定任务和用户的短时 Token；Token 哈希保存到数据库，不保存明文。

- [ ] **Step 3: 实现 SSE 连接**

  首条消息发送 `connected`；随后读取事件并转换为标准 SSE 帧，设置心跳和断开清理。

- [ ] **Step 4: 实现 Last-Event-ID 恢复**

  从指定事件 ID 之后继续读取；任务结束且事件已过期时返回任务快照。

- [ ] **Step 5: 实现取消任务**

  只允许任务所属用户或管理员取消；取消后 Worker 不得继续写入 `completed`。

- [ ] **Step 6: 验证 SSE**

  验证正常流、断线恢复、错误事件、取消任务、无效 Stream Token、跨用户访问和重复提交。

- [ ] **Step 7: 提交**

  ```bash
  git add backend/app/infrastructure/events.py backend/app/modules/tasks
  git commit -m "feat: 新增AI任务SSE事件流"
  ```

### Task 8: 创建 Web 用户端基础、认证和任务页面

**Files:**
- Create: `web/app/(public)/login/page.tsx`
- Create: `web/app/(public)/register/page.tsx`
- Create: `web/app/(public)/forgot-password/page.tsx`
- Create: `web/app/(user)/layout.tsx`
- Create: `web/app/(user)/dashboard/page.tsx`
- Create: `web/app/(user)/dashboard/tasks/page.tsx`
- Create: `web/app/(user)/dashboard/history/page.tsx`
- Create: `web/lib/api-client.ts`
- Create: `web/lib/auth.ts`
- Create: `web/lib/schemas.ts`
- Create: `web/components/task/task-status.tsx`
- Modify: `web/app/layout.tsx`

**Interfaces:**
- 使用 API 的 `/api/auth/*`、`/api/config`、`/api/ai/*` 和 `/api/files/*`。
- 用户端不会直接访问 MinIO 管理接口。

- [ ] **Step 1: 建立 Web API Client**

  统一处理 JSON 错误、Cookie、401 跳转和请求 ID。

- [ ] **Step 2: 创建登录、注册和找回密码页面**

  表单通过 Zod 校验；错误展示稳定错误消息；成功后进入用户 Dashboard。

- [ ] **Step 3: 创建用户布局和导航**

  导航包含概览、AI 任务、历史记录、模型设置、账户设置、设备和远程控制。

- [ ] **Step 4: 创建任务列表和详情**

  支持状态、模式、时间筛选；详情展示 SSE 最终结果、原始输出和关联文件。

- [ ] **Step 5: 创建用户模型配置页面**

  加载 `/api/config` 和 `/api/ai/models`，保存后显示最新配置。

- [ ] **Step 6: 验证 Web 用户流程**

  使用 Playwright 验证注册、登录、任务列表、详情和登出。

- [ ] **Step 7: 提交**

  ```bash
  git add web
  git commit -m "feat: 新增Aivora用户Web门户"
  ```

### Task 9: 创建单管理员后台

**Files:**
- Create: `web/app/(admin)/admin/layout.tsx`
- Create: `web/app/(admin)/admin/page.tsx`
- Create: `web/app/(admin)/admin/users/page.tsx`
- Create: `web/app/(admin)/admin/users/[id]/page.tsx`
- Create: `web/app/(admin)/admin/tasks/page.tsx`
- Create: `web/app/(admin)/admin/tasks/[id]/page.tsx`
- Create: `web/app/(admin)/admin/models/page.tsx`
- Create: `web/app/(admin)/admin/prompts/page.tsx`
- Create: `web/app/(admin)/admin/system/page.tsx`
- Create: `web/app/(admin)/admin/audit-logs/page.tsx`
- Create: `web/components/admin/data-table.tsx`
- Create: `web/components/admin/status-card.tsx`
- Modify: `web/lib/auth.ts`

**Interfaces:**
- 使用 `/api/admin/*`，所有请求携带管理员会话。

- [ ] **Step 1: 实现管理员路由保护**

  非管理员进入 `/admin` 时跳转到用户端或 403 页面。

- [ ] **Step 2: 创建 Dashboard**

  展示用户数量、运行中任务、失败任务、Worker 和 MinIO 健康状态。

- [ ] **Step 3: 创建用户管理**

  支持搜索、分页、查看详情、停用/启用用户和撤销用户会话。

- [ ] **Step 4: 创建任务排查页面**

  展示任务阶段、耗时、事件、模型错误和最终结果，不默认展示完整 base64。

- [ ] **Step 5: 创建模型和提示词管理**

  支持启用、停用、排序、默认模型和提示词版本。

- [ ] **Step 6: 创建审计日志页面**

  支持按管理员、动作、资源和时间筛选。

- [ ] **Step 7: 验证管理员隔离**

  使用普通用户和管理员分别访问页面与 API，确认权限行为一致。

- [ ] **Step 8: 提交**

  ```bash
  git add web/app/'(admin)' web/components/admin web/lib/auth.ts
  git commit -m "feat: 新增单管理员后台"
  ```

### Task 10: 实现桌面端兼容和 Electron 配置切换

**Files:**
- Modify: `config.json`
- Modify: `src/services/sseService.ts`
- Modify: `src/services/aiService.ts`
- Modify: `electron/SimpleAuthManager.ts`
- Modify: `electron/RemoteControlClient.ts`
- Modify: `electron/ipcHandlers.ts`
- Modify: `electron/preload.ts`

**Interfaces:**
- Desktop 兼容 `/api/login`、`/api/session_status`、`/api/config`、`/api/ai/process-screenshot` 和 `/api/ai/stream/{task_id}`。
- `config.json` 中的 API、Web 和 Remote Base URL 必须可配置。

- [ ] **Step 1: 删除 Electron 中写死的旧域名**

  将积分、模型列表、远程配对和 Web URL 的硬编码统一改为配置读取；不恢复旧版积分功能，只清理地址耦合。

- [ ] **Step 2: 适配 Stream Token**

  `processScreenshotSSE()` 保存服务端返回的 `stream_token`，`connectToStream()` 将其拼入 SSE URL。

- [ ] **Step 3: 保持现有结果格式**

  服务端 `completed.result` 映射到现有 `AIProcessResult`，不改动桌面端结果展示协议。

- [ ] **Step 4: 适配登录和配置响应**

  保持 `sessionId`、`user`、`version` 和用户配置字段兼容。

- [ ] **Step 5: 验证桌面端**

  使用本地 API 地址启动 Electron，验证登录、提交截图、SSE 完成、断线重连和配置刷新。

- [ ] **Step 6: 提交**

  ```bash
  git add config.json src/services electron/SimpleAuthManager.ts electron/RemoteControlClient.ts electron/ipcHandlers.ts electron/preload.ts
  git commit -m "feat: 适配自建后端SSE和配置地址"
  ```

### Task 11: 实现手机远程配置和桌面端控制

**Files:**
- Create: `backend/app/modules/devices/schemas.py`
- Create: `backend/app/modules/devices/service.py`
- Create: `backend/app/modules/devices/router.py`
- Create: `backend/app/modules/remote/socket.py`
- Create: `web/app/remote/page.tsx`
- Create: `web/components/remote/pairing-form.tsx`
- Create: `web/components/remote/action-grid.tsx`
- Modify: `electron/RemoteControlClient.ts`
- Modify: `electron/ipcHandlers.ts`

**Interfaces:**
- `POST /api/remote/pairing/create`
- `POST /api/remote/pairing/verify`
- `POST /api/remote/pairing/revoke`
- `GET /api/remote/devices`
- Socket.IO namespace `/remote`

- [ ] **Step 1: 实现设备注册和心跳**

  桌面端登录后注册设备，定时发送心跳；服务端记录最后活跃时间。

- [ ] **Step 2: 实现短时 8 位连接码**

  连接码只绑定当前用户和设备，成功使用一次后失效，过期后不可重用。

- [ ] **Step 3: 实现 Socket.IO 会话**

  Socket 会话通过用户 Session 或已验证 pairing token 建立，断开后清理 remote session。

- [ ] **Step 4: 建立远程命令白名单**

  命令枚举覆盖截图、题型处理、重置、窗口、透明度、缩放、原始输出、复制代码、代码移动、删除截图、刷新配置和退出客户端。

- [ ] **Step 5: 创建手机远程页面**

  页面包含连接码输入、连接状态、断开按钮、截图与处理操作、窗口操作和显示工具操作。

- [ ] **Step 6: 验证远程控制**

  验证无效连接码、过期连接码、重复使用、断开、心跳超时、跨用户设备访问和任意命令注入。

- [ ] **Step 7: 提交**

  ```bash
  git add backend/app/modules/devices backend/app/modules/remote web/app/remote web/components/remote electron/RemoteControlClient.ts electron/ipcHandlers.ts
  git commit -m "feat: 新增手机远程配置和桌面控制"
  ```

### Task 12: 完成运维、日志、清理任务和部署文档

**Files:**
- Create: `backend/app/infrastructure/logging.py`
- Create: `backend/app/infrastructure/health.py`
- Create: `backend/app/workers/maintenance_tasks.py`
- Create: `deploy/docker-compose.prod.yml`
- Create: `deploy/Caddyfile`
- Create: `docs/backend-development.md`
- Create: `docs/deployment.md`
- Modify: `docker-compose.yml`
- Modify: `AGENT.md`

**Interfaces:**
- `GET /health`
- `GET /health/ready`
- `GET /health/live`
- 清理过期 Stream、临时 MinIO 对象和过期 Session 的 Worker 任务。

- [ ] **Step 1: 实现结构化日志**

  日志字段包含 request ID、user ID、task ID、provider、耗时和错误码；禁止记录密码、Session Token、模型密钥和图片 base64。

- [ ] **Step 2: 实现健康检查**

  `live` 只检查进程，`ready` 检查 PostgreSQL、Redis 和 MinIO。

- [ ] **Step 3: 实现维护任务**

  定时清理过期 Session、Stream 事件、临时文件和已删除任务的对象。

- [ ] **Step 4: 创建生产 Compose 和反向代理**

  配置 API、Worker、Web、PostgreSQL、Redis、MinIO、迁移和 SSE 代理超时。

- [ ] **Step 5: 编写开发和部署文档**

  文档包含环境变量、Flyway 迁移、MinIO 初始化、启动命令、日志查看、备份和恢复流程。

- [ ] **Step 6: 完成全链路验证**

  按顺序验证：

  ```bash
  docker compose config
  docker compose up -d
  docker compose run --rm flyway validate
  curl http://127.0.0.1:<api-port>/health/ready
  ```

- [ ] **Step 7: 提交**

  ```bash
  git add backend/app/infrastructure backend/app/workers deploy docs/backend-development.md docs/deployment.md docker-compose.yml AGENT.md
  git commit -m "chore: 完善Aivora部署和运维能力"
  ```

## 依赖顺序

```text
Task 1
  ↓
Task 2
  ↓
Task 3 ──► Task 4
  │          │
  └──────► Task 5
             ↓
           Task 6
             ↓
           Task 7
             ├──► Task 8
             ├──► Task 9
             └──► Task 10
                         ↓
                       Task 11
                         ↓
                       Task 12
```

Task 8 和 Task 9 可以在 Task 7 完成后并行开发，但共享 API 契约必须先稳定。Task 10 需要 Task 7 的 SSE 响应格式和 Task 3 的 Session 规则。Task 11 需要桌面端配置地址、设备接口和远程命令白名单都已确定。

## 计划自检

- 设计文档中的新版 SSE、Flyway、MinIO、用户门户、单管理员后台、远程控制、审计和部署均有对应任务。
- 设计文档排除的积分、配额、支付和邀请没有进入任务。
- SQLAlchemy 只负责运行时映射，Flyway 独占迁移职责。
- MinIO 是唯一文件存储，Compose 只为 MinIO 提供持久化卷。
- SSE Token、幂等键、断线恢复、权限隔离、Worker 重试和远程命令白名单均有验证步骤。
- 没有使用未定义的函数名称作为跨任务依赖。
