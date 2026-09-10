#!/usr/bin/env bash
set -euo pipefail

deployment_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
health_url="${1:?Usage: health_watchdog.sh HEALTH_URL [ENV_FILE]}"
environment_file="${2:-${deployment_dir}/.env.production}"
compose_file="${deployment_dir}/compose.yml"

if curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 10 \
  --retry 2 --retry-delay 2 \
  "${health_url}" >/dev/null; then
  exit 0
fi

echo "Health endpoint failed; restarting the backend service" >&2
docker compose \
  --env-file "${environment_file}" \
  -f "${compose_file}" \
  restart backend

sleep 10
curl --fail --silent --show-error \
  --connect-timeout 5 --max-time 10 \
  "${health_url}" >/dev/null
echo "Backend recovered after restart"
