#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
CLIENT="$ROOT_DIR/apps/desktop/electron/RemoteControlClient.ts"
grep -q 'api/remote/devices/register' "$CLIENT"
grep -q 'device_id: this.deviceId' "$CLIENT"
grep -q 'await registration' "$CLIENT"
echo 'remote pairing registration contract: ok'
