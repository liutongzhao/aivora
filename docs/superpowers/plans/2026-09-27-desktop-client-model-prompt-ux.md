# 桌面端模型与提示词体验重构实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将客户端设置中心重构为清晰的桌面应用信息架构，并加入与外部端共享服务端数据的模型、题型分配、提示词和连接管理。

**Architecture:** 保留 Electron Main、React Renderer、现有 `/api/user/*` 后端协议和快捷键底层机制。先建立类型安全的用户配置 API 服务，再将设置页拆成工作台、快捷键、模型与提示词、窗口、连接、账户六个页面；模型与提示词页面内部使用模型、题型分配、提示词、连接选择四个标签。客户端不新增独立配置存储，服务端用户配置作为唯一来源。

**Tech Stack:** React 18, TypeScript, Electron, Vite, Vitest, Testing Library, Lucide。

**Spec:** `docs/superpowers/specs/2026-09-27-desktop-client-ux-redesign-design.md`

## Global Constraints

- 不改变后端接口和 AI 任务协议。
- 不改变快捷键底层注册机制。
- 不删除远程控制、兼容性检测、自动更新等功能。
- 不在本阶段引入新的 UI 框架或大规模依赖。
- 设置窗口使用浅色中性视觉，考试窗口保持深色高对比视觉。
- 常态页面不展示长段教程和重复说明。
- 卡片和控件圆角控制在 `6px` 到 `8px`。
- 客户端和外部端共享服务端用户配置，不复制独立模型或提示词存储。
- 所有 Git 提交信息使用中文。

## Review Focus

- 未登录、会话过期或配置请求返回 `401` 时，页面应保留清晰的登录恢复路径，不显示空白设置页。
- 停用连接、停用模型或模型不支持图片时，题型分配不能保存无效配置，并在当前行显示可执行的错误。
- 提示词编辑切换题型或页面前存在未保存内容时，必须阻止静默丢失。
- 外部端已更新模型或提示词后，客户端刷新应以服务端数据为准，不能用旧的本地状态覆盖服务端。
- `800x600` 及窄窗口下导航、表格行、编辑表单和提示词编辑器不能横向溢出或遮挡主要操作。

---

### Task 1: 建立用户配置类型与 API 服务

**Files:**
- Create: `src/types/userConfig.ts`
- Create: `src/services/userConfigService.ts`
- Test: `src/services/userConfigService.test.ts`
- Modify: `src/types/api.ts`

**Interfaces:**
- Consumes: `apiFetch<T>()` from `src/services/apiClient.ts`.
- Produces: typed `Connection`, `UserModel`, `QuestionModelDefault`, `PromptVersion`, `PromptMode`, and `userConfigService` methods for later pages.

- [ ] **Step 1: Write failing service tests**
  - Assert `listConnections()` requests `GET /api/user/connections`.
  - Assert `syncConnection(id)` requests `POST /api/user/connections/{id}/test` and returns discovered model names.
  - Assert `listModels()`, `listDefaults()`, and `listPromptVersions(mode)` use the existing user endpoints.
  - Assert `savePrompt(mode, content)` sends `POST /api/user/prompts/{mode}` with JSON content.
  - Assert `setModelDefault(mode, modelId, language)` sends the expected `PUT` payload.

- [ ] **Step 2: Run the service tests and confirm they fail**

  Run: `npm test -- --run src/services/userConfigService.test.ts`

  Expected: FAIL because the typed service module does not exist.

- [ ] **Step 3: Implement the typed configuration contract**
  - Define `PromptMode` as the five backend modes: `programming`, `single_choice`, `multiple_choice`, `universal`, `debug`.
  - Define response types matching the existing backend fields, including UUID strings, `enabled`, `supports_vision`, `version`, and `content`.
  - Implement one method per existing endpoint: connections, connection test, connection create/update/disable, models, model create/update/test/disable, defaults, prompt versions, and prompt save.
  - Keep request path construction inside the service rather than in React components.

- [ ] **Step 4: Run service tests, existing API tests, and typecheck**

  Run: `npm test -- --run src/services/userConfigService.test.ts src/services/apiClient.test.ts && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/types/userConfig.ts src/types/api.ts src/services/userConfigService.ts src/services/userConfigService.test.ts
  git commit -m "重构：建立客户端用户配置服务"
  ```

### Task 2: 重构客户端导航和页面壳

**Files:**
- Modify: `src/components/ClientShell/ClientSidebar.tsx`
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `src/client-presentation.css`
- Test: `src/components/ClientShell/ClientShell.test.tsx`
- Test: `src/_pages/ConfigPage.test.tsx`

**Interfaces:**
- Consumes: `ClientSection` and the typed configuration service from Task 1.
- Produces: six-section navigation with stable section selection and compact page content regions.

- [ ] **Step 1: Write failing navigation tests**
  - Assert the sidebar renders `工作台`, `快捷键`, `模型与提示词`, `窗口`, `连接`, `账户`.
  - Assert `外观与系统` and `远程控制` are not navigation items.
  - Assert selecting each navigation item updates the active section and visible page heading.
  - Assert the workbench first viewport still exposes account state, service state, and `开始使用`.

- [ ] **Step 2: Run navigation tests and confirm they fail**

  Run: `npm test -- --run src/components/ClientShell/ClientShell.test.tsx src/_pages/ConfigPage.test.tsx`

  Expected: FAIL because the current sidebar only exposes three sections and the page uses scroll anchors.

- [ ] **Step 3: Implement route-like in-page section switching**
  - Expand `ClientSection` to `overview`, `shortcuts`, `models`, `window`, `connection`, and `account`.
  - Replace scroll-only navigation with one visible section at a time while preserving existing Electron handlers.
  - Keep the title bar and window controls unchanged.
  - Move remote pairing, compatibility, and update actions behind `connection`.
  - Move theme, transparency, zoom, window size, and position actions behind `window`.
  - Keep account status and logout in `account`; keep only primary launch and concise status in `overview`.

- [ ] **Step 4: Run navigation tests and typecheck**

  Run: `npm test -- --run src/components/ClientShell/ClientShell.test.tsx src/_pages/ConfigPage.test.tsx && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ClientShell/ClientSidebar.tsx src/_pages/ConfigPage.tsx src/client-presentation.css src/components/ClientShell/ClientShell.test.tsx src/_pages/ConfigPage.test.tsx
  git commit -m "重构：调整客户端设置中心导航"
  ```

### Task 3: 构建模型与提示词中心的模型页

**Files:**
- Create: `src/components/ModelPromptCenter/ModelPromptCenter.tsx`
- Create: `src/components/ModelPromptCenter/ModelList.tsx`
- Create: `src/components/ModelPromptCenter/ModelEditor.tsx`
- Create: `src/components/ModelPromptCenter/modelPromptTypes.ts`
- Test: `src/components/ModelPromptCenter/ModelList.test.tsx`
- Test: `src/components/ModelPromptCenter/ModelPromptCenter.test.tsx`

**Interfaces:**
- Consumes: `userConfigService.listConnections`, `listModels`, `syncConnection`, `createModel`, `updateModel`, `testModel`, `disableModel`.
- Produces: a compact model list/details view with connection selection, discovered-model import, manual model editing, enable/disable, and test feedback.

- [ ] **Step 1: Write failing model-center tests**
  - Assert entering the model page loads connections and models from the service.
  - Assert only enabled connections can be selected for model management.
  - Assert syncing displays discovered model names as pending items and does not add them automatically.
  - Assert clicking `添加` creates a model with the selected connection.
  - Assert editing, enabling, disabling, testing, and deleting use the typed service methods.
  - Assert a disabled model cannot be selected as a new default.

- [ ] **Step 2: Run model-center tests and confirm they fail**

  Run: `npm test -- --run src/components/ModelPromptCenter/ModelList.test.tsx src/components/ModelPromptCenter/ModelPromptCenter.test.tsx`

  Expected: FAIL because the model center components do not exist.

- [ ] **Step 3: Implement the model page**
  - Use a compact list on the left and selected-model details on the right at desktop widths.
  - Collapse to a single-column list with an editor dialog or inline detail panel below the list at narrow widths.
  - Use one primary accent color; use neutral secondary actions and red only for destructive actions.
  - Show model display name, provider connection, vision support, enabled state, and model ID without explanatory paragraphs.
  - Keep API keys out of the model page.
  - Treat synced provider model names as explicit import actions.
  - Implement prompt-safe loading states so refreshes replace displayed data only after a successful response.

- [ ] **Step 4: Run model-center tests and typecheck**

  Run: `npm test -- --run src/components/ModelPromptCenter && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ModelPromptCenter
  git commit -m "新增：客户端模型管理中心"
  ```

### Task 4: 构建题型分配和提示词管理

**Files:**
- Create: `src/components/ModelPromptCenter/ModelRoutingPanel.tsx`
- Create: `src/components/ModelPromptCenter/PromptEditor.tsx`
- Test: `src/components/ModelPromptCenter/ModelRoutingPanel.test.tsx`
- Test: `src/components/ModelPromptCenter/PromptEditor.test.tsx`

**Interfaces:**
- Consumes: `userConfigService.listModels`, `listDefaults`, `setModelDefault`, `listPromptVersions`, `savePrompt`.
- Produces: mode-based routing rows and version-aware prompt editing.

- [ ] **Step 1: Write failing routing and prompt tests**
  - Assert routing renders all five modes with the correct Chinese labels.
  - Assert programming and debug rows show language selection; other modes do not.
  - Assert selecting a model sends `model_id` and the current language.
  - Assert disabled or non-vision models are excluded from routing options.
  - Assert prompt mode changes load the newest version.
  - Assert saving creates a new prompt version and shows saved state.
  - Assert changing mode with unsaved content requires save or discard and never silently loses text.
  - Assert restoring a previous version loads its content into the editor and saves it as a new version when confirmed.

- [ ] **Step 2: Run tests and confirm they fail**

  Run: `npm test -- --run src/components/ModelPromptCenter/ModelRoutingPanel.test.tsx src/components/ModelPromptCenter/PromptEditor.test.tsx`

  Expected: FAIL because routing and prompt components do not exist.

- [ ] **Step 3: Implement routing and prompt editing**
  - Use compact rows with `题型`, `模型`, `输出语言`, and inline save status.
  - Derive selectable models from enabled models that support vision and belong to enabled connections.
  - Load prompt versions newest-first and expose version metadata without turning the page into a history table.
  - Save edits through `savePrompt`; treat restore as loading an earlier version into the editor and creating a new version only after confirmation.
  - Add a dirty-state guard before changing mode or leaving the model center.

- [ ] **Step 4: Run tests, typecheck, and renderer build**

  Run: `npm test -- --run src/components/ModelPromptCenter/ModelRoutingPanel.test.tsx src/components/ModelPromptCenter/PromptEditor.test.tsx && npm run typecheck && npm run build`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ModelPromptCenter/ModelRoutingPanel.tsx src/components/ModelPromptCenter/PromptEditor.tsx src/components/ModelPromptCenter/ModelRoutingPanel.test.tsx src/components/ModelPromptCenter/PromptEditor.test.tsx
  git commit -m "新增：支持题型分配与提示词管理"
  ```

### Task 5: 收敛连接页面和客户端配置同步

**Files:**
- Create: `src/components/ConnectionSettings/ConnectionSettings.tsx`
- Create: `src/components/ConnectionSettings/ConnectionEditor.tsx`
- Test: `src/components/ConnectionSettings/ConnectionSettings.test.tsx`
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `src/components/RemotePairingPanel.tsx`

**Interfaces:**
- Consumes: `userConfigService` connection methods and existing Electron remote-control/update/compatibility APIs.
- Produces: a dedicated connection page containing provider connections, connection testing/model discovery, remote pairing, compatibility checks, and update status.

- [ ] **Step 1: Write failing connection tests**
  - Assert connection list loads without exposing API key values.
  - Assert new connection form validates name, URL, and API key before submission.
  - Assert editing preserves the existing key when the key field is blank.
  - Assert connection test reports discovered model names without importing them.
  - Assert disabled connections cannot be selected in the model center.
  - Assert remote pairing generation, copy, expiry, regeneration, and disconnect remain available.

- [ ] **Step 2: Run tests and confirm they fail**

  Run: `npm test -- --run src/components/ConnectionSettings/ConnectionSettings.test.tsx`

  Expected: FAIL because the dedicated connection components do not exist.

- [ ] **Step 3: Implement the connection page**
  - Move current connection form and list behavior out of the monolithic `ConfigPage`.
  - Keep the API key write-only and never render it from server responses.
  - Keep connection test and model discovery visually secondary to connection status.
  - Render remote pairing as a compact connection tool, preserving existing countdown and clipboard behavior.
  - Keep update and compatibility checks as rows or modal entry points, not permanent large panels.

- [ ] **Step 4: Run connection tests and typecheck**

  Run: `npm test -- --run src/components/ConnectionSettings/ConnectionSettings.test.tsx && npm run typecheck`

  Expected: PASS. The existing remote pairing behavior is covered by the connection test assertions and the full renderer suite in Task 7.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/ConnectionSettings src/_pages/ConfigPage.tsx src/components/RemotePairingPanel.tsx
  git commit -m "重构：整理客户端连接与同步设置"
  ```

### Task 6: 完成窗口、账户和快捷键页面迁移

**Files:**
- Create: `src/components/WindowSettings/WindowSettings.tsx`
- Create: `src/components/AccountSettings/AccountSettings.tsx`
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `src/components/Settings/SettingsDialog.tsx`
- Test: `src/components/WindowSettings/WindowSettings.test.tsx`
- Test: `src/components/AccountSettings/AccountSettings.test.tsx`
- Test: `src/_pages/ConfigPage.shortcuts.test.tsx`

**Interfaces:**
- Consumes: existing Electron theme/window/auth/update APIs and the shortcut behavior currently implemented in `ConfigPage`.
- Produces: dedicated window and account pages; shortcut page remains focused on task groups and retains keyboard/mouse recording, conflict detection, restore defaults, and testing.

- [ ] **Step 1: Write failing migration tests**
  - Assert window settings expose theme, transparency, zoom, size, and position restore in one page.
  - Assert account settings expose user identity, version, update check, logout, and loading/error behavior.
  - Assert shortcut groups remain visible without long explanatory tips.
  - Assert advanced shortcuts stay collapsed by default and conflict feedback remains beside the active row.
  - Assert `SettingsDialog` no longer renders a competing full settings surface.

- [ ] **Step 2: Run tests and confirm they fail**

  Run: `npm test -- --run src/components/WindowSettings/WindowSettings.test.tsx src/components/AccountSettings/AccountSettings.test.tsx src/_pages/ConfigPage.shortcuts.test.tsx`

  Expected: FAIL because the settings are still hosted in `ConfigPage` and `SettingsDialog`.

- [ ] **Step 3: Implement page extraction and cleanup**
  - Move theme selection and window controls into `WindowSettings`.
  - Move account, version, update, and logout actions into `AccountSettings`.
  - Keep shortcut recording logic and identifiers unchanged while rendering compact task groups.
  - Remove duplicate full settings presentation from `SettingsDialog`; retain only overlay-specific quick settings if still required.
  - Use shared button, row, status, and modal styles across all settings pages.

- [ ] **Step 4: Run focused tests and typecheck**

  Run: `npm test -- --run src/components/WindowSettings src/components/AccountSettings src/_pages/ConfigPage.shortcuts.test.tsx && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/components/WindowSettings src/components/AccountSettings src/_pages/ConfigPage.tsx src/components/Settings/SettingsDialog.tsx src/_pages/ConfigPage.shortcuts.test.tsx
  git commit -m "重构：拆分窗口账户与快捷键设置"
  ```

### Task 7: 统一视觉密度并验证桌面窗口

**Files:**
- Modify: `src/client-presentation.css`
- Modify: `src/index.css`
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `src/components/ModelPromptCenter/*.tsx`
- Modify: `src/components/ConnectionSettings/*.tsx`
- Test: `src/_pages/ConfigPage.visual.test.tsx`

**Interfaces:**
- Consumes: all page components from Tasks 2-6.
- Produces: a consistent neutral desktop visual system and verified responsive settings center.

- [ ] **Step 1: Write failing visual-structure tests**
  - Assert regular settings use compact rows instead of repeated oversized cards.
  - Assert all primary controls use the same button height and accent treatment.
  - Assert the model, routing, prompt, and connection pages expose page headings and tab labels without duplicated tutorial copy.
  - Assert the settings shell has no horizontal overflow at the supported compact viewport dimensions.

- [ ] **Step 2: Run visual-structure tests and confirm they fail**

  Run: `npm test -- --run src/_pages/ConfigPage.visual.test.tsx`

  Expected: FAIL against the existing mixed button styles, large rounded regions, and long-page content.

- [ ] **Step 3: Apply shared visual tokens**
  - Define neutral surfaces, borders, text hierarchy, spacing, control heights, and state colors in `client-presentation.css`.
  - Limit rounded corners to `6px` to `8px`; remove gradients and competing accent colors.
  - Use icon-only controls where the icon is familiar and add accessible labels/tooltips where needed.
  - Keep destructive actions visually distinct but sparse.
  - Ensure tables, rows, prompt editor, dialogs, and tabs have stable dimensions.

- [ ] **Step 4: Run the full renderer verification**

  Run: `npm test -- --run && npm run typecheck && npm run build`

  Expected: PASS with no TypeScript errors, test failures, or renderer build errors.

- [ ] **Step 5: Verify desktop window states**
  - Start the client using the repository's existing development command.
  - Inspect the settings window at `800x600` and a narrow supported width.
  - Verify each navigation page, model editor, prompt dirty-state guard, connection form, and shortcut recorder.
  - Confirm no content overlaps, primary actions leave the viewport, or page requires unnecessary long scrolling.

- [ ] **Step 6: Commit**

  ```bash
  git add src/client-presentation.css src/index.css src/_pages/ConfigPage.tsx src/_pages/ConfigPage.visual.test.tsx src/components/ModelPromptCenter src/components/ConnectionSettings
  git commit -m "优化：统一客户端设置中心视觉与布局"
  ```

## Self-Review

- **Spec coverage:** The six navigation sections are covered by Tasks 2 and 6; the model center and its four tabs are covered by Tasks 3-5; shared service-side synchronization is covered by Task 1 and the refresh/dirty-state tests in Tasks 3-5; pure shortcut operation remains outside this plan and is preserved by the global constraints and Task 6 regression tests.
- **Step scan:** Each task follows failing test, implementation, verification, and Chinese commit steps. Existing backend endpoints are referenced explicitly; no new protocol is introduced.
- **Type consistency:** `PromptMode`, `UserModel`, `QuestionModelDefault`, and `PromptVersion` originate in Task 1 and are consumed by Tasks 3-5. `ClientSection` is expanded in Task 2 and used by Tasks 5-6.
- **Review focus coverage:** authentication failures are covered by Tasks 2 and 6; invalid model routing by Task 4; prompt dirty state by Task 4; cross-client refresh by Tasks 3-5; compact viewport behavior by Task 7.
- **Proportion:** The plan describes file boundaries, exact service methods, test behaviors, and commit boundaries without prescribing component implementation bodies.
