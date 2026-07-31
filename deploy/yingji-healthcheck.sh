#!/usr/bin/env bash
set -euo pipefail

exec 9>/run/yingji-healthcheck.lock
flock -n 9 || exit 0

health_url="http://127.0.0.1:8787/api/portfolio"
if curl --fail --silent --show-error --max-time 12 "$health_url" >/dev/null; then
  exit 0
fi

logger -t yingji-healthcheck "API health check failed; restarting yingji.service"
systemctl restart yingji.service
sleep 5
curl --fail --silent --show-error --max-time 20 "$health_url" >/dev/null
