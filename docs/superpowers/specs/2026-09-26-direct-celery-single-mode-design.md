# Direct Celery Single-Mode Design

## Goal

简化 Aivora 的任务执行链路：任务创建成功后立即投递 Celery，由一个可并发的 Worker 处理多个用户的多个任务。系统只保留一种执行模式，不再依赖定时扫描或额外的维护 Worker。

## Scope

本次改造覆盖：

- FastAPI 任务创建和入队流程。
- Celery Worker 的任务抢占和执行入口。
- Redis、PostgreSQL、MinIO 之间的任务闭环。
- 本地启动脚本和 Docker Compose。
- 任务执行相关测试。

本次不引入新的消息中间件，不增加常驻服务，不实现 Transactional Outbox。

## Target Architecture

```text
Client
  -> FastAPI
  -> PostgreSQL + MinIO
  -> Celery apply_async
  -> Redis broker
  -> aivora-worker (prefork concurrency)
  -> Redis Streams
  -> FastAPI SSE
  -> Client
```

日常运行组件：

- PostgreSQL
- Redis
- MinIO
- FastAPI
- 一个 Celery Worker 服务

移除：

- Celery Beat
- maintenance Worker
- queued 任务的周期扫描派发
- scheduled/direct 双模式配置
- 旧的调度兼容路径

## Task Lifecycle

1. API 校验用户和模型配置。
2. API 上传截图到 MinIO，并在 PostgreSQL 保存任务、图片顺序和 SSE token。
3. 数据库事务提交后，API 立即调用 `run_ai_task.apply_async(...)`。
4. Worker 使用一次原子数据库更新，将任务从 `queued` 改为 `processing`。
5. 抢占失败的重复消息立即结束，不调用模型。
6. Worker 读取 MinIO 图片，调用用户配置的 OpenAI 兼容接口。
7. Worker 将进度、流式内容和终态事件写入 Redis Streams。
8. FastAPI SSE 将事件转发给客户端，并在完成、失败或取消时关闭连接。

保留的业务状态：

```text
queued
processing
streaming
completed
failed
cancelled
```

## Concurrency and Duplicate Delivery

Worker 使用 prefork 并发，默认并发数为 4。任务之间不共享模型请求状态。

任务执行入口必须使用数据库条件更新：

```text
UPDATE ai_tasks
SET status = 'processing'
WHERE id = :task_id
  AND status = 'queued'
RETURNING id
```

只有成功更新的 Worker 可以执行模型调用。Celery 重复投递、Worker 重启后的重复消息不会导致同一任务重复调用模型。

保留 `acks_late` 和 Worker 丢失时的拒绝行为，但删除应用层的 reservation、generation、lease 和周期 reconcile 逻辑。

## Failure Handling

- 图片上传失败：API 删除本次已经上传的对象，并将任务标记为失败。
- Celery 投递失败：API 将任务标记为失败，并返回明确错误。
- 模型调用失败：Worker 将任务标记为失败并写入终态事件。
- 用户取消：数据库状态变为 `cancelled`；Worker 在模型调用前和流式处理中检查当前状态。
- SSE 断线：客户端使用已有任务查询和事件恢复机制读取状态或最终答案。

本方案接受一个明确的简单化取舍：数据库提交成功后、Celery 消息发送前，如果 API 进程突然崩溃，任务可能短暂停留在 `queued`。不增加恢复服务来消除这一窗口；管理端可以通过任务失败重试或人工处理解决。

## Cleanup

不再运行独立 maintenance Worker。

- 普通上传异常由 API 立即清理。
- 任务执行完成后按现有逻辑清理任务输入。
- 遗留对象依靠 MinIO 生命周期策略或手动运维命令处理。

## Configuration and Deployment

删除 `TASK_DISPATCH_ENABLED` 作为执行模式开关。BYOK 配置是否启用独立由 `BYOK_REQUIRED` 决定。

本地启动脚本只启动：

- `aivora-backend`
- `aivora-worker`
- `aivora-web`
- `aivora-dev`

Docker Compose 只保留一个 `worker` 服务，不定义 `beat` 和 `maintenance`。

## Code Changes

预期删除或简化：

- `backend/app/workers/dispatcher.py`
- `backend/app/workers/maintenance.py`
- `celery_app.py` 中的 beat schedule。
- `TaskService.create` 中 scheduled/direct 分支。
- `backend/app/modules/tasks/dispatch.py` 中的调度租约和周期恢复逻辑。
- 与旧 dispatch 字段绑定的 Worker 分支。

预期保留：

- Celery `run_ai_task` 任务。
- Redis Streams 事件总线。
- PostgreSQL 任务状态和答案持久化。
- SSE 鉴权、断线恢复和取消行为。
- 用户级模型配置和任务隔离。

数据库迁移会删除不再使用的调度字段；历史任务状态和答案数据必须继续可读。

## Verification

至少验证：

- API 创建任务后直接进入 Celery 队列。
- 多用户任务可以并发执行。
- 同一任务重复投递只产生一次模型调用。
- 取消任务不会写入最终答案。
- 模型失败和投递失败能正确进入 `failed`。
- SSE 可以收到进度、内容和终态事件。
- 启动脚本不再启动 Beat 或 maintenance。
- Docker Compose 不再创建 Beat 或 maintenance 容器。

