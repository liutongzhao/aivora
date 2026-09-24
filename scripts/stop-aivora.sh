#!/usr/bin/env bash
set -euo pipefail
for name in aivora-dev aivora-web aivora-backend aivora-worker; do
  if screen -list | grep -q "[.]${name}[[:space:]]"; then
    screen -S "$name" -X quit
    echo "已停止 screen: ${name}"
  else
    echo "未发现 screen: ${name}"
  fi
done
