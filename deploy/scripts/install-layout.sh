#!/usr/bin/env bash
set -euo pipefail
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/service-deploy}"
install -d -m 0750 "$DEPLOY_ROOT" "$DEPLOY_ROOT/nginx" "$DEPLOY_ROOT/scripts" "$DEPLOY_ROOT/migrations" "$DEPLOY_ROOT/backups" "$DEPLOY_ROOT/data"
echo "部署目录已准备：$DEPLOY_ROOT"
