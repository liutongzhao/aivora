# Aivora

Aivora 是一套面向桌面端的 AI 任务处理工具。用户可以在 Electron 客户端中截图、选择题型并提交处理任务，通过流式输出查看结果；Web 端用于账号、AI 模型、提示词、历史任务和系统运维管理。

> 项目正在进行产品化和发布准备。当前仓库包含可运行的本地开发环境，生产镜像、正式域名和客户端下载渠道将在发布流程完成后提供。

## 产品定位

Aivora 将截图采集、AI 任务编排、流式结果展示和模型配置集成在一套可自主部署的系统中，主要能力包括：

- 在桌面端快速采集一张或多张截图，并提交给 AI 模型处理。
- 按通用、编程、单选、多选和调试等模式管理提示词。
- 由用户配置 OpenAI 兼容的模型连接、模型和默认路由。
- 在 Web 端查看实时任务、历史结果和账号配置。
- 通过手机页面与桌面端临时配对，远程触发已授权的操作。
- 由管理员统一查看用户、任务、模型目录和服务健康状态。

## 系统组成

```text
桌面客户端 (Electron)        Web 端 (Next.js)
        |                          |
        +------- HTTPS / SSE ------+
                    |
              FastAPI API
          /         |          \
 PostgreSQL       Redis        MinIO
 账号/配置/任务   队列/事件流    截图对象
                    |
              Celery Worker
                    |
          OpenAI 兼容模型服务
```

| 组件 | 技术 | 职责 |
| --- | --- | --- |
| 桌面客户端 | Electron、React、TypeScript、Vite | 截图、全局快捷键、浮窗、任务提交、流式结果和本地设置 |
| Web 端 | Next.js、React、TypeScript | 注册登录、用户工作台、配置管理、远程控制和管理后台 |
| API | FastAPI、SQLAlchemy | 认证、配置、文件、AI 任务、SSE、远程配对和管理接口 |
| Worker | Celery | 异步读取截图、调用模型、发布进度并持久化结果 |
| PostgreSQL | PostgreSQL 16 | 用户、会话、模型配置、任务、答案和审计数据 |
| Redis | Redis 7 | Celery 队列和实时任务事件 |
| 对象存储 | MinIO | 私有截图文件，业务服务不依赖本地文件目录 |
| 数据库迁移 | Flyway | 按版本执行 SQL 迁移和初始数据 |

## 工作原理

1. 用户在桌面客户端登录，并在配置中选择 AI 连接、模型和题型提示词。
2. Electron 主进程通过全局快捷键执行截图，Renderer 维护待处理的截图队列。
3. 客户端向 `POST /api/ai/process-screenshot` 提交一张或多张截图、题型和语言。
4. API 将截图写入 MinIO，在 PostgreSQL 创建任务，再将任务投递到 Redis/Celery 队列。
5. Worker 从 MinIO 读取图片，根据用户配置调用 OpenAI 兼容的多模态模型。
6. Worker 通过 Redis Stream 发布 `progress`、`content`、`completed` 或 `error` 事件。
7. 客户端使用短期 Token 连接 SSE，增量显示结果；最终答案和解析状态保存到 PostgreSQL。

完整的本地验收路径见 [`docs/本地开发与验收.md`](docs/%E6%9C%AC%E5%9C%B0%E5%BC%80%E5%8F%91%E4%B8%8E%E9%AA%8C%E6%94%B6.md)。

## 用户使用流程

### 桌面客户端

1. 启动客户端并登录账号。
2. 在模型与提示词页面添加 API 连接，配置可用模型及不同题型的默认模型。
3. 根据系统与个人习惯设置全局快捷键。
4. 使用快捷键截取全屏或区域，必要时继续添加截图。
5. 提交处理后，在浮窗中查看进度和流式结果。
6. 需要时可在客户端生成临时连接码，通过 Web 远程页面发送操作。

### Web 端

- 普通用户：注册、登录、查看实时任务和历史结果，管理 AI 连接、模型、默认路由和提示词。
- 管理员：查看服务概况、用户、全部任务和模型目录，对异常任务进行定位。
- 远程控制：输入桌面端生成的 8 位连接码，在配对有效期内控制已授权的桌面端。

## 在线服务与客户端下载

| 入口 | 状态 |
| --- | --- |
| 账号注册 | 待正式域名上线后补充 |
| Web 工作台 | 待正式域名上线后补充 |
| macOS 客户端 | 待签名、公证和发布流程完成后补充 |
| Windows 客户端 | 待签名和发布流程完成后补充 |

这些地址会在正式发布时替换为可直接访问的链接，仓库中不预置虚假域名。

## 仓库目录

```text
apps/
  desktop/           Electron + Vite 桌面客户端
  web/               Next.js 用户端、管理端和远程控制
services/
  backend/           FastAPI、Celery Worker、提示词和 Flyway 迁移
deploy/              Docker Compose 及后续的生产部署配置
scripts/             本地启动、停止和健康检查脚本
tests/               后端、跨服务和端到端测试
docs/                架构、开发、验收和实施文档
```

仓库根目录不安装 Node.js 依赖。桌面端和 Web 端使用各自的 `package.json` 和锁文件，不应提交任何 `node_modules/`、构建产物或本地环境文件。

## 本地开发

### 前置条件

- Node.js 22 及 npm
- Python 3.12
- Docker Engine 与 Docker Compose v2
- macOS 桌面客户端开发需要授权录屏和辅助功能权限

### 启动基础设施

```bash
docker compose -p aivora --project-directory "$PWD" \
  -f deploy/compose.dev.yml up -d postgres redis minio flyway
```

### 配置后端

```bash
cp services/backend/.env.example services/backend/.env.local
python -m pip install -e services/backend
```

`services/backend/.env.local` 只用于本地环境，不进入 Git。首次运行前至少需要检查数据库、Redis、MinIO、`AIVORA_MASTER_KEY` 以及初始管理员配置。

### 安装前端依赖

```bash
npm install --prefix apps/desktop
npm install --prefix apps/web
```

### 统一启停

```bash
./scripts/start-aivora.sh
./scripts/check-aivora.sh
./scripts/stop-aivora.sh
```

统一脚本使用 `aivora-backend`、`aivora-worker`、`aivora-web` 和 `aivora-dev` 四个 `screen` 会话，不会启停其他项目。

### 单独运行前端

```bash
# 桌面客户端
npm --prefix apps/desktop run dev

# Web 端
npm --prefix apps/web run dev -- --hostname 127.0.0.1 --port 3000
```

## 本地服务地址

| 服务 | 地址 |
| --- | --- |
| Electron Renderer / Vite | `http://127.0.0.1:54321` |
| Next.js | `http://127.0.0.1:3000` |
| FastAPI | `http://127.0.0.1:18000` |
| FastAPI 存活检查 | `http://127.0.0.1:18000/health/live` |
| FastAPI 就绪检查 | `http://127.0.0.1:18000/health/ready` |
| PostgreSQL | `127.0.0.1:15439` |
| Redis | `127.0.0.1:16379` |
| MinIO API | `127.0.0.1:19000` |
| MinIO Console | `http://127.0.0.1:19001` |

## 测试与构建

```bash
# 桌面端
npm --prefix apps/desktop test
npm --prefix apps/desktop run typecheck
npm --prefix apps/desktop run build

# Web 端
npm --prefix apps/web test
npm --prefix apps/web run build
npm --prefix apps/web run e2e

# 后端
pytest -q
python -m compileall -q services/backend/app

# Compose 配置校验
docker compose --project-directory "$PWD" -f deploy/compose.dev.yml config --quiet
```

Web 开发服务和 `npm --prefix apps/web run build` 共用 `.next` 缓存，不要并行执行。

## 部署方案

### 开发环境

[`deploy/compose.dev.yml`](deploy/compose.dev.yml) 会启动 PostgreSQL、Redis、MinIO、Flyway、API、Worker 和 Web，但它包含源码挂载、运行时安装依赖、开发服务器和本地端口映射，不能直接用于生产环境。

### 生产环境目标

生产部署面向 Ubuntu 24.04 x86_64 服务器，计划采用以下结构：

- GitHub Actions 在 Pull Request 和主分支上执行测试与构建。
- 通过后，构建 `linux/amd64` 的 Web 和 Backend 镜像并推送到 GitHub Container Registry。
- API 和 Worker 复用同一个 Backend 镜像，由 Compose 配置不同启动命令。
- 服务器只保存生产 Compose、非入库 `.env` 和持久卷，不在服务器上编译源码。
- 发布时通过 SSH 拉取指定 Git 提交 SHA 对应的镜像，先执行 Flyway 迁移，再更新 API、Worker 和 Web。
- Caddy 或 Nginx 负责 HTTPS、Web/API 反向代理、SSE 和 WebSocket 连接。
- PostgreSQL 和 MinIO 定期备份；保留上一个镜像 SHA，以便快速回滚。

生产 Dockerfile、Compose、反向代理和 GitHub Actions 会在域名、镜像权限与发布规则确认后加入仓库。

## 生产配置与安全

- 不要在 GitHub 或镜像中提交 `.env`、API Key、数据库密码、MinIO 密钥和 `AIVORA_MASTER_KEY`。
- 生产密钥由服务器的受限 `.env` 或专用 Secrets 系统管理，GitHub Actions 只保存部署所需的 SSH 凭据。
- PostgreSQL、Redis 和 MinIO 不对公网暴露端口，只在 Compose 内部网络中访问。
- API 的 CORS 只允许正式 Web 域名，桌面端和 Web 端统一使用 HTTPS API 地址。
- 发布前必须通过健康检查，数据库迁移失败时不继续更新应用服务。

## 开源协议

桌面客户端当前声明为 `AGPL-3.0-or-later`。在对外发布源码、容器镜像或客户端之前，请核对整个仓库的 LICENSE 文件、第三方依赖许可和发布策略。
