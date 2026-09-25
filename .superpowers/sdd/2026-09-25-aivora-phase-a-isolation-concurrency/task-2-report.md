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

## Review 修复第 1 轮（2026-09-25）

**RED。** 先补失败测试并运行：
`PYTHONPATH=backend .venv/bin/pytest -q tests/tasks/test_task_input_persistence.py::test_created_cleanup_is_bounded_persistent_and_preserves_failure tests/tasks/test_dispatch_recovery.py::test_legacy_worker_waits_beyond_hard_limit_before_uncertain_failure tests/tasks/test_dispatch_fairness.py::test_two_sessions_at_global_and_user_boundary tests/tasks/test_dispatch_fairness.py::test_two_sessions_cannot_both_take_last_user_slot tests/tasks/test_dispatch_recovery.py::test_dispatch_defaults_off_and_periodic_entry_is_registered`
得到 `2 failed, 3 passed`：旧清理一次扫描全部 12 条，旧 Worker 正好 180 秒即失败。另增存储卡住测试，单跑为 `1 failed`（缺持久完成字段，耗时约 3 秒）；中间一次聚焦运行 `1 failed, 24 passed` 是新测试误遍历字典键，修正测试后复跑。

**GREEN。** 最终 `PYTHONPATH=backend .venv/bin/pytest -q tests/tasks/test_dispatch_fairness.py tests/tasks/test_dispatch_recovery.py tests/tasks/test_task_input_persistence.py` 为 `25 passed in 8.04s`；`PYTHONPATH=backend .venv/bin/pytest -q tests` 为 `52 passed in 10.02s`；`git diff --check` 通过。测试通过随机隔离数据库的 Flyway 迁移，未迁移/清理共享 aivora 数据。

**修改。** `backend/db/migrations/V013__task_input_cleanup.sql` 与 `backend/app/modules/tasks/models.py` 增加持久的清理尝试/完成时间及待清理部分索引；`backend/app/modules/tasks/service.py` 每轮最多领取 10 条，尝试时间先提交、失败退避 5 分钟，单条同步 MinIO 操作转线程并限时 2 秒，成功才持久标记，失败仍保留原 `failed`/`TASK_INPUT_INTERRUPTED`；`backend/app/modules/tasks/dispatch.py` 将旧 Worker 截止改为 240 秒，严格晚于 180 秒硬时限。`tests/tasks/test_task_input_persistence.py`、`tests/tasks/test_dispatch_fairness.py`、`tests/tasks/test_dispatch_recovery.py` 覆盖持久标记、重试/超时、真实对象删除、显式非空槽位、双 Session 额度边界、默认禁用和周期任务注册。

**剩余风险。** 超时的同步 MinIO 调用在线程中不能被强制中止，可能稍后返回；已持久化尝试时间与幂等删除可避免立即反复尝试，单轮调度等待最多约 20 秒。新迁移必须先于新版服务部署；Task 3 原子切换之前派发开关继续关闭，实际 Worker 重复执行验证仍归 Task 3。
