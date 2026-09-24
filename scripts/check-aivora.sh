#!/usr/bin/env bash
set -u
ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
echo "== Aivora screen =="
for name in aivora-dev aivora-web aivora-backend aivora-worker; do
  if screen -list | grep -q "[.]${name}[[:space:]]"; then echo "${name}: running"; else echo "${name}: stopped"; fi
done
echo "== Ports =="
for item in "54321 127.0.0.1:54321" "3000 127.0.0.1:3000" "18000 127.0.0.1:18000" "15439 PostgreSQL" "16379 Redis" "19000 MinIO"; do
  set -- $item
  if command -v lsof >/dev/null 2>&1 && lsof -nP -iTCP:"$1" -sTCP:LISTEN >/dev/null 2>&1; then echo "$2: listening"; else echo "$2: unavailable"; fi
done
echo "== Health =="
curl --max-time 3 -fsS http://127.0.0.1:18000/health || true
echo
curl --max-time 5 -fsS http://127.0.0.1:18000/health/ready || true
echo
echo "== Docker dependencies =="
if command -v docker >/dev/null 2>&1; then docker ps --format '{{.Names}}\t{{.Status}}' | grep -E 'aivora-(postgres|redis|minio)' || true; fi
