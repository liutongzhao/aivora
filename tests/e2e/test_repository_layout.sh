#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"

required_paths=(
  "apps/desktop"
  "apps/web/app"
  "apps/web/components"
  "apps/web/package.json"
  "services/backend"
  "deploy/compose.dev.yml"
)

legacy_paths=(
  "src"
  "electron"
  "shared"
  "assets"
  "web"
  "backend"
  "package.json"
  "docker-compose.yml"
)

for relative_path in "${required_paths[@]}"; do
  if [[ ! -e "$ROOT_DIR/$relative_path" ]]; then
    echo "缺少目标路径: $relative_path" >&2
    exit 1
  fi
done

for relative_path in "${legacy_paths[@]}"; do
  if [[ -e "$ROOT_DIR/$relative_path" ]]; then
    echo "仍存在旧路径: $relative_path" >&2
    exit 1
  fi
done

echo "repository layout: ok"
