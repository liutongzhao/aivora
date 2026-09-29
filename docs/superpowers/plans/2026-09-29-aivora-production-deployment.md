# Aivora 生产部署实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Ubuntu 24.04 x86_64 服务器建立基于 GHCR、Docker Compose 和 Nginx 的 Aivora 生产部署与 GitHub Actions 发布流程。

**Architecture:** Web 和 Backend 分别构建为 `linux/amd64` 镜像，API 和 Worker 复用 Backend 镜像。生产 Compose 只暴露 Nginx 80 端口，由 Nginx 将 `/` 、`/api/`、`/health/` 和 `/socket.io/` 分别转发到 Web/API。GitHub Actions 以 commit SHA 作镜像版本，通过 SSH 调用服务器部署脚本。

**Tech Stack:** Docker multi-stage builds、Docker Compose v2、Nginx、GitHub Actions、GHCR、Next.js、FastAPI、Celery、Flyway、PostgreSQL、Redis、MinIO。

**Spec:** `docs/superpowers/specs/2026-09-29-aivora-production-deployment-design.md`

## Global Constraints

- 服务器使用 Ubuntu 24.04 LTS `x86_64` / `amd64`。
- 服务器地址为 `43.133.80.249`，SSH 用户为 `root`，端口按 `22`。
- 生产部署根目录为 `/home/ubuntu/service-deploy`。
- 当前使用 IP + HTTP，Nginx 监听 `80`，不配置域名和 TLS。
- PostgreSQL、Redis、MinIO 不对公网暴露端口。
- `.env`、API Key、数据库密码、MinIO 密钥和 `AIVORA_MASTER_KEY` 不进入 Git、镜像或 Actions 日志。
- Git 提交信息使用中文说明。

## Review Focus

- 新镜像标签包含特殊字符或空值时，Compose 不应 silently 回退到未验证版本；测试固定 SHA 默认值和参数覆盖。
- Flyway 迁移失败时，部署脚本必须停止且不能更新 API/Worker/Web；测试失败退出码。
- Nginx SSE 和 Socket.IO 请求必须保持长连接和协议升级；测试配置包含 `proxy_http_version`、升级头和禁用缓冲。
- 生产 Compose 不应把源码挂载进应用容器或暴露 PostgreSQL/Redis/MinIO 端口；测试解析后的服务定义。
- 健康检查失败时发布应失败并保留旧版本标识；测试部署脚本检查。

### Task 1: 生产镜像构建

**Files:**
- Create: `services/backend/Dockerfile`
- Create: `apps/web/Dockerfile`
- Create: `.dockerignore`
- Test: `scripts/test-production-config.sh`

**Interfaces:**
- Produces 可供 Compose 使用的 Backend 和 Web 镜像，Backend 包含 API、Worker 和 Flyway 所需的后端代码与依赖，Web 使用 Next.js production standalone 或等价生产启动产物。

- [ ] **Step 1:** 检查 Web Next.js 配置是否支持 standalone，确定镜像启动命令和静态资源复制边界。
- [ ] **Step 2:** 写 Dockerfile 的静态校验，确保构建不依赖服务器源码和运行时安装依赖。
- [ ] **Step 3:** 执行 `docker build` 或 BuildKit 构建，验证 amd64 镜像能启动。
- [ ] **Step 4:** 提交 `chore: 添加生产镜像构建配置`。

### Task 2: 生产 Compose 与 Nginx

**Files:**
- Create: `deploy/compose.prod.yml`
- Create: `deploy/.env.prod.example`
- Create: `deploy/nginx/default.conf`
- Modify: `apps/web/next.config.*` 如需启用 production standalone
- Test: `scripts/test-production-config.sh`

**Interfaces:**
- Produces `/home/ubuntu/service-deploy/compose.prod.yml` 所需的同名服务、环境变量和持久卷。Nginx 为 `/` 、`/api/`、`/health/`、`/socket.io/` 提供反向代理。

- [ ] **Step 1:** 先写配置测试，验证服务名、图像版本变量、无源码挂载、数据库端口未公开和 Nginx 路由。
- [ ] **Step 2:** 实现 Compose 生产配置：postgres、redis、minio、flyway、api、worker、web、nginx。
- [ ] **Step 3:** 配置 Nginx 的 SSE 禁用缓冲、长超时、WebSocket upgrade 和 HTTP 请求头。
- [ ] **Step 4:** 运行 `docker compose -f deploy/compose.prod.yml config` 和静态断言。
- [ ] **Step 5:** 提交 `feat: 添加生产 Compose 和 Nginx 配置`。

### Task 3: 服务器部署脚本

**Files:**
- Create: `deploy/scripts/deploy.sh`
- Create: `deploy/scripts/rollback.sh`
- Create: `deploy/scripts/backup.sh`
- Create: `deploy/scripts/install-layout.sh`
- Test: `scripts/test-production-config.sh`

**Interfaces:**
- `install-layout.sh`: 创建 `/home/ubuntu/service-deploy` 及 `nginx/`、`scripts/`、`data/` 目录，不覆盖 `.env`。
- `deploy.sh <image-tag>`: 以指定 SHA 拉取镜像，Flyway 成功后更新应用，执行健康检查。
- `rollback.sh <image-tag>`: 切换到已验证 SHA 并重新运行应用。
- `backup.sh`: 对 PostgreSQL 执行可恢复的备份，对 MinIO 提供备份目录约定，不影响正在运行的应用。

- [ ] **Step 1:** 为发布失败、缺少 `.env`、缺少标签和健康检查失败编写 shell 测试。
- [ ] **Step 2:** 实现脚本，所有危险操作限定在部署根目录，不执行 `git reset` 或删除数据卷。
- [ ] **Step 3:** 使用 shellcheck（如可用）和模拟环境运行脚本测试。
- [ ] **Step 4:** 提交 `ops: 添加生产部署和回滚脚本`。

### Task 4: GitHub Actions CI/CD

**Files:**
- Create: `.github/workflows/ci.yml`
- Create: `.github/workflows/release.yml`
- Create: `deploy/scripts/remote-release.sh`
- Modify: `README.md`
- Test: `scripts/test-production-config.sh`

**Interfaces:**
- CI 在 PR 和 `main` push 上运行前端、后端和 Compose 检查。
- Release 在 `v*` tag 或手动触发上构建 amd64 镜像、登录 GHCR 并通过 SSH 运行 `/home/ubuntu/service-deploy/scripts/deploy.sh`。
- Actions Secrets 只包含 `DEPLOY_HOST`、`DEPLOY_USER`、`DEPLOY_PORT`、`DEPLOY_SSH_KEY`；生产密钥留在服务器 `.env`。

- [ ] **Step 1:** 写 workflow 静态校验，确保只有 GHCR 登录步骤使用 `GITHUB_TOKEN`，部署步骤不输出秘密。
- [ ] **Step 2:** 实现 CI：Node 分别在 apps 目录安装，Python 运行后端测试，校验 Compose。
- [ ] **Step 3:** 实现 Release：Buildx 构建 `linux/amd64`，推送 SHA 和 tag，SSH 执行服务器部署。
- [ ] **Step 4:** 运行 Actions YAML 解析和本地 workflow lint（如可用）。
- [ ] **Step 5:** 提交 `ci: 添加 GitHub Actions 构建与发布流程`。

### Task 5: 文档、验证与首次服务器部署

**Files:**
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-09-29-aivora-production-deployment-design.md`
- Test: `scripts/test-production-config.sh`

- [ ] **Step 1:** 补充 GitHub 仓库 Secrets、GHCR 读取 Token、服务器 `.env`、Nginx 配置、首次部署、回滚和不使用密码的说明。
- [ ] **Step 2:** 运行全套本地检查：`git diff --check`、前端测试与构建、后端测试、Compose config、production config test。
- [ ] **Step 3:** 以 SSH 连接 `root@43.133.80.249`，创建 `/home/ubuntu/service-deploy`，同步非密钥部署文件，由用户在服务器上填写 `.env` 和 GHCR 只读 Token。
- [ ] **Step 4:** 执行首次部署和 HTTP 健康检查，仅在服务器端口与防火墙条件满足时验证 `http://43.133.80.249`。
- [ ] **Step 5:** 提交 `docs: 补充生产发布操作手册`。

## 验证标准

- `docker compose --env-file deploy/.env.prod.example -f deploy/compose.prod.yml config` 成功。
- 生产 Compose 不包含应用源码挂载，不映射 PostgreSQL、Redis、MinIO 端口。
- Nginx 配置包含 SSE 和 WebSocket 所需设置。
- CI 与 Release workflow 能被 GitHub Actions 解析，镜像构建目标为 `linux/amd64`。
- 服务器首次部署后，`/health/live`、`/health/ready`、Web 首页和登录路由可访问。
