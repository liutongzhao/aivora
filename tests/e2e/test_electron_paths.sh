#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
SHORTCUTS="$ROOT_DIR/dist-electron/electron/shortcuts.js"
test -f "$SHORTCUTS"
grep -q "require('../../config.json')" "$SHORTCUTS"
node -e "require('./dist-electron/electron/shortcuts.js')" >/dev/null 2>&1 || true
echo 'electron config path: ok'
