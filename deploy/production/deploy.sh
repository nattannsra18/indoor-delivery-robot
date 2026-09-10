#!/usr/bin/env bash
set -euo pipefail

deployment_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
environment_file="${1:-${deployment_dir}/.env.production}"
compose_file="${deployment_dir}/compose.yml"

python3 "${deployment_dir}/check_config.py" "${environment_file}"
docker compose \
  --env-file "${environment_file}" \
  -f "${compose_file}" \
  config --quiet
docker compose \
  --env-file "${environment_file}" \
  -f "${compose_file}" \
  build backend
docker compose \
  --env-file "${environment_file}" \
  -f "${compose_file}" \
  build frontend
docker compose \
  --env-file "${environment_file}" \
  -f "${compose_file}" \
  up --detach --no-build --wait --wait-timeout 180

echo "Production stack started. Check status with:"
echo "docker compose --env-file ${environment_file} -f ${compose_file} ps"
