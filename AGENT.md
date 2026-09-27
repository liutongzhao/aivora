# AGENT.md

这是 Aivora 本地开发工程的协作约定，供项目维护者和 Codex 在后续窗口中共享上下文。

## 项目定位

- 项目是 Electron 桌面客户端 + Next.js Web 管理端 + FastAPI 模块化单体 API + Celery Worker 的本地全栈工程。
- Renderer 使用 React、TypeScript、Vite；Web 使用 Next.js、React、TypeScript。
- Electron Main 进程负责窗口、截图、全局快捷键、本地配置、认证协调和 IPC。
- Preload 通过 `contextBridge` 暴露 `window.electronAPI`。
- API、认证、AI 任务、SSE、远程控制和管理后台均由本地服务提供；OpenAI 兼容模型是唯一外部 AI 依赖。

## 主要目录

- `src/`：React Renderer 页面、组件、Hooks、服务和工具。
- `electron/`：Electron Main、Preload、本地系统能力和 IPC。
- `electron/native/`：macOS 原生能力，目前包含 Swift 音频采集代码。
- `shared/`：前端和 Electron 共用的类型及快捷键定义。
- `assets/`：运行时静态资源和图标。
- `assets/branding/`：Aivora Logo 母版、应用图标、小尺寸图标和单色图标资源。
- `docs/`：架构设计和开发计划。
- `dist/`、`dist-electron/`：构建产物，不进入 Git。

## 开发命令

```bash
npm install
npm run dev
npm run typecheck
npm run build
npm run start
```

- `npm run dev`：启动 Vite 和 Electron 开发模式；Vite 使用 `127.0.0.1:54321`。
- `npm run typecheck`：检查 Renderer 和 Electron TypeScript。
- `npm run build`：构建 `dist/` 和 `dist-electron/`。
- `npm run start`：启动构建后的 Electron 应用。
- 修改 `src/` 通常由 Vite 热更新；修改 `electron/` 后重启 `npm run dev`。

## 修改约定

1. 保持现有业务逻辑、远程接口协议、认证流程和窗口行为，除非用户明确要求改变。
2. 修改 IPC 时同时检查 `electron/preload.ts`、`electron/ipcHandlers.ts` 和对应 Renderer 调用方。
3. 修改 AI 请求时同时检查 `src/services/aiService.ts`、`src/services/sseService.ts` 和 `src/hooks/useAIProcessing.ts`。
4. 新增跨层数据结构时优先放在 `src/types/` 或 `shared/`，不要在多个文件中重复定义。
5. 不要把 `node_modules/`、`dist/`、`dist-electron/`、日志和本地缓存提交到 Git。
6. 处理恢复源码时优先做兼容性修复和最小改动，避免无关的大规模重构。
7. 需要删除文件或目录时先确认其是否被源码、构建脚本或运行时路径引用。

## 验证要求

在声称修改完成前，根据改动范围执行：

```bash
npm run typecheck
npm run build
```

涉及启动链路时额外验证：

```bash
npm run dev
npm run start
```

如果验证失败，要说明失败命令、首个实际错误和是否属于已有恢复代码问题。

## Git 约定

- 默认分支：`main`。
- 当前代码分支：`main`。
- 每次切换 Git 分支后，必须同步更新本文件中的“当前代码分支”记录，并提交这次文档变更。
- 每次完成一个可独立说明的修改后创建清晰的提交。
- 提交信息使用“常见分类前缀 + 中文说明”的格式。前缀用于区分提交目的，说明部分必须使用中文，例如：

```text
fix: 修复 Electron 生产环境资源路径
feat: 新增远程配对状态面板
docs: 更新开发文档
```

- 常用前缀：
  - `feat`：新增功能
  - `fix`：修复问题
  - `refactor`：重构代码
  - `docs`：文档修改
  - `chore`：工程配置、依赖或维护性修改
  - `style`：格式或样式调整
  - `perf`：性能优化
  - `test`：测试相关修改

- 提交前检查：

```bash
git status
git diff --stat
git diff
```

## 服务启动与停止约定

- 用户要求启动或停止服务时，默认只操作当前项目：
  `/Users/liutongzhao/WorkBuddy项目/笔试软件`
- 不启动、不停止、不重启电脑上其他项目或其他无关服务。
- 启动本项目开发服务时，必须使用 `screen` 放到后台运行，避免终端会话结束导致服务中断。
- 停止服务时，只停止本项目创建的 `screen` 会话和其中的进程。
- 启动前先检查本项目是否已有对应 `screen` 会话，避免重复启动。
- 向用户报告服务状态时，提供 `screen` 会话名称、运行命令和端口。

### 当前项目服务会话

- `screen` 会话名称：`aivora-dev`
- 启动命令：`cd "/Users/liutongzhao/WorkBuddy项目/笔试软件" && npm run dev`
- Renderer 地址：`http://127.0.0.1:54321`
- 查看会话：`screen -r aivora-dev`
- 分离会话：按 `Ctrl-A`，再按 `D`
- 停止本项目服务：`screen -S aivora-dev -X quit`
- `screen` 会话名称：`aivora-web`
- 启动命令：`cd "/Users/liutongzhao/WorkBuddy项目/笔试软件" && npm run dev --prefix web -- --hostname 127.0.0.1 --port 3000`
- Web 管理端地址：`http://127.0.0.1:3000`
- 查看会话：`screen -r aivora-web`
- 分离会话：按 `Ctrl-A`，再按 `D`
- 停止本项目 Web 服务：`screen -S aivora-web -X quit`

## 服务与验收

- 统一启停脚本：`scripts/start-aivora.sh`、`scripts/stop-aivora.sh`、`scripts/check-aivora.sh`。
- 详细验收流程记录在 `docs/本地开发与验收.md`。
- 题型提示词位于 `backend/app/prompts/`，答案解析位于 `backend/app/modules/tasks/parser.py`。
- 任务结果同时保存原文、结构化 JSON、解析状态和 warning。

### 修改后同步运行服务

- 完成 Web 前端代码修改后，自动重启本项目的 `aivora-web` 并检查页面 HTTP 状态；完成 Renderer/Electron 代码修改后，自动重启 `aivora-dev` 并检查进程与 `54321` 端口。不要只依赖热更新。
- 完成后端代码修改后，自动重启 `aivora-backend` 和 `aivora-worker`，再检查 API `/health/ready` 与 Worker 进程。仅重启相关应用层 screen，不重启 PostgreSQL、Redis、MinIO。
- 涉及数据库迁移时，先检查迁移历史、在途任务及 Redis 队列；符合迁移前置条件后执行迁移和校验，再重启相关应用服务。遇到在途任务或迁移失败，不强行绕过保护，也不擅自删除任务，应说明阻塞原因。
- 重启前后检查本项目端口和进程。退出 screen 后若留下本项目的孤儿子进程，先确认 PID/命令归属再清理，避免旧进程占端口或两个 Worker 同时消费。
- Web 开发服务运行期间不可并行执行 `npm run build --prefix web`；需要构建时先停 `aivora-web`，构建后再启动并验证页面。报告最终运行态和未完成的迁移。

## 当前工程状态

- 当前源码已经可以从源码开发启动。
- `npm run typecheck` 和 `npm run build` 已验证通过。
- 历史恢复目录 `recovered-source/` 和 `recovered-build/` 已清理。
- `RECOVERY_NOTES.md` 已由本文件取代，不再作为项目约定文件。

## 后端开发本地配置

- 后端 Python 使用 Conda 环境：`aivora-backend`。
- Node.js 使用系统已安装版本，包管理器使用 `npm`。
- 后端模型接口使用 OpenAI 兼容协议。
- 测试模型和接口地址只从本地环境变量读取，不写入 Git。
- API Key 不记录在此文件中；实际密钥放在未追踪的 `.env` 或运行环境变量中。
- 当前默认模型：`gpt-6-sol`。
- 当前默认模型接口地址：`https://ai-pixel.online`。
- PostgreSQL、Redis、MinIO 使用 Aivora 独立 Docker 容器，不启动其他项目的容器。
- MinIO 是文件存储唯一入口，应用不使用本地目录保存截图。
- 后端模块必须保持低耦合，路由、服务、仓储、Provider 和基础设施分层。
- Aivora 后端开发 API 使用 `screen` 会话 `aivora-backend`，地址为 `http://127.0.0.1:18000`。
- 后端 API 启动命令：`cd "/Users/liutongzhao/WorkBuddy项目/笔试软件/backend" && export PYTHONPATH="$PWD" && /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/uvicorn app.main:app --host 127.0.0.1 --port 18000`。
- 后端 Worker 以 `scripts/start-aivora.sh` 为准，使用 `--pool=threads --concurrency=4 --queues=aivora`。
- 后端 API、Worker、Electron、Web 管理端均使用当前项目专属 screen 会话；启动前先检查会话是否已存在，避免重复启动。
- Web 管理端开发服务运行期间不要同时执行 `npm run build --prefix web`，两者共用 `web/.next` 缓存，可能导致开发页出现 `Cannot find module '/833.js'`。需要构建时先停止 `aivora-web`，构建完成后再按记录重新启动。
