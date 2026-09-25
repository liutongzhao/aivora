# A 阶段 Task 1 第四轮修复报告

状态：DONE_WITH_CONCERNS

范围：仅指定工作树 `codex/aivora-productization` 的旧 Worker 领取异常处理和回归测试；起点 `027634a`。未改主检出、B/C 计划或 Task 2。

## RED

`PYTHONPATH=backend conda run -n aivora-backend pytest -q tests/tasks/test_worker_outer_failure.py --tb=short`

先写隔离数据库故障注入测试，再运行。完整 pytest 输出：

```text
.....FFFF                                                                [100%]
=================================== FAILURES ===================================
______ test_preclaim_database_fault_retries_without_reopening_claim[read] ______
tests/tasks/test_worker_outer_failure.py:174: in test_preclaim_database_fault_retries_without_reopening_claim
    with pytest.raises(RuntimeError, match="claim unavailable"):
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E   Failed: DID NOT RAISE RuntimeError
------------------------------ Captured log call -------------------------------
WARNING  app.workers.ai_tasks:ai_tasks.py:135 Legacy worker could not claim task 55cf434e-000d-4d7f-b3ab-8f0bcc5a648e
_ test_preclaim_database_fault_retries_without_reopening_claim[commit_before_write] _
tests/tasks/test_worker_outer_failure.py:174: in test_preclaim_database_fault_retries_without_reopening_claim
    with pytest.raises(RuntimeError, match="claim unavailable"):
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E   Failed: DID NOT RAISE RuntimeError
------------------------------ Captured log call -------------------------------
WARNING  app.workers.ai_tasks:ai_tasks.py:135 Legacy worker could not claim task 71680225-b61d-4628-9759-493853822b9b
_ test_preclaim_database_fault_retries_without_reopening_claim[commit_after_write] _
tests/tasks/test_worker_outer_failure.py:174: in test_preclaim_database_fault_retries_without_reopening_claim
    with pytest.raises(RuntimeError, match="claim unavailable"):
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E   Failed: DID NOT RAISE RuntimeError
------------------------------ Captured log call -------------------------------
WARNING  app.workers.ai_tasks:ai_tasks.py:135 Legacy worker could not claim task b646d507-2eca-4fbf-9994-1a0cfa31dbfb
_____________ test_legacy_celery_entry_retries_only_preclaim_fault _____________
tests/tasks/test_worker_outer_failure.py:206: in test_legacy_celery_entry_retries_only_preclaim_fault
    with pytest.raises(RuntimeError, match="retry scheduled"):
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
E   Failed: DID NOT RAISE RuntimeError
------------------------------ Captured log call -------------------------------
WARNING  app.workers.ai_tasks:ai_tasks.py:148 Legacy worker stopped without retry for e64b6586-564b-4229-8d9f-fc49b4c1cef7
=========================== short test summary info ============================
FAILED tests/tasks/test_worker_outer_failure.py::test_preclaim_database_fault_retries_without_reopening_claim[read]
FAILED tests/tasks/test_worker_outer_failure.py::test_preclaim_database_fault_retries_without_reopening_claim[commit_before_write]
FAILED tests/tasks/test_worker_outer_failure.py::test_preclaim_database_fault_retries_without_reopening_claim[commit_after_write]
FAILED tests/tasks/test_worker_outer_failure.py::test_legacy_celery_entry_retries_only_preclaim_fault
4 failed, 5 passed in 2.99s
```

随后核对本机 Celery `Task.retry` 实现，发现 `max_retries=None` 参数沿用任务默认值 3，追加任务无限重试配置的测试。命令：`PYTHONPATH=backend conda run -n aivora-backend pytest -q tests/tasks/test_worker_outer_failure.py::test_legacy_celery_entry_retries_only_preclaim_fault --tb=short`。完整 pytest 输出：

```text
F                                                                        [100%]
=================================== FAILURES ===================================
_____________ test_legacy_celery_entry_retries_only_preclaim_fault _____________
tests/tasks/test_worker_outer_failure.py:196: in test_legacy_celery_entry_retries_only_preclaim_fault
    assert ai_tasks.run_ai_task.max_retries is None
E   assert 3 is None
E    +  where 3 = <@task: aivora.run_ai_task of aivora at 0x1046d2900>.max_retries
E    +    where <@task: aivora.run_ai_task of aivora at 0x1046d2900> = ai_tasks.run_ai_task
=========================== short test summary info ============================
FAILED tests/tasks/test_worker_outer_failure.py::test_legacy_celery_entry_retries_only_preclaim_fault
1 failed in 0.18s
```

## GREEN

- `PYTHONPATH=backend conda run -n aivora-backend pytest -q tests/tasks/test_worker_outer_failure.py --tb=short`（首次修复后）：
  ```text
  .........                                                                [100%]
  9 passed in 3.16s
  ```
- `PYTHONPATH=backend conda run -n aivora-backend pytest -q tests/tasks/test_task_create_idempotency.py tests/tasks/test_task_input_persistence.py tests/tasks/test_task_stream_terminal.py tests/tasks/test_worker_outer_failure.py`：
  ```text
  ...........................                                              [100%]
  27 passed in 5.14s
  ```
- `PYTHONPATH=backend conda run -n aivora-backend pytest -q`：
  ```text
  ...................................                                      [100%]
  35 passed in 5.55s
  ```
- `git diff --check`：退出码 0。测试使用随机独立 Postgres 数据库及 MinIO 桶，夹具只在随机库执行 Flyway `migrate`/`validate`，不接触共享库/桶。

## 设计选择

领取结果未确认时，`_run_task` 抛不包含原数据库异常的 `ClaimUnavailable`；Celery 只对此异常以 1 至 60 秒退避重试，任务配置 `max_retries=None`，避免默认三次耗尽后丢失 `queued` 任务。其他未知异常仍不自动重试；领取成功后的异常继续走既有条件失败终结路径。

每次重试仍执行 `WHERE status='queued'` 的原子领取；提交其实成功但客户端收到异常时，数据库已为 `processing`，后续消息退出而不调用模型。已取消、失败、完成任务同样不会重开。对提交成功后的不确定任务不自动恢复处理，以免原领取者或消息重投并发调用模型。测试覆盖提交前后的实际数据库状态、后续领取结果及模型调用数；原 postclaim、派发竞态测试随聚焦及全量测试通过。

## 剩余风险

提交成功但客户端收到异常时，任务可能保持 `processing`，由 Task 2 的持久租约/对账处理，不能在旧 Worker 中盲目重领。数据库长期不可用期间将持续尝试；若 Celery broker 本身无法接受重试消息，Celery 会显式报错，Task 2 仍须负责持久化调度对账。本轮没有真实断网或杀死 Worker 的端到端实验。
