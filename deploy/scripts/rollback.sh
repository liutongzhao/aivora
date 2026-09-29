#!/usr/bin/env bash
set -euo pipefail
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/service-deploy}"
IMAGE_TAG="${1:-}"
if [[ -z "$IMAGE_TAG" || ! "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "用法：$0 <已验证的旧镜像 SHA 或发布标签>" >&2
  exit 2
fi
cd "$DEPLOY_ROOT"
[[ -f .env ]] || { echo "缺少 $DEPLOY_ROOT/.env" >&2; exit 1; }
export AIVORA_IMAGE_TAG="$IMAGE_TAG"
docker compose --env-file .env -f compose.prod.yml pull api worker web
docker compose --env-file .env -f compose.prod.yml up -d api worker web nginx
curl --fail --silent --show-error --max-time 10 http://127.0.0.1/health/live >/dev/null
echo "已回滚到：$IMAGE_TAG"
