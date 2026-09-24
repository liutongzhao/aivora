# 源码开发启动链路设计

## 目标

让当前恢复出的 QuizCoze 源码可以在本地通过 npm 脚本启动、调试和构建，开发模式支持 React 前端热更新与 Electron 主进程加载。

## 当前约束

- Electron 主进程入口是 `electron/main.ts`。
- 前端入口是 `src/main.tsx`。
- 现有主进程开发路径使用 `http://localhost:54321`。
- 生产路径使用 `dist/index.html`。
- 保留现有登录、配置、覆盖层和主窗口路由。
- 不修改现有业务功能、远程接口或窗口行为。

## 设计

### 开发模式

使用 Vite 在 `54321` 端口提供 `src` 前端，并使用 TypeScript 编译 Electron 主进程到 `dist-electron`。主进程通过环境变量识别开发服务器地址，开发模式加载 Vite URL，生产模式加载 `dist/index.html`。

### 构建模式

使用 Vite 构建前端到 `dist`，使用 `tsc` 构建 Electron 主进程到 `dist-electron`。`npm run build` 只负责生成构建产物，不自动启动应用；`npm run start` 从构建产物启动 Electron。

### 调试体验

- `npm run dev`：同时启动 Vite、Electron 主进程编译监视和 Electron 应用。
- `npm run typecheck`：检查前端和 Electron TypeScript。
- `npm run build`：构建前端和主进程。
- `npm run start`：启动构建后的 Electron 应用。

### 依赖和配置

补充 Vite、React 插件、Electron、TypeScript、并发进程和等待工具。开发配置放在仓库根目录，Electron 的输出目录与现有 `main.ts` 路径约定保持一致。

## 验收标准

1. `npm install` 成功。
2. `npm run typecheck` 成功，或只报告已知的恢复源码类型问题并明确列出。
3. `npm run build` 生成 `dist/index.html` 和 `dist-electron/main.js`。
4. `npm run dev` 能启动本地 Electron 窗口，前端加载 `54321` 端口页面。
5. `npm run start` 能从构建产物启动。
