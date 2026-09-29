#!/usr/bin/env bash
set -euo pipefail
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/service-deploy}"
cd "$DEPLOY_ROOT"
[[ -f .env ]] || { echo "缺少 $DEPLOY_ROOT/.env" >&2; exit 1; }
set -a
source .env
set +a
BACKUP_DIR="${BACKUP_DIR:-$DEPLOY_ROOT/backups/$(date +%Y%m%d-%H%M%S)}"
install -d -m 0750 "$BACKUP_DIR"
docker compose --env-file .env -f compose.prod.yml exec -T postgres pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom > "$BACKUP_DIR/postgres.dump"
echo "PostgreSQL 备份已写入：$BACKUP_DIR/postgres.dump"
echo "MinIO 备份请使用 mc mirror 或云端对象存储备份策略写入：$BACKUP_DIR/minio"
