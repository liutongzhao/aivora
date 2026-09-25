# Aivora Phase C Structured Field Stream Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 选择题和编程题在模型输出对应字段时立即增量显示答案/分析或代码，断线重连不重复，主视图始终不显示原始 JSON。

**Architecture:** Worker 保留模型原始流用于最终解析和诊断，同时使用经完整及部分 JSON 解析器验证的字段投影器产出版本化事件。Redis Stream 的真实 ID 是重放游标；桌面和 Web 依任务与字段增量累积，完成时仅校验/补齐，而不将原始 JSON 整体替换进主视图。旧任务答案及旧事件仍走兼容读取。

**Tech Stack:** Python >=3.12、FastAPI、Redis Streams、SQLAlchemy、pytest、Electron/React 18、Vitest、Next.js 15/React 19。

**Spec:** `docs/superpowers/specs/2026-09-25-aivora-multiuser-product-design.md` 第 7、8、9、12 节。依赖 A 的严格 SSE 归属/真实 Redis ID 与 B 的题型、语言、输出契约快照；本计划执行前必须对照 A/B 最终接口复核。

## Global Constraints

- 选择题主视图仅突出稳定确认的答案和解释，编程题仅把 `code` 文本当代码显示；原始 JSON 不作为主内容。
- 事件包括任务 ID、真实事件 ID、类型、字段、增量或值、阶段、schema 版本；多选 `answers` 只在完整数组确定后发稳定集合，调试 `fixed_code` 映射成代码。
- 解释允许受限 Markdown，禁止 HTML/外部资源自动加载；`code` 不交 Markdown 解析。
- 断流/非法最终 JSON 必须给出警告，已经显示的片段不得悄然被当成已验证答案。
- 旧答案仍可复习；当前桌面和 Web 的现有用户改动先合并、再重构，不覆盖主检出未提交工作。

## Review Focus

- JSON 字符串跨 chunk 切在反斜杠或 `\u` 中间：不能输出半个转义、重复字符或错误选项；Task 1。
- 模型先输出解释再输出答案，或字段顺序变动：客户端仅按字段累积，不假设固定顺序；Task 1、3。
- 重连时同一事件先经补发后又直播收到：同任务同 ID 只应用一次，任务切换不混入旧字段；Task 2、3。
- 流在代码字符串中途断开：保留已显示代码但标记未校验，不悄悄改为“已完成”；Task 1、4。
- 最终 JSON 有未知字段/缺必须字段、含恶意 Markdown：只显示可信字段与警告，不执行 HTML/外链；Task 1、4、5。

---

## File Map And Contract

| 文件 | 职责 |
| --- | --- |
| `backend/app/modules/tasks/field_stream.py` | 逐 chunk 的结构化字段投影，输入原始字符，输出已解码且单调增长的字段事件 |
| `backend/app/modules/tasks/parser.py` | 最终结构校验与旧解析结果兼容，不将部分 JSON 误标为确定结果 |
| `backend/app/infrastructure/events.py`, `backend/app/modules/tasks/router.py`, `backend/app/modules/tasks/schemas.py` | Redis ID 重放、补发与直播衔接、过期游标恢复、终态查询及令牌刷新 |
| `backend/app/workers/ai_tasks.py` | Worker 在 A 的租约栅栏内发布字段事件并保存最终解析警告 |
| `src/services/sseService.ts`, `src/hooks/useAIProcessing.ts` | 桌面事件去重与字段累积，不展示 `content` 原始 JSON |
| `src/_pages/Solutions.tsx`, `src/components/Solutions/ChoiceResult.tsx` | 选择题/编程题实时主视图；复用现有组件与不丢失快捷键能力 |
| `web/components/tasks/AnswerViewer.tsx`, `web/components/tasks/TaskDetail.tsx`, `web/app/(user)/dashboard/tasks/page.tsx` | Web 订阅字段流并按字段展示、旧结果兼容，排查区才显示 raw |

协议 v1：SSE `id` 为 Redis Stream ID；payload `{task_id,type,field?,delta?,value?,stage?,schema_version:1}`。字段映射：单选 `answer` -> 单选 `answer_set`；多选 `answers` -> 完整数组 `answer_set`；编程 `code` -> `code_delta`、`analysis` -> `analysis_delta`；调试 `fixed_code` -> `code_delta`、`explanation` -> `explanation_delta`；通用模式按实际 `answer/explanation/code` 字段投影。`answer_set.value` 为单选标识或稳定选项数组，文本字段以 `*_delta` 追加。`completed` 携最终已校验结果及 `parse_status/parse_warning`；`warning_set` 或 `failed/cancelled` 不得清空已显示内容。旧 `progress/content/completed` 暂时仍存在，但新版客户端不在主视图显示原始 `content`。

事件流近似裁剪 1000 条，故 Worker 同时维护短期聚合字段快照及其最后事件 ID。若重连游标早于现存最老事件，SSE 先发 `field_snapshot` 全量字段和真实 ID，之后仅增量回放；如果快照也不存在，发 `reset_required` 并让客户端等待持久终态或查询已保存结果，**不能静默漏字段**。完成/失败/取消终态由数据库为准；回放边界与心跳后核对数据库，若事件已裁剪则发 `terminal_snapshot` 后结束连接。

授权刷新：登录用户 `POST /api/ai/tasks/{task_id}/stream-token` 只可刷新自己任务 token，单次有效期最多 15 分钟；任务初次创建固定 `stream_access_expires_at = created_at + 2h`（增量迁移 V014，仅新任务），刷新不越过此绝对期限。桌面 fetch/Web 客户端在 401 时经会话刷新，携最后 Redis ID 续连；旧任务沿用原始权限期限，不追溯延长。

## Task 1: 字段投影器和最终验证

**Files:** Create `backend/app/modules/tasks/field_stream.py`; Modify `backend/app/modules/tasks/parser.py`, `backend/pyproject.toml`; Test `tests/tasks/test_field_stream.py`, `tests/tasks/test_answer_parser.py`.

**Interfaces:** `FieldProjector(mode: str).feed(chunk: str) -> list[FieldEvent]`、`FieldProjector.finish() -> FieldResult`；`FieldEvent(field: str, type: str, delta: str | None, value: str | list[str] | None)`。

- [ ] **Step 1: 红灯测试。** 固定 JSON 对象覆盖每个字符分块、UTF-8/代理项转义、代码的引号/反斜杠/换行、数组中逗号、字段乱序、Markdown 文本、未知字段、非法最终 JSON；逐题型覆盖单选 `answer`、多选 `answers`、编程 `code`、调试 `fixed_code`、通用题字段。所有测试断言 `''.join(code_delta)` 等于标准 `json.loads(raw)['code']`（调试为 `fixed_code`）；答案直到选项标识或数组完整才发 `answer_set`。重复目标键（例如 `{"answer":"A","answer":"B"}`）不得把先发 A 宣称为已验证；截断在 `finish()` 给警告，已输出片段不标验证通过。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/tasks/test_field_stream.py tests/tasks/test_answer_parser.py`；预期投影接口不存在。
- [ ] **Step 3: 最小实现。** 采用已经支持部分字符串和转义的成熟 JSON 解析器（先以锁定版本及红灯用例验证增量能力）；每次只对已确认属于逐题型白名单字段的已解码单调前缀发新增后缀，遇到不确定的转义/结构保持等待。完整解析时检测重复目标键（保留成对键的解析接口），冲突时发 `warning_set` 并令 `parse_status=invalid`；最终用完整 JSON/题型约束重新校验，缺字段或断流发警告，不用正则“猜”选项；限制原文与事件大小，避免无界缓存。若所选解析器不能通过逐字符测试，先更换解析器，不靠正则截取半截 JSON。
  ```python
  events = projector.feed('{"code":"print(')
  assert all(event.field == "code" for event in events)
  ```
- [ ] **Step 4: 绿灯。** Step 2 命令和全量 `PYTHONPATH=backend pytest -q tests/tasks` 通过。
- [ ] **Step 5: 提交。** 仅暂存本任务文件，`git commit -m "feat: project structured fields from model stream"`。

## Task 2: Worker 发布、可重放 SSE 与最终结果

**Files:** Create `backend/db/migrations/V014__task_stream_access.sql`; Modify `backend/app/workers/ai_tasks.py`, `backend/app/infrastructure/events.py`, `backend/app/modules/tasks/router.py`, `backend/app/modules/tasks/models.py`, `backend/app/modules/tasks/schemas.py`, `backend/app/modules/tasks/service.py`, `backend/app/providers/openai_compatible.py`; Test `tests/tasks/test_field_events.py`, `tests/api/test_sse_replay.py`.

**Interfaces:** A 的 generation 仍决定唯一可发布者；`EventBus.read_after(task_id,last_id)` 与 `listen(task_id,last_id)` 返回真实 Redis ID；最终数据库答案含 `parse_status`、`parse_warning`、raw 和结构化结果。

- [ ] **Step 1: 红灯测试。** 用 mock provider 顺序吐分块 JSON，订阅流时 `code_delta` 先于完成事件出现，原始 content 不作为新版字段；Redis 补发后直播不漏掉边界事件、不重复；过期游标触发字段快照或显式重同步，事件与快照都丢失时查询持久终态，不永久挂起；无效事件 ID 拒绝，跨用户无权重连。上游即使吐完整 JSON，若未收到 `[DONE]` 仍失败/警告而非 `completed`；取消后不发送完成。最终 invalid JSON 必含警告并保留 raw 供授权排查。刷新流 token 不延长初次固定授权窗口。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/tasks/test_field_events.py tests/api/test_sse_replay.py`；预期缺字段事件。
- [ ] **Step 3: 最小实现。** 在 Worker 每次 chunk 后喂投影器，按事件 ID 更新聚合字段快照（短时 Redis TTL），先保存允许的原文（有大小上限），再发布字段事件；只在 Provider 收到明确 `[DONE]` 且最终校验通过时事务性写结构化完成态，缺正常结束标记则写失败与未校验警告。为避免补发到直播的间隙丢事件，记录补发最后一个 Redis ID，`listen` 从该 ID 而非 `$` 继续；若客户端游标早于 Redis 最老 ID，先发快照或 `reset_required`。回放结束与每次心跳后查数据库终态，必要时发 `terminal_snapshot` 并关闭连接。新增有会话鉴权的 token 刷新接口及绝对授权期限；详情 DTO 和完成事件均带 `parse_status/parse_warning`。保留旧最终结果查询与老任务回放，去掉按字符伪造的百分比。
- [ ] **Step 4: 绿灯。** Step 2 命令及 `PYTHONPATH=backend pytest -q tests/tasks tests/api` 全绿。
- [ ] **Step 5: 提交。** 仅暂存上述文件，`git commit -m "feat: publish replayable structured answer events"`。

## Task 3: 桌面和 Web 的字段累积状态

**Files:** Modify `src/services/sseService.ts`, `src/hooks/useAIProcessing.ts`; Create `src/services/fieldEventReducer.ts`, `web/lib/fieldEventReducer.ts`; Test `src/services/fieldEventReducer.test.ts`, `src/hooks/useAIProcessing.test.ts`, `web/lib/fieldEventReducer.test.ts`.

**Interfaces:** `reduceFieldEvent(state: TaskFields, event: FieldEvent) -> TaskFields`；状态按任务 ID 和事件 ID 去重，字段单调追加；`answer_set` 覆盖不稳定候选，终态警告不清空片段。

- [ ] **Step 1: 红灯测试。** 两任务交错、重复 ID、补发与直播交界、先解释后答案、断流、代码特殊字符、`field_snapshot/reset_required/terminal_snapshot`；断言重复一次不会双写，切换任务后没有前任务文本，乱序事件不覆盖更新的字段。桌面 SSE 解析器验证断行、401 后按会话刷新短效 token、携 Redis 游标重连，不把旧 `content` 传进用户结果主视图。
- [ ] **Step 2: 验证红灯。** `npm test -- --run src/services/fieldEventReducer.test.ts src/hooks/useAIProcessing.test.ts` 及 `cd web && npm test -- --run lib/fieldEventReducer.test.ts`；Web 如尚无 Vitest 脚本，在本任务增加明确测试脚本和依赖。
- [ ] **Step 3: 最小实现。** 两端复用同一协议 fixture，按 `task_id` 隔离且以 Redis ID 保持最后消费游标；同 ID 不追加，完成只更新校验与终态，不把 raw JSON 整体替换字段。桌面处理取消/失败后保持错误和已收片段，自动滚动仅当用户已在底部；不再从原始流通过正则提取代码。
- [ ] **Step 4: 绿灯。** Step 2 命令、`npm run typecheck`、`cd web && npm run build` 通过。
- [ ] **Step 5: 提交。** 仅暂存上述文件及 Web 测试配置，`git commit -m "feat: accumulate task field events without duplicates"`。

## Task 4: 桌面免点击结果

**Files:** Modify `src/_pages/Solutions.tsx`, `src/hooks/useAIProcessing.ts`; Modify or create `src/components/Solutions/ChoiceResult.tsx`, `src/components/Solutions/ChoiceResult.css`; Test `src/components/Solutions/ChoiceResult.test.tsx`, `src/_pages/Solutions.test.tsx`.

**Interfaces:** 消费 Task 3 的 `TaskFields`；单/多选答案与解释、编程 code 与 analysis；`parse_status` 决定验证警告。

- [ ] **Step 1: 红灯测试。** 在真实浮窗宽度近似容器中先发 `answer_set` 后追加解释，以及先发 `code_delta` 后继续代码；无需点击即能看见重要内容，流中/完成不发生原始 JSON 闪现或整屏重排；窄宽度无水平溢出；警告不伪装成确定答案。保留截图与关闭等既有流程。
- [ ] **Step 2: 验证红灯。** `npm test -- --run src/components/Solutions/ChoiceResult.test.tsx src/_pages/Solutions.test.tsx`；预期 UI 仍先显示原始内容。
- [ ] **Step 3: 最小实现。** 选择题答案区域只读、解释用禁 HTML/远程资源的 Markdown；编程代码只读语法高亮、不交 Markdown；处理态准确显示排队/读图/连接/生成，不按字符数估算进度。使用既有组件与主题，悬浮窗无必须点击的折叠/复制要求；页面结构的全面重设计留到 D 的设计评审。
- [ ] **Step 4: 绿灯。** Step 2 命令、`npm test`、`npm run typecheck` 通过；人工浮窗截图走查宽窄尺寸。
- [ ] **Step 5: 提交。** 逐块暂存改动，`git commit -m "feat: show choice and code fields live in desktop overlay"`。

## Task 5: Web 结果兼容与协议验收

**Files:** Modify `web/components/tasks/AnswerViewer.tsx`, `web/components/tasks/TaskDetail.tsx`, `web/app/(user)/dashboard/tasks/page.tsx`; Create `web/components/tasks/AnswerViewer.test.tsx`, `tests/e2e/test_field_stream_contract.py`; Test `web/components/tasks/tasks-pages.test.tsx`.

**Interfaces:** Web 主内容与桌面读同一字段/最终解析结果；只有授权的排查区可查看 raw，旧任务读取路径兼容。

- [ ] **Step 1: 红灯测试。** 单选答案和解释、多选答案数组、调试修复代码、编程代码/分析、旧 raw-only 任务、无效最终 JSON、不安全 Markdown；复制的是答案/代码，不是 JSON；用户不能在主结果区看到整个 raw；刷新页面后仍有 `parse_warning`。任务页选择一个任务后订阅合法 SSE，切换任务中止旧订阅与未完成详情请求，401 刷新凭据并从游标恢复；重连增量显示无重复。对至少 3 题型跑完整截图到回答模拟。
- [ ] **Step 2: 验证红灯。** `cd web && npm test -- --run components/tasks/AnswerViewer.test.tsx components/tasks/tasks-pages.test.tsx` 与 `PYTHONPATH=backend pytest -q tests/e2e/test_field_stream_contract.py`；预期旧 UI 原文展示导致失败。
- [ ] **Step 3: 最小实现。** 根据 `parsed` 和题型选择布局，用受限 Markdown 仅渲染解释/分析，代码作为纯文本高亮；raw 仅 Web 授权排查区显示。任务页获取自身任务的短效流凭据后订阅 Task 3 字段状态，切换任务先中止旧订阅和详情请求，结果的 `parse_status/parse_warning` 从详情、完成事件直到 UI 都不丢；旧 raw-only 历史标明“旧记录”，可查看而不捏造结构化选项。全面 Web 结构重设计留到 E 设计评审。
- [ ] **Step 4: 完整验证。** Step 2 命令、桌面/Web 单测与构建及后端全量测试通过；人工记录流中与完成后的桌面/Web 截图，检查没有原始 JSON 闪现。
- [ ] **Step 5: 提交。** 仅暂存上述文件和依赖/测试配置，`git commit -m "feat: render verified structured answers across clients"`。

## 阶段完成条件

独立复核 5 项任务并完成整阶段审查；多选、单选和编程均在字段可确认时增量可见，重连不重复、断流标警告、旧记录可读。D/E 仍须先完成页面设计评审才能做全面重构；本阶段只替换结果协议及现有结果区域的实时行为。
