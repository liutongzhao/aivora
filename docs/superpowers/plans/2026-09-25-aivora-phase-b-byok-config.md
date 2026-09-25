# Aivora Phase B BYOK And User Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让每个用户只使用自己的加密 API 密钥、模型、题型映射、提示词版本和编程语言执行任务；无个人配置时不得调用模型。

**Architecture:** 保留现有 FastAPI、PostgreSQL、Celery 结构，在用户作用域内新增连接/模型/题型默认值/提示词版本，并在任务创建时固定不含明文密钥的配置快照。Worker 根据任务归属即时解密该用户当前可用连接，以固定版本提示词构造请求；所有模型出站调用与连接测试经过同一 SSRF 受控网关。旧全局目录只作为迁移前的只读历史信息，不能是推理回退路径。

**Tech Stack:** Python >=3.12、FastAPI、SQLAlchemy asyncio、PostgreSQL 16、Flyway、Celery 5、httpx、cryptography、pytest；桌面 React 18、Vitest。

**Spec:** `docs/superpowers/specs/2026-09-25-aivora-multiuser-product-design.md` 第 4、6、11、12 节；阶段依赖见 `docs/superpowers/plans/2026-09-25-aivora-product-roadmap.md`。

## Global Constraints

- BYOK-only；无平台共享密钥、额度或隐式回退。密钥不进入任务快照、事件、响应、日志或浏览器。
- 普通用户仅可管理自己的连接、模型、默认映射和提示词；管理员不能查看明文密钥或静默替用户修改配置。
- 题型包括 `programming`、`single_choice`、`multiple_choice`、`universal`、`debug`；编程语言默认 Python 3，支持 Java、C++、JavaScript 和单任务覆盖。
- 配置变更只影响新提交任务；禁用密钥后尚未开始的任务明确失败。历史结果保持可读。
- 出站仅 HTTPS，私网/回环/元数据地址和非允许端口拒绝；DNS 解析与真正 TCP 连接之间不能重新解析并绕过校验，重定向默认关闭。
- A 阶段的租约与 Worker 原子状态是本计划的接口；先验证 A 五项任务和最终复核都已完成，再执行 Task 1。
- 连接/模型内容以不可变修订版冻结到任务；密钥替换创建新修订版，旧修订版仅供已经排队的任务读取；禁用/删除连接使未开始任务失败，旧答案只读。
- 出站固定方案为校验全部解析结果后由 `httpcore` 自定义异步网络后端连接已选定公网 IP，保留原始域名的 Host、TLS SNI 和证书验证；测试与 Worker 只能经此传输层，不存在普通 `httpx.AsyncClient` 旁路。

## Review Focus

- 用户 A 提交用户 B 的模型 ID 或提示词版本 ID：返回不可枚举的拒绝，不产生模型调用；Task 3、4、5。
- 连接 URL 公网 DNS 在校验后变为内网，或返回 30x 跳转到内网：真正的 TCP 目标仍被阻止；Task 2。
- 任务入队后用户改默认模型或提示词：在途任务仍用原快照；禁用连接则待执行任务失败；Task 5。
- 保存密钥留空与替换密钥：前者不改变密文，后者需明确确认；响应、日志、审计均不露原文；Task 2、3。
- Worker 超时异常带上游请求头或响应体：用户/管理员可见错误仍经过脱敏；Task 2、5、6。

---

## File Map And Interface

| 文件 | 职责 |
| --- | --- |
| `backend/db/migrations/V013__user_model_config.sql` | 用户连接及不可变修订版、模型/默认映射、版本化提示词与任务快照；仅增量和复合归属外键 |
| `backend/app/modules/byok/models.py` | SQLAlchemy 用户归属、FK、版本和唯一约束 |
| `backend/app/modules/byok/crypto.py` | 加密/解密与主密钥版本选择；主密钥只来自部署环境 |
| `backend/app/modules/byok/outbound.py` | HTTPS URL/DNS/地址/端口校验、`httpcore` 固定地址后端与禁重定向 |
| `backend/app/modules/byok/service.py`, `backend/app/modules/byok/router.py`, `backend/app/modules/byok/schemas.py` | 连接测试、连接/模型/映射 CRUD 和归属校验 |
| `backend/app/modules/prompts/service.py`, `backend/app/modules/prompts/router.py`, `backend/app/modules/prompts/schemas.py` | 默认模板、版本保存/预览/回滚与白名单变量 |
| `backend/app/modules/tasks/service.py`, `backend/app/modules/tasks/models.py`, `backend/app/modules/tasks/schemas.py` | 提交时校验、快照连接/模型/提示词/语言版本 |
| `backend/app/providers/openai_compatible.py`, `backend/app/workers/ai_tasks.py` | 显式传入该用户运行时配置；彻底取消全局密钥/模型回退 |
| `backend/app/modules/models/router.py`, `backend/app/modules/settings/service.py` | 旧目录隔离/停用与旧字符串模型设置的兼容提示 |

接口约定：`resolve_task_config(db, user_id, mode, model_id, language) -> TaskConfigSnapshot` 返回用户 ID、连接 ID/修订版、模型 ID/修订版、题型、不可变提示词版本 ID、语言、契约版本；`load_runtime_config(db, task_id) -> RuntimeConfig` 解密**提交时修订版**的密钥，同时检查连接当前启用状态，不得持久化或日志输出；`OpenAICompatibleProvider(base_url, api_key, outbound_transport)` 必须显式传入参数，没有默认全局回退。具体签名与 A Worker 的最终实现对齐时，只改接口适配，不削弱上述约束。

独立测试基础：将 A 阶段隔离的 PostgreSQL/Flyway 测试库及对象桶 fixture 提升到根目录 `tests/conftest.py`，让 `tests/byok`、`tests/prompts`、`tests/e2e` 继承；在 `backend/pyproject.toml` dev 依赖中声明 pytest、pytest-asyncio 和 cryptography 的运行依赖。禁止测试迁移共享的 `aivora` 数据库。

## Task 1: 用户配置迁移与密钥信封

**Files:** Create `backend/db/migrations/V013__user_model_config.sql`, `backend/app/modules/byok/models.py`, `backend/app/modules/byok/crypto.py`; Modify `backend/pyproject.toml`, `tests/conftest.py`; Test `tests/byok/test_encryption.py`, `tests/byok/test_config_constraints.py`.

**Interfaces:** `encrypt_secret(plaintext: str, keyring: Keyring) -> EncryptedSecret`、`decrypt_secret(value: EncryptedSecret, keyring: Keyring) -> str`；`provider_connections.user_id`、`user_models.connection_id`、`question_model_defaults(user_id,mode)`、`user_prompt_versions(user_id,mode,version)`。

- [ ] **Step 1: 红灯测试。** 用两个用户创建同名连接/模型，断言复合归属 FK（跨用户关联被数据库拒绝）；同一用户每题型最多一个默认模型，版本号不可重复。密钥加解密往返、将 A 的密文行换给 B 后解密失败、错误主密钥拒绝、主密钥轮换后旧密文可读而新写入使用新版本；空值与短密钥拒绝。测试异常与 `repr()` 不包含密钥。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/byok/test_encryption.py tests/byok/test_config_constraints.py`；预期缺新模块/约束而失败。
- [ ] **Step 3: 最小实现。** V013 只新增用户配置表、外键与任务快照列；连接和模型的可修改内容以不可变修订版行存储，任务通过 `(user_id, connection_revision_id/model_revision_id/prompt_version_id)` 复合外键固定归属，停用/删除为软删除，历史 FK 永不级联抹去。`pyproject.toml` 加入受支持的 `cryptography` 运行依赖与 pytest/pytest-asyncio dev 依赖；密文为版本化 AEAD 信封，认证关联数据绑定 `user_id + connection_id + revision_id + key_version`，主密钥来自独立环境变量且不入数据库。缺主密钥时服务拒绝启用 BYOK，不降级明文或环境平台密钥。轮换先全实例部署双版本读取、新版本写入，再后台重加密并验证，最后移除旧版本。任务快照存修订版 ID/模型名/提示词版本/语言，不存密文或明文。保留 V003/V004 原有字段和旧数据；把隔离数据库 fixture 放到根 `tests/conftest.py`。
  ```sql
  CREATE TABLE provider_connections (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(120) NOT NULL,
      enabled BOOLEAN NOT NULL DEFAULT TRUE,
      UNIQUE (user_id, id),
      UNIQUE (user_id, name)
  );
  CREATE TABLE connection_revisions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL,
      connection_id UUID NOT NULL,
      revision INTEGER NOT NULL CHECK (revision > 0),
      base_url TEXT NOT NULL,
      api_key_ciphertext TEXT NOT NULL,
      key_version VARCHAR(40) NOT NULL,
      UNIQUE (user_id, id),
      UNIQUE (connection_id, revision),
      FOREIGN KEY (user_id, connection_id)
          REFERENCES provider_connections(user_id, id)
  );
  ```
- [ ] **Step 4: 绿灯。** Step 2 命令与独立测试库 Flyway 迁移通过；对现有任务详情/旧答案只读回归通过。
- [ ] **Step 5: 提交。** 仅暂存上述文件，`git commit -m "feat: store user-scoped encrypted model config"`。

## Task 2: 受控出站与连接测试

**Files:** Create `backend/app/modules/byok/outbound.py`; Modify `backend/app/providers/openai_compatible.py`, `backend/pyproject.toml`; Test `tests/byok/test_outbound_policy.py`, `tests/byok/test_connection_probe.py`.

**Interfaces:** `validate_public_endpoint(url: str) -> ValidatedEndpoint`、`open_checked_client(endpoint: ValidatedEndpoint) -> httpx.AsyncClient`；相同策略同时用于连接测试和 Worker 模型请求。

- [ ] **Step 1: 红灯测试。** 用可控 DNS 与本地 TCP 服务器分别模拟公网、A/AAAA 混合私网、回环、链路本地、云元数据 IP、DNS 重绑定、HTTPS 到内网的重定向、URL 嵌入凭据和非允许端口；断言只对经核验且固定的公网地址发起 TCP 连接，跳转拒绝。上游错误响应中放敏感标记，断言 API/日志均不含它。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/byok/test_outbound_policy.py tests/byok/test_connection_probe.py`；预期策略函数尚不存在。
- [ ] **Step 3: 最小实现。** 固定 `httpx`/`httpcore` 已验证兼容的版本范围；限制 HTTPS、域名和 443 端口，解析全部 A/AAAA 并拒绝任何非公网结果（含 IPv4 映射 IPv6）；建立基于 `httpcore.AsyncNetworkBackend` 的固定 IP 连接后端，TCP 使用已验证地址而原始域名继续用作 Host、TLS SNI 与证书校验。该后端是连接测试与 Worker 的唯一可用出站路径，禁止系统代理环境变量及 HTTP 重定向；若后端兼容性测试不能证明 DNS 重绑定安全，**本阶段不得开放自定义 URL 功能**。限制连接/读取超时、响应体大小、并发；错误码脱敏。
  ```python
  with pytest.raises(InvalidEndpoint):
      validate_public_endpoint("https://127.0.0.1/v1")
  ```
- [ ] **Step 4: 绿灯。** Step 2 命令通过；抓取测试代理连接目标，证明 DNS 重绑定时没有内网 TCP 包。
- [ ] **Step 5: 提交。** 仅暂存上述文件，`git commit -m "security: enforce a shared BYOK egress policy"`。

## Task 3: 用户连接、模型与题型映射 API

**Files:** Create `backend/app/modules/byok/service.py`, `backend/app/modules/byok/router.py`, `backend/app/modules/byok/schemas.py`; Modify `backend/app/main.py`, `backend/app/modules/models/router.py`; Test `tests/byok/test_user_connections_api.py`, `tests/byok/test_user_models_api.py`.

**Interfaces:** 登录用户 ID 只由 `get_current_user` 决定；`connection_id/model_id` 在该用户作用域内解析；`POST /api/byok/connections/{id}/test` 使用 Task 2 受控连接测试；旧 `/api/ai/models` 不暴露共享凭据。

- [ ] **Step 1: 红灯测试。** A/B 分别创建连接/模型，B 无法读取、更新、删除、测试 A 的记录；不能用 A 的连接创建 B 的模型。密钥保存后只返回掩码，留空不改密钥，明确确认后才替换且生成新修订版；删除连接列出受影响模型与排队任务并软禁用，使待执行任务失败。无视觉能力模型不能设为截图题默认；5 个题型的模型映射可独立保存。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/byok/test_user_connections_api.py tests/byok/test_user_models_api.py`；预期路由不存在。
- [ ] **Step 3: 最小实现。** 明确 DTO（连接名、HTTPS URL、密钥替换确认、启用、模型 ID/视觉能力、题型映射），所有 ORM 查询先带 `user_id`，失败统一 404；输出仅掩码/状态。现有管理员共享模型接口不能创建或曝光可供普通用户隐式使用的服务商连接；旧设置字段仍可读，但显示需要配置而不参加新任务解析。
- [ ] **Step 4: 绿灯。** Step 2 命令和 `PYTHONPATH=backend pytest -q tests/api tests/byok` 通过。
- [ ] **Step 5: 提交。** 仅暂存上述文件，`git commit -m "feat: manage user-owned provider connections and models"`。

## Task 4: 用户提示词版本和语言

**Files:** Create `backend/app/modules/prompts/service.py`, `backend/app/modules/prompts/router.py`, `backend/app/modules/prompts/schemas.py`; Modify `backend/app/prompts/registry.py`, `backend/app/modules/settings/service.py`; Test `tests/prompts/test_user_prompt_versions.py`, `tests/prompts/test_prompt_template_validation.py`.

**Interfaces:** `resolve_prompt(db, user_id, mode) -> PromptVersion`；五个题型的产品默认模板为公开版本；只允许 `image_count`、`mode`、`language` 变量。

- [ ] **Step 1: 红灯测试。** 版本保存不可原地修改，可预览/恢复旧版/恢复默认；用户 B 无法读取 A 的版本。未知变量、必需 JSON 输出字段缺失、原始 HTML 注入和无效语言拒绝；编程默认 Python 3、Java/C++/JavaScript 可选。保存后旧任务引用不变。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/prompts/test_user_prompt_versions.py tests/prompts/test_prompt_template_validation.py`；预期缺用户版本服务。
- [ ] **Step 3: 最小实现。** 将现有五题型 PromptRegistry 默认文案以明确版本及不可变 ID 写入产品默认模板表；每次升级添加新版本，旧版本永久保留，未个性化用户任务仍可引用确定版本。用户版本按 `(user_id, mode, version)` 唯一且只新增；模板使用白名单变量解析而非任意表达式。恢复旧版创建新版本而不篡改历史。编程语言严格归一化并在配置和覆盖请求都校验。
- [ ] **Step 4: 绿灯。** Step 2 命令及 `PYTHONPATH=backend pytest -q tests/prompts` 通过。
- [ ] **Step 5: 提交。** 仅暂存上述文件，`git commit -m "feat: version user prompts and validate languages"`。

## Task 5: 固定任务快照并接通 Worker

**Files:** Modify `backend/app/modules/tasks/service.py`, `backend/app/modules/tasks/models.py`, `backend/app/modules/tasks/schemas.py`, `backend/app/workers/ai_tasks.py`, `backend/app/providers/openai_compatible.py`, `backend/app/config.py`; Test `tests/byok/test_task_snapshot.py`, `tests/byok/test_worker_byok.py`.

**Interfaces:** `resolve_task_config(db,user_id,mode,model_id,language) -> TaskConfigSnapshot` 在创建/入队前运行；`load_runtime_config(db,task_id) -> RuntimeConfig` 只从任务用户的连接解密；Worker 延续 A 的 generation/取消栅栏。

- [ ] **Step 1: 红灯测试。** 无个人连接/题型模型/视觉能力时创建任务被拒且无付费调用；A 的 model ID 对 B 无效。任务创建后修改默认模型/提示词/语言，执行仍使用提交时的模型与提示词版本及语言；禁用连接后排队任务明确失败。Provider 未显式传密钥时拒绝，不使用 `AI_API_KEY`、`ai_model` 等环境值。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/byok/test_task_snapshot.py tests/byok/test_worker_byok.py`；预期全局回退或快照缺失。
- [ ] **Step 3: 最小实现。** A 的 `created` 唯一键占位由第一次提交取得；配置校验和不可变修订版快照只在该占位拥有者上传前执行，`queued` 只在图片关联与有效快照都提交后设置。重复键请求只返回原有任务和快照，不以当前用户设置重新解析或重传。Worker 在真正执行前检查该用户连接启用状态且能解密提交时的密钥修订版，用 Task 2 固定地址出站后端发请求；Provider 接收显式系统提示词与用户提示词，不再读取全局环境密钥/模型或 PromptRegistry。事件与答案记录只包含版本 ID、模型名、目标语言，不能含密钥。桌面 SSE 提交也传入所选语言；旧无密钥账户返回 `CONFIG_REQUIRED` 并保留既有历史。
- [ ] **Step 4: 绿灯。** Step 2 命令，`PYTHONPATH=backend pytest -q tests` 与桌面 `npm test -- --run src/services/aiService.test.ts`（若不存在则先建立此测试文件）通过；用两个不同 mock 模型端点证明任务按各自用户配置路由。
- [ ] **Step 5: 提交。** 仅暂存上述文件和新增桌面测试/语言传递修改，`git commit -m "feat: run tasks with user-owned model snapshots only"`。

## Task 6: 密钥、租户与迁移发布验收

**Files:** Create `tests/e2e/test_byok_tenants.py`, `tests/e2e/test_byok_security.py`, `docs/operations/aivora-byok.md`; Modify `backend/app/modules/admin/router.py`, `backend/app/modules/models/router.py` only if contract tests identify a leak.

**Interfaces:** 管理员只能看到掩码/配置状态；部署必须提供受管理主密钥；旧模型配置不会自动迁移为用户密钥。

- [ ] **Step 1: 红灯测试。** 两用户不同连接并发推理，检查服务商只收到所属用户请求；删除/禁用、撤销会话、密钥轮换、恶意 URL、错误堆栈、SSE、导出及管理员接口均不得泄漏密钥。旧用户只有只读历史与需配置状态；管理员无权限代其触发推理。
- [ ] **Step 2: 验证红灯。** `PYTHONPATH=backend pytest -q tests/e2e/test_byok_tenants.py tests/e2e/test_byok_security.py`；预期尚有缺失的迁移/安全行为。
- [ ] **Step 3: 最小实现与运行手册。** 仅修复测试指出的 API 越权/泄漏。手册记录主密钥注入与轮换、SSRF 出站策略、旧用户升级、迁移与回滚命令；不得在日志/样例配置中放真实密钥。部署切换先迁移表，再启用用户配置接口，最后切换 Worker 为只读用户密钥，禁止旧 Worker 和新 Worker 同时处理同一任务。
- [ ] **Step 4: 完整验证。** Step 2 命令、全部后端测试、独立测试库迁移与双用户演练通过；人工核对 API/SSE/日志/审计中的测试密钥标记为零。
- [ ] **Step 5: 提交。** 仅暂存上述文件，`git commit -m "test: verify BYOK isolation and migration"`。

## 阶段完成条件

本计划 Task 1-6 的红绿测试和独立复核全部通过，两个用户分别使用自己的连接并发执行，环境级 `AI_API_KEY` 即使存在也不被调用；旧任务仍可读、未配置用户有清楚的配置入口。尚未实现的字段级流协议和新 UI 属于 C/D/E，不能因 B 通过而宣称整个产品完成。
