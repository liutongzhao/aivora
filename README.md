# Aivora

Aivora 是由 Electron 桌面客户端、Next.js 管理端/用户端、FastAPI API 和 Celery Worker 组成的单仓工程。

## 目录

```text
apps/desktop/       Electron + Vite 桌面客户端
apps/web/           Next.js 管理端、用户端和远程控制
services/backend/   FastAPI、Celery Worker、提示词和 Flyway 迁移
deploy/             Docker Compose 开发配置；生产配置后续单独维护
scripts/            本地服务启停和健康检查
tests/              后端、桌面端和跨服务测试
docs/               架构、开发和验收文档
```

## 本地开发

### 桌面客户端

```bash
npm install --prefix apps/desktop
npm --prefix apps/desktop run dev
npm --prefix apps/desktop test
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run build
```

### 管理端

```bash
npm install --prefix apps/web
npm --prefix apps/web run dev
npm --prefix apps/web run build
npm --prefix apps/web run e2e
```

### API 和 Worker

后端 Python 使用 `aivora-backend` 环境。运行前准备未追踪的 `services/backend/.env.local`：

```bash
cp services/backend/.env.example services/backend/.env.local
```

然后使用统一脚本启动：

```bash
scripts/start-aivora.sh
scripts/check-aivora.sh
scripts/stop-aivora.sh
```

统一脚本使用以下 screen 会话：`aivora-backend`、`aivora-worker`、`aivora-web`、`aivora-dev`。

### 开发依赖

PostgreSQL、Redis、MinIO 和 Flyway 使用开发 Compose：

```bash
docker compose -p aivora --project-directory "$PWD" -f deploy/compose.dev.yml up -d postgres redis minio flyway
```

`deploy/compose.dev.yml` 只用于本地开发，不是生产部署配置。生产环境会使用独立镜像、密钥、HTTPS、备份和发布流程。

## 服务地址

| 服务 | 地址 |
|---|---|
| Electron/Vite | `http://127.0.0.1:54321` |
| Next.js | `http://127.0.0.1:3000` |
| FastAPI | `http://127.0.0.1:18000` |
| PostgreSQL | `127.0.0.1:15439` |
| Redis | `127.0.0.1:16379` |
| MinIO API | `127.0.0.1:19000` |
| MinIO Console | `127.0.0.1:19001` |
