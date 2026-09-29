# Aivora 单仓目录重构 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Aivora 整理为 `apps/desktop`、`apps/web`、`services/backend` 和 `deploy` 边界清晰的单仓工程，并保持现有开发、测试和运行行为。

**Architecture:** 采用物理目录迁移而不是兼容软链接，桌面端和 Web 保持独立 Node 工程，FastAPI 与 Celery 继续共享一个 Python 工程。根目录只保留跨应用测试、统一脚本、文档和仓库级配置，所有入口使用目标目录的显式路径。

**Tech Stack:** Electron 37、Vite 6、React、Next.js 15、FastAPI、Celery、Pytest、Vitest、Docker Compose、Shell

**Spec:** `docs/superpowers/specs/2026-09-29-aivora-monorepo-directory-restructure-design.md`

## Global Constraints

- 只改变源码组织和路径，不改变业务功能、API 协议、数据库结构、端口或用户交互。
- 不引入 npm workspace、Turborepo、新包管理器或新的业务依赖。
- 不保留旧目录软链接或重复源码。
- 本地 `services/backend/.env.local` 必须继续可用且不得进入 Git。
- 桌面端继续使用 `54321`，Web 继续使用 `3000`，API 继续使用 `18000`。
- 所有 Git 提交采用“类型前缀 + 中文说明”。
- 生产 Dockerfile、生产 Compose、Caddy 和 GitHub Actions 不属于本计划。

## Review Focus

- Electron 编译后 `__dirname` 层级变化时，开发图标、原生音频文件、Preload 和 `dist/index.html` 均能正确解析。
- 从 `deploy/compose.dev.yml` 启动时，Compose 相对路径全部基于仓库根目录，不会挂载不存在的 `deploy/backend`。
- Python 测试从仓库根目录运行时，`app` 指向 `services/backend/app`，Flyway 测试读取新的迁移目录。
- 本地 `.env.local` 在后端目录迁移后仍存在，但 `git status --ignored` 明确显示其被忽略。
- 老目录不存在时，统一启动脚本和契约测试不再引用 `backend/`、`web/`、`electron/` 或根级桌面构建产物。

---

### Task 1: 建立目录布局契约并迁移桌面客户端

**Files:**
- Create: `tests/e2e/test_repository_layout.sh`
- Move: `src/` -> `apps/desktop/src/`
- Move: `electron/` -> `apps/desktop/electron/`
- Move: `shared/` -> `apps/desktop/shared/`
- Move: `assets/` -> `apps/desktop/assets/`
- Move: `index.html` -> `apps/desktop/index.html`
- Move: `config.json` -> `apps/desktop/config.json`
- Move: `config.local.example.json` -> `apps/desktop/config.local.example.json`
- Move: `package.json` -> `apps/desktop/package.json`
- Move: `package-lock.json` -> `apps/desktop/package-lock.json`
- Move: `tsconfig.json` -> `apps/desktop/tsconfig.json`
- Move: `vite.config.ts` -> `apps/desktop/vite.config.ts`
- Move: `vitest.config.ts` -> `apps/desktop/vitest.config.ts`
- Create: `apps/desktop/test/setup.ts`
- Modify: `apps/desktop/vitest.config.ts`

**Interfaces:**
- Consumes: 当前根级 Electron/Vite 工程和现有 `npm` 脚本。
- Produces: 可从 `apps/desktop` 独立安装、测试、检查和构建的桌面客户端。

- [ ] **Step 1: 写目录布局失败测试**

新增可执行 Shell 测试，断言 `apps/desktop`、`apps/web`、`services/backend`、`deploy/compose.dev.yml` 存在，并断言根级 `src`、`electron`、`shared`、`assets`、`web`、`backend`、`package.json`、`docker-compose.yml` 不存在。

- [ ] **Step 2: 运行测试并确认迁移前失败**

Run: `bash tests/e2e/test_repository_layout.sh`  
Expected: FAIL，首个错误为 `apps/desktop` 不存在。

- [ ] **Step 3: 使用 Git 移动桌面端源码和工程配置**

创建 `apps/desktop`，将 Files 列表中的根级桌面端内容移动进去；不移动根级 `tests`、`scripts`、`docs` 或 `.gitignore`。

- [ ] **Step 4: 修正桌面端测试初始化文件**

将现有 `apps/web/test/setup.ts` 的通用 Jest DOM 初始化复制为 `apps/desktop/test/setup.ts`，并把 `apps/desktop/vitest.config.ts` 的 `setupFiles` 改为 `./test/setup.ts`，使桌面测试不依赖 Web 工程目录。

- [ ] **Step 5: 安装桌面依赖并验证内部相对路径**

Run: `npm install --prefix apps/desktop`  
Expected: exit 0，依赖只生成在 `apps/desktop/node_modules`。

- [ ] **Step 6: 运行桌面端测试、类型检查和构建**

Run: `npm --prefix apps/desktop test && npm --prefix apps/desktop run typecheck && npm --prefix apps/desktop run build`  
Expected: 全部 exit 0，并生成 `apps/desktop/dist/index.html`、`apps/desktop/dist-electron/electron/main.js`。

- [ ] **Step 7: 验证 Electron 运行时资源路径**

运行现有 Electron 路径契约测试的迁移版，断言编译后的配置引用、Preload、图标、Renderer 和原生音频候选路径都以 `apps/desktop` 为应用根。

- [ ] **Step 8: 提交桌面端迁移**

```bash
git add apps/desktop tests/e2e/test_repository_layout.sh tests/e2e/test_electron_paths.sh tests/e2e/test_devtools_policy.sh tests/e2e/test_desktop_auth_contract.sh tests/e2e/test_remote_pairing_contract.sh
git commit -m "refactor: 迁移桌面客户端到独立应用目录"
```

### Task 2: 迁移 Next.js Web 应用

**Files:**
- Move: `web/` -> `apps/web/`
- Modify: `tests/e2e/test_repository_layout.sh`
- Modify: `scripts/start-aivora.sh`
- Modify: `AGENT.md`

**Interfaces:**
- Consumes: `apps/web/package.json` 中已有 Next.js 命令。
- Produces: 可从 `apps/web` 独立安装、测试、构建和启动的管理端/用户端。

- [ ] **Step 1: 扩展目录布局测试**

断言 `apps/web/app`、`apps/web/components`、`apps/web/package.json` 存在，且根级 `web` 不存在。

- [ ] **Step 2: 运行测试并确认 Web 尚未迁移**

Run: `bash tests/e2e/test_repository_layout.sh`  
Expected: FAIL，错误指向 `apps/web`。

- [ ] **Step 3: 使用 Git 移动 Web 源码**

将被追踪的 `web` 工程移动到 `apps/web`；忽略并清理 `.next*`、`node_modules`、`output` 和 `*.tsbuildinfo`，不把生成物带入新目录。

- [ ] **Step 4: 更新 Web 开发入口文档和启动路径**

将当前操作说明及 `scripts/start-aivora.sh` 中的 `web` 前缀改为 `apps/web`，screen 会话名和端口不变。

- [ ] **Step 5: 安装并验证 Web**

Run: `npm install --prefix apps/web && npm --prefix apps/web test --if-present && npm --prefix apps/web run build`  
Expected: exit 0；Next.js 构建产物位于 `apps/web/.next`。

- [ ] **Step 6: 提交 Web 迁移**

```bash
git add apps/web scripts/start-aivora.sh AGENT.md tests/e2e/test_repository_layout.sh
git commit -m "refactor: 迁移管理端到独立应用目录"
```

### Task 3: 迁移后端并修正 Python 测试入口

**Files:**
- Move: `backend/` -> `services/backend/`
- Modify: `tests/tasks/conftest.py`
- Modify: `tests/tasks/test_migration_guard.py`
- Modify: `tests/e2e/test_worker_startup_config.py`
- Modify: `tests/e2e/test_screenshot_to_answer.py`
- Modify: `tests/connectivity/*.py`
- Create: `tests/conftest.py`
- Modify: `scripts/start-aivora.sh`
- Modify: `docs/本地开发与验收.md`
- Modify: `AGENT.md`

**Interfaces:**
- Consumes: `services/backend/app` Python 包与 `services/backend/db/migrations`。
- Produces: 从仓库根目录运行时可导入 `app` 的 Pytest 环境，以及从后端目录启动的 API 和 Worker。

- [ ] **Step 1: 为新 Python 根目录添加失败断言**

在根级 `tests/conftest.py` 中把 `services/backend` 插入 `sys.path`，并在布局测试中断言新目录存在、旧目录不存在；迁移前布局测试应失败。

- [ ] **Step 2: 使用 Git 移动后端工程并保留本地环境文件**

移动到 `services/backend`，确认 `.env.local` 同步位于新目录且仍被 `.gitignore` 忽略；不提交 `.pytest_cache`、`*.egg-info`、`__pycache__` 或 `.DS_Store`。

- [ ] **Step 3: 修正迁移文件和 Compose 配置测试路径**

把 Python 测试中的 `backend/db/migrations` 改为 `services/backend/db/migrations`，并让 Worker 启动配置测试读取 `deploy/compose.dev.yml`。

- [ ] **Step 4: 修正后端启动脚本和当前操作文档**

统一使用 `ROOT_DIR/services/backend`，保留 `PYTHONPATH=$PWD`、现有 Uvicorn/Celery 参数、端口和 screen 会话名。

- [ ] **Step 5: 运行无需基础设施的后端测试**

Run: `PYTHONPATH=services/backend pytest -q tests/connectivity tests/prompts tests/e2e/test_screenshot_to_answer.py tests/e2e/test_worker_startup_config.py`  
Expected: exit 0。

- [ ] **Step 6: 验证本地私密配置未被追踪**

Run: `git check-ignore -v services/backend/.env.local && test -f services/backend/.env.local`  
Expected: 两条检查均成功，`git status --short` 不包含该文件。

- [ ] **Step 7: 提交后端迁移**

```bash
git add services/backend tests scripts/start-aivora.sh docs/本地开发与验收.md AGENT.md
git commit -m "refactor: 迁移后端服务到独立服务目录"
```

### Task 4: 迁移开发 Compose 并统一仓库入口

**Files:**
- Move: `docker-compose.yml` -> `deploy/compose.dev.yml`
- Modify: `deploy/compose.dev.yml`
- Modify: `scripts/start-aivora.sh`
- Modify: `scripts/check-aivora.sh`
- Modify: `tests/e2e/test_service_scripts.sh`
- Modify: `tests/e2e/test_worker_startup_config.py`
- Create: `README.md`
- Modify: `.gitignore`

**Interfaces:**
- Consumes: `apps/desktop`、`apps/web`、`services/backend` 的固定目录。
- Produces: `docker compose -f deploy/compose.dev.yml` 开发基础设施入口和根级开发说明。

- [ ] **Step 1: 扩展 Compose 路径契约测试**

在 `test_worker_startup_config.py` 中断言 API/Worker 工作目录为 `/workspace/services/backend`、Web 工作目录为 `/workspace/apps/web`、Flyway 挂载源为 `../services/backend/db/migrations` 或等效的仓库根解析路径，并断言生产依赖仍未暴露给业务代码。

- [ ] **Step 2: 运行测试并确认旧 Compose 路径失败**

Run: `PYTHONPATH=services/backend pytest -q tests/e2e/test_worker_startup_config.py`  
Expected: FAIL，错误指向 Compose 文件或旧工作目录。

- [ ] **Step 3: 移动并修正开发 Compose**

将 Compose 移到 `deploy/compose.dev.yml`，使用 `${PROJECT_ROOT:-..}` 或从 `deploy` 出发的明确相对路径修正 Flyway、环境文件、源码挂载和工作目录；保持服务名、容器名和本地端口不变。

- [ ] **Step 4: 更新统一脚本和测试**

让脚本通过 `docker compose --project-directory "$ROOT_DIR" -f "$ROOT_DIR/deploy/compose.dev.yml"` 或等效方式稳定解析仓库根，Shell 契约测试断言所有新路径。

- [ ] **Step 5: 添加根级 README**

记录目录职责、安装命令、统一启停命令、桌面/Web/后端单独运行命令，以及 `deploy/compose.dev.yml` 仅用于开发的说明。

- [ ] **Step 6: 更新忽略规则**

将旧目录特定规则改成新路径或通用递归规则，覆盖 `apps/*/node_modules`、桌面构建、Next 构建、Python 缓存和本地环境文件。

- [ ] **Step 7: 验证 Compose 和脚本**

Run: `docker compose --project-directory "$PWD" -f deploy/compose.dev.yml config --quiet && bash tests/e2e/test_service_scripts.sh && bash tests/e2e/test_repository_layout.sh`  
Expected: 全部 exit 0。

- [ ] **Step 8: 提交部署入口迁移**

```bash
git add deploy scripts tests/e2e README.md .gitignore
git commit -m "chore: 统一单仓开发与部署入口"
```

### Task 5: 更新当前文档并完成全量验收

**Files:**
- Modify: `AGENT.md`
- Modify: `docs/本地开发与验收.md`
- Modify: `docs/superpowers/specs/2026-09-29-aivora-monorepo-directory-restructure-design.md`
- Modify: `docs/superpowers/plans/2026-09-29-aivora-monorepo-directory-restructure.md`

**Interfaces:**
- Consumes: 前四个任务产生的新目录和命令。
- Produces: 无旧操作入口、可复现验证结果和干净 Git 状态的完整单仓。

执行状态：已完成。由于任务 2 收尾时旧 Web 进程重新生成了被忽略的 `web/.next`，先停止孤儿 `next-server` 并清理旧缓存，再按 `apps/web` 重新构建；Compose 校验使用项目名 `aivora`，以兼容当前 Docker Compose 版本。

- [ ] **Step 1: 搜索仍会被执行的旧路径引用**

Run: `rg -n "(^|[ ./])(backend|web|electron|src|shared|assets)/|docker-compose\\.yml" AGENT.md README.md scripts tests deploy apps services docs/本地开发与验收.md`  
Expected: 只允许解释历史路径的文本，不允许当前命令或程序引用旧目录。

- [ ] **Step 2: 更新当前工程文档**

将 AGENT、README 和本地验收文档中的目录、命令、构建产物和 screen 启动路径改为新结构；历史 specs/plans 不做机械重写。

- [ ] **Step 3: 运行桌面端全量验证**

Run: `npm --prefix apps/desktop test && npm --prefix apps/desktop run typecheck && npm --prefix apps/desktop run build`  
Expected: 全部 exit 0。

- [ ] **Step 4: 运行 Web 全量验证**

先停止 `aivora-web`，再运行：`npm --prefix apps/web run build && npm --prefix apps/web run e2e -- --list`  
Expected: 构建成功，Playwright 能列出测试；验收后恢复 Web 服务。

- [ ] **Step 5: 运行后端和跨服务测试**

Run: `PYTHONPATH=services/backend pytest -q`  
Expected: 所有不依赖缺失外部服务的测试通过；依赖 PostgreSQL/Redis/MinIO 的测试必须在本项目容器健康时运行。

- [ ] **Step 6: 运行工程完整性检查**

Run: `bash tests/e2e/test_repository_layout.sh && bash tests/e2e/test_service_scripts.sh && bash tests/e2e/test_electron_paths.sh && git diff --check`  
Expected: 全部 exit 0。

- [ ] **Step 7: 重启并检查本地服务**

Run: `scripts/stop-aivora.sh && scripts/start-aivora.sh && scripts/check-aivora.sh`  
Expected: `aivora-dev`、`aivora-web`、`aivora-backend`、`aivora-worker` 均运行，`54321`、`3000`、`18000` 可访问，API `/health/ready` 成功。

- [ ] **Step 8: 确认 Git 清洁边界**

Run: `git status --short --ignored`  
Expected: 仅显示新目录中的依赖、构建、缓存和本地环境文件为 ignored，不出现根级旧生成物或意外未追踪文件。

- [ ] **Step 9: 更新计划状态并提交最终文档**

```bash
git add AGENT.md README.md docs/本地开发与验收.md docs/superpowers/specs/2026-09-29-aivora-monorepo-directory-restructure-design.md docs/superpowers/plans/2026-09-29-aivora-monorepo-directory-restructure.md
git commit -m "docs: 更新单仓目录与开发验收说明"
```
