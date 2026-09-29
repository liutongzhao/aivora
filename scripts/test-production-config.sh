#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/deploy/compose.prod.yml"
ENV_FILE="$ROOT_DIR/deploy/.env.prod.example"
command -v docker >/dev/null 2>&1 || { echo "需要 Docker 才能校验生产配置" >&2; exit 1; }
COMPOSE_OUTPUT="$(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config)"
printf '%s\n' "$COMPOSE_OUTPUT" | grep -q 'ghcr.io/liutongzhao/aivora-backend:'
printf '%s\n' "$COMPOSE_OUTPUT" | grep -q 'ghcr.io/liutongzhao/aivora-web:'
printf '%s\n' "$COMPOSE_OUTPUT" | grep -q 'published: "80"'
if printf '%s\n' "$COMPOSE_OUTPUT" | grep -Eq '15439|16379|19000|19001|5432:5432|6379:6379|9000:9000'; then
  echo "生产 Compose 不应暴露基础设施端口" >&2
  exit 1
fi
if grep -Eq '^[[:space:]]+-[[:space:]]+\.:/|^[[:space:]]+-[[:space:]]+\.\./' "$COMPOSE_FILE"; then
  echo "生产 Compose 不应挂载源码目录" >&2
  exit 1
fi
for path in /api/ /health/ /socket.io/; do
  grep -q "location $path" "$ROOT_DIR/deploy/nginx/default.conf"
done
grep -q 'proxy_buffering off' "$ROOT_DIR/deploy/nginx/default.conf"
grep -q 'proxy_set_header Upgrade' "$ROOT_DIR/deploy/nginx/default.conf"
echo "生产配置校验通过"
