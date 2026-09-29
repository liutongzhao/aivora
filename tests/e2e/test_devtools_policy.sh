#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
MAIN="$ROOT_DIR/apps/desktop/electron/main.ts"
grep -q 'AIVORA_OPEN_DEVTOOLS' "$MAIN"
grep -q 'process.env.AIVORA_OPEN_DEVTOOLS === "1"' "$MAIN"
echo 'devtools policy: ok'
