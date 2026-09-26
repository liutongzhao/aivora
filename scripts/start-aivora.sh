#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
screen_exists() {
  printf "%s\n" "$(screen -list 2>/dev/null)" | grep -Eq "[.]${1}[[:space:]]"
}

start_screen() {
  local name="$1"; shift
  if screen_exists "$name"; then
    echo "检测到已有 screen: ${name}，将停止并按当前工作树配置重启"
    screen -S "$name" -X quit
    for _ in {1..20}; do
      screen_exists "$name" || break
      sleep 0.1
    done
    if screen_exists "$name"; then
      echo "拒绝启动 ${name}：旧 screen 未能退出" >&2
      return 1
    fi
  fi
  screen -dmS "$name" zsh -lc "$*"
  echo "已启动 screen: ${name}"
}
start_screen aivora-backend "cd '$ROOT_DIR/backend'; export PYTHONPATH=\"\$PWD\"; export TASK_DISPATCH_ENABLED=true; export BYOK_REQUIRED=true; exec /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/uvicorn app.main:app --host 127.0.0.1 --port 18000"
start_screen aivora-worker "cd '$ROOT_DIR/backend'; export PYTHONPATH=\"\$PWD\"; export TASK_DISPATCH_ENABLED=true; export BYOK_REQUIRED=true; exec /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/celery -A app.workers.celery_app.celery_app worker --loglevel=INFO --pool=prefork --concurrency=4 --queues=aivora --hostname=aivora-worker@%h"
start_screen aivora-beat "cd '$ROOT_DIR/backend'; export PYTHONPATH=\"\$PWD\"; export TASK_DISPATCH_ENABLED=true; export BYOK_REQUIRED=true; exec /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/celery -A app.workers.celery_app.celery_app beat --loglevel=INFO"
start_screen aivora-maintenance "cd '$ROOT_DIR/backend'; export PYTHONPATH=\"\$PWD\"; export TASK_DISPATCH_ENABLED=true; export BYOK_REQUIRED=true; exec /Users/liutongzhao/miniconda3/envs/aivora-backend/bin/celery -A app.workers.celery_app.celery_app worker --loglevel=INFO --pool=prefork --concurrency=1 --queues=aivora-maintenance --hostname=aivora-maintenance@%h"
start_screen aivora-web "cd '$ROOT_DIR'; exec npm run dev --prefix web -- --hostname 127.0.0.1 --port 3000"
start_screen aivora-dev "cd '$ROOT_DIR'; exec npm run dev"
