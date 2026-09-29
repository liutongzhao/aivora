#!/usr/bin/env bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "$0")/../.." && pwd)"
AUTH_FILE="$ROOT_DIR/apps/desktop/electron/SimpleAuthManager.ts"
grep -q "const response = await this.apiClient.post('/api/auth/login', emailBody)" "$AUTH_FILE"
grep -q "response.data?.session_id" "$AUTH_FILE"
if grep -q "response.data?.sessionId || response.data?.token" "$AUTH_FILE"; then
  echo 'desktop auth still uses legacy response contract' >&2
  exit 1
fi
echo 'desktop auth response contract: ok'
