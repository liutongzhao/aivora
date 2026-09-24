# AGENT.md

这是 QuizCoze 本地开发工程的协作约定，供项目维护者和 Codex 在后续窗口中共享上下文。

## 项目定位

- 项目是 Electron 桌面客户端，不是带本地 HTTP 后端的传统前后端项目。
- Renderer 使用 React、TypeScript、Vite。
- Electron Main 进程负责窗口、截图、全局快捷键、本地配置、认证协调和 IPC。
- Preload 通过 `contextBridge` 暴露 `window.electronAPI`。
- AI、认证、积分、用户配置和远程控制接口由远程服务提供，当前工程主要保存客户端实现。

## 主要目录

- `src/`：React Renderer 页面、组件、Hooks、服务和工具。
- `electron/`：Electron Main、Preload、本地系统能力和 IPC。
- `electron/native/`：macOS 原生能力，目前包含 Swift 音频采集代码。
- `shared/`：前端和 Electron 共用的类型及快捷键定义。
- `assets/`：运行时静态资源和图标。
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

## 当前工程状态

- 当前源码已经可以从源码开发启动。
- `npm run typecheck` 和 `npm run build` 已验证通过。
- 历史恢复目录 `recovered-source/` 和 `recovered-build/` 已清理。
- `RECOVERY_NOTES.md` 已由本文件取代，不再作为项目约定文件。
