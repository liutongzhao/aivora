# Aivora 单仓目录重构设计

**日期：** 2026-09-29  
**状态：** 待审阅  
**目标分支：** `main`

## 1. 目标

将当前由 Electron 客户端占据仓库根目录的工程，整理为边界明确的单仓结构，为后续 Docker Compose 生产部署、GitHub Actions 持续交付和客户端独立发版建立稳定路径。

本次只调整源码位置、工程配置和开发入口，不改变业务功能、API 协议、数据库结构、端口或用户交互。

## 2. 目标结构

```text
aivora/
├── apps/
│   ├── desktop/              # Electron + Vite 桌面客户端
│   │   ├── src/
│   │   ├── electron/
│   │   ├── shared/
│   │   ├── assets/
│   │   ├── config.json
│   │   ├── config.local.example.json
│   │   ├── index.html
│   │   ├── package.json
│   │   ├── package-lock.json
│   │   ├── tsconfig.json
│   │   ├── vite.config.ts
│   │   └── vitest.config.ts
│   └── web/                  # Next.js 用户端与管理端
├── services/
│   └── backend/              # FastAPI、Celery Worker 与 Flyway 迁移
│       ├── app/
│       ├── db/
│       ├── pyproject.toml
│       ├── requirements.txt
│       ├── requirements-dev.txt
│       └── .env.example
├── deploy/                   # 开发与生产部署配置
│   └── compose.dev.yml
├── scripts/                  # 根级统一启停和检查脚本
├── tests/                    # 后端与跨服务测试
├── docs/                     # 架构、开发和运维文档
├── .github/                  # 后续 GitHub Actions
├── AGENT.md
├── .gitignore
└── README.md
```

`.github/` 在本次迁移中可先建立目录约定，CI/CD 工作流在部署阶段单独设计和实现。

## 3. 路径映射

| 当前路径 | 目标路径 |
|---|---|
| `src/` | `apps/desktop/src/` |
| `electron/` | `apps/desktop/electron/` |
| `shared/` | `apps/desktop/shared/` |
| `assets/` | `apps/desktop/assets/` |
| 根级桌面端配置文件 | `apps/desktop/` |
| `web/` | `apps/web/` |
| `backend/` | `services/backend/` |
| `docker-compose.yml` | `deploy/compose.dev.yml` |
| `scripts/` | 保持根级 `scripts/` |
| `tests/` | 保持根级 `tests/` |
| `docs/` | 保持根级 `docs/` |

Git 无法追踪空目录，因此 `.github/` 会在新增首个工作流时自然出现，不添加无意义占位文件。

## 4. 工程入口

### 4.1 桌面客户端

桌面客户端成为独立 Node 工程，所有相对路径以 `apps/desktop` 为根：

```bash
npm --prefix apps/desktop install
npm --prefix apps/desktop run dev
npm --prefix apps/desktop run test
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run build
```

Vite 端口继续使用 `54321`，构建产物位于 `apps/desktop/dist` 和 `apps/desktop/dist-electron`。Electron 开发与打包资源路径必须在迁移后保持可解析。

### 4.2 Web 管理端

Web 成为 `apps/web` 下的独立 Next.js 工程：

```bash
npm --prefix apps/web install
npm --prefix apps/web run dev
npm --prefix apps/web run build
npm --prefix apps/web run start
```

开发端口继续使用 `3000`。

### 4.3 后端服务

FastAPI 与 Celery 共用 `services/backend` 代码和 Python 依赖：

```bash
cd services/backend
uvicorn app.main:app --host 127.0.0.1 --port 18000
celery -A app.workers.celery_app.celery_app worker ...
```

API、Worker、Flyway 迁移文件的内部模块名保持不变。

### 4.4 根级脚本

`scripts/start-aivora.sh`、`stop-aivora.sh`、`check-aivora.sh` 保持统一入口，但改用新目录。现有 screen 会话名与端口保持不变，避免改变开发者使用习惯。

## 5. Docker Compose

现有 Compose 迁移到 `deploy/compose.dev.yml`，仍然定位为本地开发配置。由于 Compose 文件所在目录改变，必须显式修正：

- 后端环境文件路径。
- Flyway 迁移挂载路径。
- API、Worker 和 Web 的源码挂载及工作目录。
- 项目根目录解析方式。

生产 `compose.prod.yml`、Dockerfile、Caddy 和 CI/CD 不混入本次纯目录迁移，下一阶段单独实现。

## 6. 测试与文档迁移

- 根级 Python 测试继续保留，所有 `backend/...` 路径改为 `services/backend/...`。
- Electron 契约测试改为读取 `apps/desktop/electron` 和其构建产物。
- Vitest 的初始化文件移动后从桌面工程内部引用，不再跨到 `apps/web`。
- `AGENT.md`、本地开发文档和有效设计文档中的当前操作路径同步更新。
- 历史设计文档保留当时路径，除非其中命令被明确标记为当前操作入口，避免大面积改写历史记录。

## 7. 清理范围

以下内容是本地生成物，不迁移、不提交：

```text
apps/desktop/node_modules/
apps/desktop/dist/
apps/desktop/dist-electron/
apps/web/node_modules/
apps/web/.next*/
apps/web/output/
output/
.playwright-cli/
.pytest_cache/
**/__pycache__/
services/backend/*.egg-info/
*.tsbuildinfo
.DS_Store
```

本地 `services/backend/.env.local` 含运行环境配置，不能提交，并保持 Git 忽略；Git 只追踪 `.env.example`。

## 8. 兼容性与风险控制

- 使用 Git 移动保留历史，不复制出两套源码。
- 迁移后不保留旧目录兼容软链接，防止 CI 和开发环境使用不同路径。
- 不在本次引入 npm workspace、Turborepo 或新的包管理器，避免目录迁移与构建系统迁移叠加。
- 不在本次合并 Python 依赖文件；依赖来源统一作为后续独立任务。
- 先更新路径测试，再执行移动和配置调整，最后运行全量验证。

## 9. 验收标准

1. 根目录只保留单仓级配置、文档、脚本和测试，不再散落桌面客户端文件。
2. Git 中不存在旧的 `src/`、`electron/`、`shared/`、`assets/`、`web/`、`backend/` 路径。
3. 桌面端测试、类型检查和构建通过。
4. Web 测试和生产构建通过。
5. 后端测试在新的 `PYTHONPATH` 下通过。
6. Shell 契约测试和 `git diff --check` 通过。
7. 本地统一启动脚本能从新路径启动 API、Worker、Web 和 Electron。
8. `deploy/compose.dev.yml` 能正确解析，服务挂载路径全部指向新目录。
9. Git 状态中不出现本地密钥、依赖目录、构建产物或缓存文件。

## 10. 后续阶段

目录迁移验收后，再按独立设计实施：

1. 为 Web、API/Worker 添加生产 Dockerfile。
2. 新增 `deploy/compose.prod.yml` 和 Caddy HTTPS 入口。
3. 新增 GitHub Actions 测试、镜像构建、推送和服务器部署流程。
4. 建立数据库备份、对象存储备份、健康检查和回滚机制。
