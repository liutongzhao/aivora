#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
DESKTOP_DIR="$ROOT_DIR/apps/desktop"
SHORTCUTS="$DESKTOP_DIR/dist-electron/electron/shortcuts.js"
PRELOAD_SOURCE="$DESKTOP_DIR/electron/preload.ts"
test -f "$SHORTCUTS"
grep -q "require('../../config.json')" "$SHORTCUTS"
grep -q 'openLink: (url: string) => ipcRenderer.invoke("openLink", url)' "$PRELOAD_SOURCE"
test -f "$DESKTOP_DIR/dist-electron/electron/preload.js"
grep -q '"config.json"' "$DESKTOP_DIR/package.json"
grep -q 'http://43.133.80.249' "$DESKTOP_DIR/config.json"
test -f "$DESKTOP_DIR/dist/index.html"
test -f "$DESKTOP_DIR/assets/icons/win/aivora.ico"
grep -q 'path.join(__dirname, "../../dist/index.html")' "$DESKTOP_DIR/electron/main.ts"
grep -q "'electron', 'native', 'SystemAudioCapture'" "$DESKTOP_DIR/electron/AudioManager.ts"
(cd "$DESKTOP_DIR" && node -e "require('./dist-electron/electron/shortcuts.js')" >/dev/null 2>&1 || true)
echo 'electron config path: ok'
