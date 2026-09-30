#!/usr/bin/env bash
set -euo pipefail
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/service-deploy}"
IMAGE_TAG="${1:-${AIVORA_IMAGE_TAG:-}}"
if [[ -z "$IMAGE_TAG" || ! "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]]; then
  echo "用法：$0 <已验证的镜像 SHA 或发布标签>" >&2
  exit 2
fi
cd "$DEPLOY_ROOT"
[[ -f .env ]] || { echo "缺少 $DEPLOY_ROOT/.env" >&2; exit 1; }
export AIVORA_IMAGE_TAG="$IMAGE_TAG"
docker compose --env-file .env -f compose.prod.yml up -d postgres redis minio
docker compose --env-file .env -f compose.prod.yml pull api worker web
docker compose --env-file .env -f compose.prod.yml run --rm flyway
docker compose --env-file .env -f compose.prod.yml up -d api worker web
docker compose --env-file .env -f compose.prod.yml up -d --no-deps --force-recreate nginx
for attempt in {1..30}; do
  if curl --fail --silent --show-error --max-time 5 http://127.0.0.1/health/live >/dev/null; then
    echo "部署成功：$IMAGE_TAG"
    printf '%s\n' "$IMAGE_TAG" > .previous-image-tag
    exit 0
  fi
  sleep 2
done
echo "健康检查失败，请使用 rollback.sh 回滚" >&2
exit 1
