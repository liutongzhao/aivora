#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
start_screen() {
  local name="$1"; shift
  if printf "%s\n" "$(screen -list 2>/dev/null)" | grep -q "[.]${name}[[:space:]]"; then
    echo "复用 screen: ${name}"
  else
    screen -dmS "$name" zsh -lc "$*"
    echo "已启动 screen: ${name}"
  fi
}
start_screen aivora-backend "cd '$ROOT_DIR/backend'; export PYTHONPATH=\"\$PWD\"; exec /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/uvicorn app.main:app --host 127.0.0.1 --port 18000"
start_screen aivora-worker "cd '$ROOT_DIR/backend'; export PYTHONPATH=\"\$PWD\"; exec /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/celery -A app.workers.celery_app.celery_app worker --loglevel=INFO --pool=solo --hostname=aivora-worker@%h"
start_screen aivora-web "cd '$ROOT_DIR'; exec npm run dev --prefix web -- --hostname 127.0.0.1 --port 3000"
start_screen aivora-dev "cd '$ROOT_DIR'; exec npm run dev"
