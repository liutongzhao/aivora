#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
for script in start-aivora.sh stop-aivora.sh check-aivora.sh; do
  test -x "$ROOT_DIR/scripts/$script"
done
bash -n "$ROOT_DIR/scripts/start-aivora.sh" "$ROOT_DIR/scripts/stop-aivora.sh" "$ROOT_DIR/scripts/check-aivora.sh"
grep -q 'aivora-backend' "$ROOT_DIR/scripts/start-aivora.sh"
grep -q 'aivora-worker' "$ROOT_DIR/scripts/start-aivora.sh"
grep -q 'aivora-web' "$ROOT_DIR/scripts/start-aivora.sh"
grep -q 'aivora-dev' "$ROOT_DIR/scripts/start-aivora.sh"
grep -q 'services/backend' "$ROOT_DIR/scripts/start-aivora.sh"
grep -q 'apps/web' "$ROOT_DIR/scripts/start-aivora.sh"
grep -q 'compose -p aivora' "$ROOT_DIR/scripts/check-aivora.sh"
echo 'service scripts: ok'
