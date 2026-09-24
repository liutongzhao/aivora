# Aivora 平台架构设计

**日期：** 2026-09-24  
**状态：** 待评审  
**目标分支：** `main`

## 1. 目标与范围

Aivora 由 Electron 桌面客户端、用户 Web 门户、管理后台和 Python 服务端组成。产品面向个人和授权测试使用，重点是稳定完成 AI 图像题目处理、流式返回、远程配置和桌面端控制。

本设计包含：

- 用户注册、登录、会话和个人配置。
- 单管理员后台。
- AI 模型目录、供应商配置和提示词配置。
- 基于新版 SSE 的截图处理流程。
- AI 任务、答案和历史记录。
- MinIO 文件存储。
- 手机 Web 远程配置和桌面端远程控制。
- Flyway 数据库迁移。
- Docker Compose 开发环境和可部署的生产结构。
- 日志、审计、健康检查和基础监控。

本阶段不包含：

- 积分、配额、充值、支付和账单。
- 邀请、返利和增长系统。
- 面向公众的开放注册运营体系。
- 旧版 AI 轮询协议。

技术层面的限流、超时、并发保护仍然保留，用于系统稳定性，不作为计费或配额功能。

## 2. 总体架构

```text
┌─────────────────┐       ┌──────────────────┐
│ Electron Desktop│       │ Next.js Web      │
│ 截图/快捷键/展示 │       │ 用户端/管理后台   │
└────────┬────────┘       └────────┬─────────┘
         │                         │
         └──────────┬──────────────┘
                    ▼
          ┌────────────────────┐
          │ FastAPI API        │
          │ 认证/配置/任务/SSE  │
          └──────┬─────┬───────┘
                 │     │
        ┌────────▼┐  ┌─▼────────┐
        │PostgreSQL│  │ Redis    │
        │业务数据  │  │队列/事件 │
        └─────────┘  └─┬────────┘
                       │
                 ┌─────▼─────┐
                 │ Celery    │
                 │ AI Worker │
                 └─────┬─────┘
                       │
                 ┌─────▼─────┐
                 │模型供应商 │
                 └───────────┘

          ┌────────────────────┐
          │ MinIO              │
          │ 截图/答案附件/导出 │
          └────────────────────┘
```

API 和 Worker 使用同一套 Python 业务模块，但拥有不同的启动入口。API 负责短请求、认证和 SSE，Worker 负责模型调用、重试和任务状态推进。

## 3. 技术选型

### 3.1 后端

- Python 3.12 或更高的稳定版本。
- FastAPI：HTTP API、依赖注入、OpenAPI 和 SSE。
- Pydantic：请求、响应和配置校验。
- SQLAlchemy Async：业务运行时数据库访问。
- Flyway：数据库结构和初始化数据的唯一迁移工具。
- Celery：AI 后台任务、重试、超时和并发控制。
- Redis：Celery Broker、缓存和任务事件中转。
- PostgreSQL：持久化业务数据。
- MinIO Python SDK：对象存储访问。

### 3.2 Web

- Next.js App Router。
- React + TypeScript。
- Tailwind CSS + shadcn/ui。
- TanStack Query：服务端状态和缓存。
- React Hook Form + Zod：表单和输入校验。
- Playwright：关键用户流程测试。

用户门户和管理后台属于同一个 Web 工程，通过路由分组和布局隔离：

```text
app/
├── (public)/
├── (user)/
├── (admin)/
└── remote/
```

### 3.3 基础设施

- Docker Compose：开发环境和单机部署。
- Caddy 或 Nginx：HTTPS、反向代理和 SSE 转发。
- JSON 结构化日志。
- OpenTelemetry：请求和任务链路。
- Prometheus/Grafana：基础运行指标。

## 4. 服务边界

### 4.1 API 服务

职责：

- 用户认证和会话。
- 用户配置。
- 模型和提示词读取。
- 创建 AI 任务。
- SSE 连接和事件恢复。
- 文件元数据和预签名 URL。
- Web 用户端接口。
- 管理员接口。
- 远程配对和控制信令。

API 不直接执行耗时模型调用。

### 4.2 AI Worker

职责：

- 从任务队列取任务。
- 读取 MinIO 中的截图。
- 根据题型选择模型。
- 调用模型供应商。
- 解析和结构化结果。
- 将事件写入 Redis Streams。
- 保存最终答案。
- 清理临时文件。

### 4.3 Web 工程

用户端提供账户、配置、任务、历史记录、设备和远程控制页面。

管理端提供用户、模型、任务、系统状态、客户端版本和审计日志页面。

### 4.4 Electron 客户端

继续负责：

- 系统截图和局部截图。
- 全局快捷键。
- 透明窗口、窗口移动和缩放。
- 本地会话保存。
- SSE 任务展示。
- 桌面端远程 Socket 连接。

## 5. 认证与会话

### 5.1 用户会话

服务端使用随机不可预测的 Session Token，不把认证状态只放在 JWT 中。

Web：

```text
HttpOnly + Secure + SameSite Cookie
```

Desktop：

```http
X-Session-Id: <session_id>
```

Session 表保存：

- 用户 ID。
- Token 哈希。
- 设备类型。
- 设备名称。
- 创建时间。
- 最后活跃时间。
- 过期时间。
- 撤销时间。

### 5.2 SSE 访问授权

当前 Electron 使用浏览器原生 `EventSource`，不能稳定附带自定义 `X-Session-Id` 请求头。因此：

1. `POST /api/ai/process-screenshot` 使用 `X-Session-Id` 鉴权。
2. 服务端返回 `task_id` 和短时 `stream_token`。
3. 客户端用短时 Token 建立 SSE。
4. 服务端验证 Token、任务归属和有效期。

示例：

```text
GET /api/ai/stream/{task_id}?token=<stream_token>
```

Stream Token 只允许访问对应任务，不能转换为普通登录会话。

## 6. AI 任务流程

### 6.1 提交任务

```text
POST /api/ai/process-screenshot
```

请求：

```json
{
  "image": "data:image/png;base64,...",
  "images": [],
  "mode": "programming",
  "language": "python",
  "client_request_id": "optional-idempotency-key"
}
```

`image` 和 `images` 二选一。支持：

```text
programming
debug
single_choice
multiple_choice
universal
```

响应：

```json
{
  "success": true,
  "task_id": "task_01...",
  "stream_token": "stream_01..."
}
```

### 6.2 SSE 事件

```text
GET /api/ai/stream/{task_id}?token=<stream_token>
```

事件统一包含：

```json
{
  "id": "event_01...",
  "type": "progress",
  "task_id": "task_01...",
  "stage": "ai_streaming",
  "progress": 60,
  "data": {
    "partial_content": "..."
  },
  "created_at": "2026-09-24T12:00:00Z"
}
```

事件类型：

```text
connected
progress
content
completed
error
cancelled
```

完成结果统一返回：

```json
{
  "questionType": "programming",
  "content": "...",
  "rawContent": "...",
  "parsed": {
    "code": "...",
    "thoughts": [],
    "timeComplexity": "...",
    "spaceComplexity": "..."
  }
}
```

### 6.3 断线恢复

客户端携带 `Last-Event-ID`。

API 从 Redis Streams 读取对应事件之后的内容。如果事件已经过期，则返回当前任务快照和最终结果。

## 7. 远程配置与桌面端控制

远程控制属于正式产品模块，不作为临时功能处理。现有页面显示的核心流程是：

```text
桌面端生成短时 8 位连接码
        ↓
手机 Web 输入连接码
        ↓
服务端验证当前登录用户和设备
        ↓
手机端显示“桌面端已连接”
        ↓
手机端发送受控操作
```

### 7.1 远程配对

接口：

```text
POST /api/remote/pairing/create
POST /api/remote/pairing/verify
POST /api/remote/pairing/revoke
GET  /api/remote/devices
```

规则：

- 连接码为 8 位。
- 连接码短时有效。
- 连接码只绑定当前登录用户。
- 同一连接码只能成功使用一次。
- 桌面端主动断开后立即失效。
- 长时间无操作自动断开。
- 手机端不能访问其他用户设备。

### 7.2 远程通道

继续兼容当前 Electron 使用的 Socket.IO 通道：

```text
/remote
```

服务端维护：

- 用户。
- 桌面设备。
- Socket 会话。
- 配对状态。
- 最后心跳。
- 操作权限。

### 7.3 截图与处理操作

手机页面需要支持现有截图中的操作：

- 截图。
- 局部截图。
- 编程题。
- 单选题。
- 多选题。
- 备用单选题。
- 通用搜题。
- 一键重置。

### 7.4 窗口操作

包括：

- 移动窗口。
- 调整窗口大小。
- 显示或隐藏窗口。
- 恢复窗口位置。
- 调整透明度。
- 放大内容。
- 缩小内容。
- 重置缩放。

### 7.5 显示与工具操作

包括：

- 查看原始输出。
- 复制代码。
- 代码左右移动。
- 代码上下移动。
- 删除最后截图。
- 刷新配置。
- 退出客户端。

远程操作必须使用白名单命令，不允许手机端发送任意 IPC 名称或任意 Electron 参数。

## 8. MinIO 文件存储

不使用应用本地目录保存截图或导出文件。MinIO 是唯一文件存储层。

Bucket：

```text
aivora-private
```

对象前缀：

```text
task-images/{user_id}/{task_id}/{image_id}.png
answers/{user_id}/{task_id}/result.json
exports/{user_id}/{export_id}.zip
```

数据库只保存：

- Bucket。
- Object Key。
- 文件类型。
- 文件大小。
- SHA-256。
- 所属用户。
- 所属任务。
- 创建时间。
- 过期时间。

文件访问使用服务端生成的短时预签名 URL。MinIO 在开发环境使用 Docker 持久化卷，生产环境使用独立数据盘或兼容 S3 的持久化部署。

## 9. 数据模型

### 身份

```text
users
sessions
password_reset_tokens
user_configs
```

### AI

```text
ai_providers
ai_models
prompt_templates
ai_tasks
task_events
answers
answer_files
```

### 文件与设备

```text
stored_files
desktop_devices
pairing_codes
remote_sessions
```

### 系统

```text
system_settings
admin_audit_logs
client_releases
```

不创建以下商业化表：

```text
credit_accounts
credit_ledger
orders
payments
invitations
referral_rewards
```

## 10. Flyway 迁移规范

```text
backend/db/migrations/
├── V001__create_users.sql
├── V002__create_sessions.sql
├── V003__create_user_configs.sql
├── V004__create_ai_catalog.sql
├── V005__create_ai_tasks.sql
├── V006__create_task_events.sql
├── V007__create_answers.sql
├── V008__create_storage_and_devices.sql
├── V009__create_admin_audit_logs.sql
└── R__seed_default_models.sql
```

规则：

- Flyway 是数据库结构的唯一迁移工具。
- SQLAlchemy 不生成迁移。
- 已执行版本文件禁止修改。
- 初始化模型和系统配置使用可重复迁移。
- 部署顺序为 `validate`、`migrate`、启动 API、启动 Worker。

## 11. Web 页面范围

### 用户端

```text
/login
/register
/forgot-password
/dashboard
/dashboard/tasks
/dashboard/tasks/[id]
/dashboard/history
/dashboard/models
/dashboard/settings
/dashboard/devices
/remote
```

### 管理端

```text
/admin
/admin/users
/admin/users/[id]
/admin/tasks
/admin/tasks/[id]
/admin/models
/admin/prompts
/admin/devices
/admin/system
/admin/releases
/admin/audit-logs
```

只有一个管理角色：

```text
user.role = "user" | "admin"
```

后台仍然保留操作审计，避免管理员操作无法追踪。

## 12. 安全与稳定性要求

- 密码使用 Argon2id 或同等级密码哈希。
- Session Token 只保存哈希值。
- 管理员接口必须检查 `admin` 角色。
- 图片和请求体设置大小限制。
- AI 任务设置超时和最大重试次数。
- SSE 连接限制和心跳。
- Redis 队列设置最大长度保护。
- 模型密钥只存在服务端。
- 日志不记录 base64 图片内容。
- MinIO Bucket 默认私有。
- 文件访问使用短时签名 URL。
- 远程控制只允许白名单命令。
- 所有管理员写操作记录 `admin_audit_logs`。
- 用户只能读取自己的任务、答案和文件。

## 13. 开发与部署

### 开发环境

```text
web
api
worker
postgres
redis
minio
mailpit
flyway
```

全部通过 Docker Compose 启动。MinIO 使用命名卷保存数据，不使用应用目录作为文件存储。

### 生产环境

```text
Caddy/Nginx
  ├── Next.js Web
  ├── FastAPI API
  └── SSE

PostgreSQL
Redis
MinIO
Celery Worker
```

生产部署需要包含：

- 环境变量管理。
- Flyway 迁移。
- PostgreSQL 备份。
- MinIO 备份。
- Worker 自动重启。
- API 健康检查。
- SSE 代理超时配置。
- 错误日志和任务日志。
- 基础监控。

## 14. 分阶段交付

### 阶段一：平台基础

- 项目工作区。
- Docker Compose。
- PostgreSQL、Redis、MinIO。
- Flyway 初始迁移。
- FastAPI 基础结构。
- Next.js 基础结构。
- 用户注册登录。
- 单管理员登录。

### 阶段二：AI 主链路

- 模型供应商配置。
- 模型目录。
- 用户模型配置。
- 截图上传到 MinIO。
- 创建 AI 任务。
- Celery Worker。
- Redis Streams。
- SSE 流式返回。
- 答案保存和历史记录。

### 阶段三：桌面端兼容

- `/api/session_status`。
- `/api/config`。
- `/api/ai/process-screenshot`。
- `/api/ai/stream/{task_id}`。
- SSE Stream Token。
- Electron 客户端配置切换。
- 桌面端错误和断线恢复。

### 阶段四：远程配置

- 设备注册。
- 8 位连接码。
- 手机远程页面。
- Socket.IO 通道。
- 截图和题型操作。
- 窗口、显示和工具操作。
- 连接超时和断开。

### 阶段五：完善后台和运维

- 用户管理。
- 任务排查。
- 模型和提示词管理。
- 系统配置。
- 客户端版本管理。
- 审计日志。
- 健康检查和监控。
- 部署文档。

## 15. 验收标准

### 用户端

- 用户可以注册、登录和退出。
- 用户可以修改 AI 模型配置。
- 用户可以提交截图任务。
- 用户可以实时收到 SSE 内容。
- 用户可以查看任务历史。
- 用户可以查看或删除自己的文件和答案。

### 管理端

- 管理员可以登录后台。
- 管理员可以管理用户。
- 管理员可以配置模型。
- 管理员可以查看任务状态和错误。
- 管理员可以查看系统健康状态。
- 管理员可以查看操作审计。

### 桌面端

- 桌面端可以使用新的 API 登录。
- 桌面端可以提交新版 SSE 任务。
- SSE 断线后可以恢复或读取最终结果。
- 手机端可以通过短时连接码连接指定桌面端。
- 手机端只能执行白名单远程操作。

### 数据与部署

- 新环境可以通过 Docker Compose 启动。
- 数据库可以通过 Flyway 从空库迁移完成。
- 截图和附件全部存储在 MinIO。
- 删除任务后关联对象可以按策略清理。
- API 和 Worker 可以独立重启。

