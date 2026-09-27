# Aivora Desktop Client UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 Aivora 客户端重构为简洁、统一、适合高频桌面使用的设置中心和考试悬浮窗。

**Architecture:** 保留现有 Electron Main、React Renderer 和快捷键底层能力，只重组 Renderer 的信息架构和视觉系统。设置页使用统一的桌面应用 Shell 和侧边导航；考试窗口围绕队列、答案和少量核心操作组织；高级能力通过折叠区、菜单和 tooltip 渐进披露。

**Tech Stack:** React 18, TypeScript, Vite, Tailwind utility classes, existing Lucide icons, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-09-27-desktop-client-ux-redesign-design.md`

## Global Constraints

- 不改变后端接口和 AI 任务协议。
- 不改变快捷键底层注册机制。
- 不删除远程控制、兼容性检测、自动更新等功能。
- 不引入新的 UI 框架或大规模依赖。
- 设置窗口保持浅色中性视觉，考试窗口保持深色高对比视觉。
- 常态页面不展示长段教程和重复说明。
- 卡片和控件圆角控制在 `6px` 到 `8px`。

## Review Focus

- 设置窗口在 `800x600` 和较窄窗口下不能出现横向溢出或关键按钮被挤出。
- 快捷键录入必须继续支持 Command/Ctrl、Shift、Alt 和鼠标辅助键。
- 快捷键冲突时不能保存，并且冲突信息必须出现在当前操作附近。
- 远程连接码生成、复制、过期和结束连接流程不能因布局重构丢失。
- AI 处理中、完成、失败和无截图状态必须仍然能在考试窗口被识别。

---

### Task 1: Establish Desktop Visual Tokens and Shared Shell

**Files:**
- Modify: `src/client-presentation.css`
- Modify: `src/index.css`
- Modify: `src/_pages/ConfigPage.tsx`
- Create: `src/components/ClientShell/ClientTitleBar.tsx`
- Create: `src/components/ClientShell/ClientSidebar.tsx`
- Test: `src/components/ClientShell/ClientShell.test.tsx`

**Interfaces:**
- Produces reusable `ClientTitleBar`, `ClientSidebar`, and visual token classes for later settings sections.
- Keeps existing Electron window control callbacks and theme classes.

- [ ] **Step 1: Write failing shell tests**
  - Assert the shell renders the product name, navigation labels, active navigation item, and window control buttons.
  - Assert the sidebar collapses to the active section without changing the current hash/window behavior.

- [ ] **Step 2: Run the shell tests and confirm they fail**

  Run: `npm test -- --run src/components/ClientShell/ClientShell.test.tsx`

  Expected: FAIL because the shell components do not exist.

- [ ] **Step 3: Add shared visual tokens and shell components**
  - Define neutral surfaces, borders, text hierarchy, accent colors, control heights, and spacing in `client-presentation.css`.
  - Implement a fixed title bar and compact sidebar using existing Lucide icons.
  - Keep title bar controls icon-only with accessible labels.
  - Replace the current settings page outer card treatment with the shell layout.

- [ ] **Step 4: Run shell tests and typecheck**

  Run: `npm test -- --run src/components/ClientShell/ClientShell.test.tsx && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/client-presentation.css src/index.css src/_pages/ConfigPage.tsx src/components/ClientShell
  git commit -m "refactor: add desktop client visual shell"
  ```

### Task 2: Rebuild the Settings Overview

**Files:**
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `src/components/UpdateNotification.tsx`
- Modify: `src/components/RemotePairingPanel.tsx`
- Test: `src/_pages/ConfigPage.test.tsx`

**Interfaces:**
- Consumes the shell from Task 1.
- Produces overview, account, service status, start-client, update, and remote-control sections that later navigation items can target.

- [ ] **Step 1: Write failing overview tests**
  - Assert the first viewport includes account status, service status, and one primary start action.
  - Assert tutorial prose and duplicate instructional banners are not rendered in the normal overview state.
  - Assert update and remote pairing actions remain available.

- [ ] **Step 2: Run the overview tests and confirm they fail**

  Run: `npm test -- --run src/_pages/ConfigPage.test.tsx`

  Expected: FAIL against the current long-form page structure.

- [ ] **Step 3: Implement the overview layout**
  - Replace the long account header with a compact status header.
  - Move update status into a small actionable row.
  - Move remote pairing into its own settings section and keep the code/address visible only after generation.
  - Remove persistent tutorial paragraphs and use concise labels.
  - Keep all existing Electron IPC handlers and loading/error states.

- [ ] **Step 4: Run overview tests and typecheck**

  Run: `npm test -- --run src/_pages/ConfigPage.test.tsx && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/_pages/ConfigPage.tsx src/components/UpdateNotification.tsx src/components/RemotePairingPanel.tsx src/_pages/ConfigPage.test.tsx
  git commit -m "refactor: simplify client settings overview"
  ```

### Task 3: Rebuild Shortcut Management

**Files:**
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `shared/shortcuts.ts`
- Modify: `src/utils/shortcutFormat.ts`
- Test: `src/_pages/ConfigPage.shortcuts.test.tsx`

**Interfaces:**
- Keeps `window.electronAPI.getShortcutBindings`, `updateShortcutBinding`, `startShortcutTestMode`, and `stopShortcutTestMode`.
- Produces a compact common-shortcuts list and a collapsible advanced-shortcuts list.

- [ ] **Step 1: Write failing shortcut interaction tests**
  - Assert common actions are visible by default.
  - Assert advanced window and scroll actions are hidden until expanded.
  - Assert entering a new shortcut calls the existing update IPC.
  - Assert a conflict prevents saving and renders the conflict beside the active row.
  - Assert restore-defaults uses the existing shortcut update path.

- [ ] **Step 2: Run tests and confirm they fail**

  Run: `npm test -- --run src/_pages/ConfigPage.shortcuts.test.tsx`

  Expected: FAIL against the current sections and copy-heavy interaction.

- [ ] **Step 3: Implement the shortcut redesign**
  - Define a visible common action list and an advanced action list without changing action identifiers.
  - Use compact rows with label, keycap, edit control, and optional test control.
  - Keep recording behavior for keyboard and mouse combinations.
  - Move explanations into tooltips or one-line inline states.
  - Add restore-defaults behavior without altering global shortcut registration semantics.

- [ ] **Step 4: Run shortcut tests, existing shortcut tests, and typecheck**

  Run: `npm test -- --run src/_pages/ConfigPage.shortcuts.test.tsx src/hooks && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/_pages/ConfigPage.tsx shared/shortcuts.ts src/utils/shortcutFormat.ts src/_pages/ConfigPage.shortcuts.test.tsx
  git commit -m "refactor: streamline shortcut management"
  ```

### Task 4: Consolidate Account, Appearance, and Remote Settings

**Files:**
- Modify: `src/_pages/ConfigPage.tsx`
- Modify: `src/components/Settings/SettingsDialog.tsx`
- Modify: `src/components/RemotePairingPanel.tsx`
- Modify: `src/components/Compatibility/CompatibilityDialog.tsx`
- Test: `src/components/Settings/SettingsDialog.test.tsx`

**Interfaces:**
- Preserves authentication, theme, remote pairing, compatibility, version, and logout behaviors.
- Produces one consistent settings presentation; `SettingsDialog` either delegates to the settings center or only remains for overlay-specific quick settings.

- [ ] **Step 1: Write failing consolidation tests**
  - Assert account, appearance, remote pairing, and compatibility controls use the same visual primitives.
  - Assert logout keeps its loading and failure behavior.
  - Assert remote pairing error, expiry, copy, regenerate, and disconnect states remain represented.

- [ ] **Step 2: Run tests and confirm the duplicated presentation is not covered**

  Run: `npm test -- --run src/components/Settings/SettingsDialog.test.tsx`

  Expected: FAIL because the new shared presentation and state assertions are absent.

- [ ] **Step 3: Consolidate the settings surfaces**
  - Remove duplicated explanatory panels.
  - Reuse compact section headers, rows, status pills, and action controls.
  - Keep compatibility diagnostics in a modal launched from the account/system section.
  - Ensure theme selection remains a deliberate choice before launching the exam window.

- [ ] **Step 4: Run tests and typecheck**

  Run: `npm test -- --run src/components/Settings/SettingsDialog.test.tsx && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/_pages/ConfigPage.tsx src/components/Settings/SettingsDialog.tsx src/components/RemotePairingPanel.tsx src/components/Compatibility/CompatibilityDialog.tsx src/components/Settings/SettingsDialog.test.tsx
  git commit -m "refactor: consolidate client settings surfaces"
  ```

### Task 5: Rebuild the Exam Overlay Navigation and Queue

**Files:**
- Modify: `src/_pages/SubscribedApp.tsx`
- Modify: `src/_pages/Queue.tsx`
- Modify: `src/components/Queue/QueueCommands.tsx`
- Modify: `src/components/Queue/ScreenshotQueue.tsx`
- Test: `src/_pages/Queue.test.tsx`

**Interfaces:**
- Preserves screenshot IPC, queue refresh events, reset behavior, AI processing callbacks, and view switching.
- Produces a compact overlay header, queue content area, and core action toolbar.

- [ ] **Step 1: Write failing overlay tests**
  - Assert the queue view exposes screenshot, partial screenshot, process, and reset actions.
  - Assert empty queue has a concise empty state with one primary capture action.
  - Assert screenshot deletion and reset events refresh the queue.
  - Assert advanced window controls are not rendered as permanent text blocks.

- [ ] **Step 2: Run tests and confirm they fail**

  Run: `npm test -- --run src/_pages/Queue.test.tsx`

  Expected: FAIL against the current queue layout.

- [ ] **Step 3: Implement the compact overlay**
  - Add a compact overlay header with status and menu entry points.
  - Replace the current command bar copy with icon-plus-tooltip controls.
  - Keep screenshots visually dominant and reduce non-actionable status text.
  - Preserve resize observers and Electron view synchronization.

- [ ] **Step 4: Run overlay tests and typecheck**

  Run: `npm test -- --run src/_pages/Queue.test.tsx && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/_pages/SubscribedApp.tsx src/_pages/Queue.tsx src/components/Queue
  git commit -m "refactor: simplify exam overlay queue"
  ```

### Task 6: Rebuild the Answer View and Reduce User-Facing Noise

**Files:**
- Modify: `src/_pages/Solutions.tsx`
- Modify: `src/_pages/RawOutput.tsx`
- Modify: `src/components/Solutions/SolutionCommands.tsx`
- Modify: `src/components/ProcessingStatus.tsx`
- Modify: `src/components/Solutions/ChoiceResult.tsx`
- Test: `src/_pages/Solutions.test.tsx`

**Interfaces:**
- Preserves structured programming, single-choice, multiple-choice, universal, debug, streaming, copy, raw-output, and cancellation behavior.
- Produces a focused answer layout with short generation status and clear primary copy actions.

- [ ] **Step 1: Write failing answer-view tests**
  - Assert final answer/code is the dominant content.
  - Assert streaming uses a compact status indicator rather than repeated instructional prose.
  - Assert copy action remains available for code and structured answers.
  - Assert raw output is available through a secondary control, not shown as a competing primary panel.

- [ ] **Step 2: Run tests and confirm they fail**

  Run: `npm test -- --run src/_pages/Solutions.test.tsx`

  Expected: FAIL against the current verbose solution presentation.

- [ ] **Step 3: Implement the answer-view redesign**
  - Reorganize answer content into compact sections with stable heights.
  - Simplify processing status text to short states such as `准备中`, `生成中`, `已完成`, `处理失败`.
  - Keep technical details such as complexity and raw output secondary.
  - Make copy, retry, cancel, and return controls consistent with the new overlay toolbar.

- [ ] **Step 4: Run answer tests and typecheck**

  Run: `npm test -- --run src/_pages/Solutions.test.tsx src/components/Solutions && npm run typecheck`

  Expected: PASS.

- [ ] **Step 5: Commit**

  ```bash
  git add src/_pages/Solutions.tsx src/_pages/RawOutput.tsx src/components/Solutions src/components/ProcessingStatus.tsx
  git commit -m "refactor: focus exam overlay on answers"
  ```

### Task 7: Full Visual Cleanup and Verification

**Files:**
- Modify: `src/client-presentation.css`
- Modify: `src/index.css`
- Modify: affected files from Tasks 1-6 only where verification finds regressions.
- Test: existing renderer test suite and manual desktop screenshots.

**Interfaces:**
- No new public interface.
- Verifies all existing IPC and task behavior remains intact.

- [ ] **Step 1: Search and remove stale user-facing copy**
  - Search for duplicate tutorial copy, development-style messages, and persistent technical explanations.
  - Replace only copy that is clearly non-actionable; retain error and recovery messages.

- [ ] **Step 2: Run the full test suite**

  Run: `npm test`

  Expected: all test files and tests pass.

- [ ] **Step 3: Run typecheck and production build**

  Run: `npm run typecheck && npm run build`

  Expected: both commands exit successfully.

- [ ] **Step 4: Validate desktop layouts**
  - Start the local client.
  - Capture settings overview, shortcuts, queue, and answer views at the current desktop dimensions.
  - Check `800x600` and a narrower window for overflow, clipped text, overlapping controls, and unstable resizing.

- [ ] **Step 5: Commit the final cleanup**

  ```bash
  git add src
  git commit -m "polish: verify desktop client ux redesign"
  ```
