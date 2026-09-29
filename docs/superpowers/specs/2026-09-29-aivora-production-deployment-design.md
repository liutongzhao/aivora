# Aivora 生产部署与 CI/CD 设计

## 1. 目标

为 Aivora 建立一套基于 GitHub Actions、GHCR、Docker Compose 和 Nginx 的生产发布流程。首个阶段使用 IP 地址提供 HTTP 访问，不配置域名和 HTTPS，但保留后续迁移到域名 HTTPS 的路由结构。

## 2. 已确认的部署条件

| 项目 | 值 |
| --- | --- |
| 服务器操作系统 | Ubuntu 24.04 LTS |
| 服务器架构 | x86_64 / amd64 |
| 服务器 IP | `43.133.80.249` |
| SSH 用户 | `root` |
| SSH 端口 | `22` |
| 反向代理 | Nginx |
| 部署根目录 | `/home/ubuntu/service-deploy` |
| 当前入口 | `http://43.133.80.249` |
| 镜像架构 | `linux/amd64` |

## 3. 服务边界

GitHub Actions 构建并推送两个自有镜像：

- `ghcr.io/liutongzhao/aivora-web:<git-sha>`
- `ghcr.io/liutongzhao/aivora-backend:<git-sha>`

Backend 镜像同时用于 API 和 Celery Worker，仅通过 Compose 的 `command` 区分启动方式。生产不在服务器上拉取源码或在容器启动时安装依赖。

Compose 服务：

```text
nginx -> web
      -> api -> postgres / redis / minio
worker -> postgres / redis / minio
flyway -> postgres
```

PostgreSQL、Redis、MinIO 只加入 Compose 内部网络，不将数据库和对象存储端口暴露到公网。

## 4. 服务器文件布局

```text
/home/ubuntu/service-deploy/
  compose.prod.yml
  .env
  nginx/
    default.conf
  scripts/
    deploy.sh
    rollback.sh
    backup.sh
  data/
    postgres/
    redis/
    minio/
```

`.env` 由服务器管理，不写入 GitHub。它包含数据库、MinIO、AI 和应用密钥。镜像版本使用单独的 `AIVORA_IMAGE_TAG` 变量或发布脚本参数控制，不使用漂移的 `latest` 作为唯一版本标识。

## 5. Nginx 路由

Nginx 监听 `80` 端口，将请求转发到 Compose 内部的 Web 和 API：

| 路径 | 目标 | 要求 |
| --- | --- | --- |
| `/` | Web `3000` | Next.js 页面 |
| `/api/` | API `8000` | 保留前缀、转发长请求 |
| `/health/` | API `8000` | 对外健康检查 |
| `/socket.io/` | API `8000` | WebSocket 升级 |

SSE 路由关闭缓冲并提高读取超时；Socket.IO 路由配置 `Upgrade` 和 `Connection` 头。初期为 HTTP，后续加域名时只替换 server_name 和 TLS 配置，不改应用路由。

## 6. GitHub Actions

### CI

Pull Request 和 `main` 推送触发 CI，执行：

- 桌面端测试、TypeScript 检查和构建。
- Web 测试和构建。
- Backend 单元/集成测试。
- Compose 配置解析。

### 构建与发布

手动触发或推送 `v*` Tag 时：

1. 重新执行必要的检查。
2. 构建 `linux/amd64` 镜像。
3. 以 Git commit SHA 作不变标签推送 GHCR。
4. 通过 GitHub Actions Secret 使用部署专用 SSH Key 连接服务器。
5. 服务器执行镜像登录、拉取、Flyway 迁移、应用更新和健康检查。

GHCR 镜像初期可保持私有。如果服务器拉取私有镜像，应在服务器上配置只读的 GHCR Token，不复用个人完整权限 Token。

## 7. 发布、健康检查与回滚

发布顺序：

1. 拉取新版本镜像。
2. 执行 Flyway；迁移失败则立即停止。
3. 更新 API、Worker 和 Web。
4. 启动或重新加载 Nginx。
5. 检查 `/health/live` 和 `/health/ready`，再检查首页和登录。

回滚仅需将 `AIVORA_IMAGE_TAG` 恢复为上一个已验证的 SHA 并重新执行 Compose 更新。数据库迁移不自动回退；不允许发布脚本以破坏性操作代替备份和兼容迁移。

## 8. 数据与安全

- PostgreSQL 和 MinIO 使用持久数据目录。
- 每日备份 PostgreSQL 和 MinIO，备份不保存在应用容器临时文件中。
- 服务器防火墙只允许 SSH 端口、HTTP 80 和后续 HTTPS 443。
- 不对公网暴露 PostgreSQL、Redis、MinIO 和 API 容器端口。
- 当前 IP + HTTP 仅用于内部测试；用户正式使用前必须切换为域名 + HTTPS。

## 9. 不在本次实施范围内的事项

- 域名、TLS 证书和公网 HTTPS。
- Electron 客户端打包、签名、公证和自动更新。
- 云数据库和托管对象存储。
- 多服务器高可用、负载均衡和集群化部署。
