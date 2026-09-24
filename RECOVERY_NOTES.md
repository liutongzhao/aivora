# QuizCoze 源码恢复说明

恢复来源：`/Applications/QuizCoze-2026.9.19.app/Contents/Resources/app.asar`

恢复日期：2026-09-24

## 已恢复

- `electron/`：Electron 主进程 TypeScript 源码
- `electron/native/SystemAudioCapture/`：macOS 原生 Swift 音频采集源码
- `src/`：从前端 Source Map 恢复出的 React/TypeScript 源码，可直接编辑
- `shared/`：前后端共享的快捷键源码
- `package.json`、`config.json`、`app-update.yml`
- 历史恢复材料 `recovered-source/`、`recovered-build/` 已在开发工程整理阶段清理

## 未复制

`node_modules/` 未复制。它是构建依赖快照，建议根据 `package.json` 重新安装。

## 原始文件校验

- `app.asar` SHA-256: `cc865194b849e184b0b855c99f0d02d495ca8499da8dfd8413679f73e284e1fe`
- 主程序 SHA-256: `8438bd37b95471f60634fbcee2483de9dbbb37f777f74dca5149ca66da319883`

恢复内容来自已发布构建，可能缺少未被打包或未被 Source Map 保留的开发文件，例如测试、脚本、私有环境配置和原始 Git 历史。
