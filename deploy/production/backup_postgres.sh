#!/usr/bin/env bash
set -euo pipefail

deployment_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
environment_file="${1:-${deployment_dir}/.env.production}"
backup_directory="${2:-${deployment_dir}/backups}"
compose_file="${deployment_dir}/compose.yml"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
temporary_file="${backup_directory}/.postgres-${timestamp}.dump.tmp"
backup_file="${backup_directory}/postgres-${timestamp}.dump"

if [[ ! -f "${environment_file}" ]]; then
  echo "Environment file not found: ${environment_file}" >&2
  exit 1
fi

mkdir -p "${backup_directory}"
chmod 700 "${backup_directory}"
if [[ -e "${backup_file}" || -e "${temporary_file}" ]]; then
  echo "Backup target already exists: ${backup_file}" >&2
  exit 1
fi
trap 'rm -f "${temporary_file}"' EXIT

docker compose \
  --env-file "${environment_file}" \
  -f "${compose_file}" \
  exec -T postgres sh -c \
  'exec pg_dump --format=custom --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' \
  > "${temporary_file}"

test -s "${temporary_file}"
mv "${temporary_file}" "${backup_file}"
chmod 600 "${backup_file}"
trap - EXIT

echo "PostgreSQL backup created: ${backup_file}"
