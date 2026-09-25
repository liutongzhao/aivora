# A 阶段 Task 2：事务性公平领取与派发对账

日期：2026-09-25

## 基线与隔离

- 开始前验证分支 `codex/aivora-productization`，HEAD `9191e57`；先阅读 `task-2-brief.md`。
- 测试复用 Task 1 的随机 PostgreSQL 数据库和 MinIO 桶 fixture；新用例使用独立用户并在用例结束清理。本次没有迁移或清理共享 aivora 数据，也未触碰主检出或 B/C 计划。
- 本 worktree 初始无 `pytest`，在本地忽略的 `.venv` 中安装后端与测试依赖。

## RED / GREEN

1. 先写 `test_dispatch_fairness.py` 与 `test_dispatch_recovery.py`。指定命令首次因无 `pytest` 可执行文件退出 127；使用 `.venv/bin/pytest` 重跑后两个模块均因缺少 `app.modules.tasks.dispatch` 在收集阶段失败，退出 2，确认实现缺失红灯。
2. 初版实现后，聚焦运行 `5 failed, 4 passed`。失败源于会话级测试库保留前一个用例的排队行，以及测试用户 C/D 未建外键记录；增加每例独立用户及清理后 `9 passed`。
3. 增补 broker 失败与发送后标记失败的派发入口故障测试，再次聚焦 `11 passed`。最终清理无用导入后复跑：`PYTHONPATH=backend .venv/bin/pytest -q tests/tasks/test_dispatch_fairness.py tests/tasks/test_dispatch_recovery.py` 为 `11 passed in 3.54s`；`PYTHONPATH=backend .venv/bin/pytest -q tests` 为 `46 passed in 6.67s`。`git diff --cached --check` 通过。

## 修改文件

- `backend/app/modules/tasks/dispatch.py`：事务级 advisory lock、全局/用户槽位公平领取、递增代际与租约、发布标记、Worker 原子领取门槛、过期 reserved/running 及旧无租约 Worker 对账；周期清理 created 占位和过期 stream token。
- `backend/app/workers/dispatcher.py`：周期对账、提交后发送 `(task_id, generation)`、发布失败留待下轮补发；默认禁用。
- `backend/app/workers/celery_app.py`：注册周期任务及调度器模块，不启动 Beat。
- `backend/app/config.py`：默认关闭的调度开关和额度配置。
- `tests/tasks/conftest.py`：每例隔离的派发测试用户。
- `tests/tasks/test_dispatch_fairness.py`：四用户公平性、容量、取消/终态排除及双 Session 并发。
- `tests/tasks/test_dispatch_recovery.py`：发布不确定、丢失消息、重复代际的 Worker 单次领取、过期租约与旧任务失败、清理及禁用状态。

代码提交：`d60da7f feat: dispatch queued tasks fairly with durable leases`。

## 风险与后续边界

- 调度开关保持默认关闭。旧创建路径仍直接发送单参数 Worker；Task 3 必须先让 Worker 使用 `start_claim` 原子校验 `(task_id, generation)`，再与旧直接派发进行原子切换。过早打开开关会使新消息与旧 Worker 参数不兼容，且存在双路竞争。
- `running` 租约为四分钟，覆盖当前 180 秒 Worker 硬时限。超时标记 `WORKER_LOST_UNCERTAIN`，不会重调上游；Task 3 的 Worker 完成写入须校验租约/终态，避免对账失败后迟到写覆盖失败状态。
- 调度扫描当前所有 queued 行，队列极大时可能需要 SQL 侧限量/索引优化；本阶段以正确的串行化公平领取为先。
- Beat 部署归 Task 5，本阶段仅注册周期任务；未触碰共享生产数据。
