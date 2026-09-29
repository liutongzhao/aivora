#!/usr/bin/env bash
set -euo pipefail
IMAGE_TAG="${1:-}"
DEPLOY_ROOT="${DEPLOY_ROOT:-/home/ubuntu/service-deploy}"
[[ "$IMAGE_TAG" =~ ^[A-Za-z0-9._-]+$ ]] || { echo "缺少合法镜像版本" >&2; exit 2; }
exec "$DEPLOY_ROOT/scripts/deploy.sh" "$IMAGE_TAG"
