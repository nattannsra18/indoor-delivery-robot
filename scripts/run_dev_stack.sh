#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/$(basename "${BASH_SOURCE[0]}")"
readonly PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
readonly BACKEND_DIR="${PROJECT_ROOT}/backend"
readonly BACKEND_PYTHON="${BACKEND_DIR}/.venv/bin/python"
readonly BACKEND_ENV_FILE="${BACKEND_DIR}/.env"
readonly ROS_WORKSPACE="${AMR_ROS_WORKSPACE:-$(dirname "${PROJECT_ROOT}")/amr-navigation-vision-diagnostics}"
readonly SESSION_NAME="${AMR_DEV_SESSION:-indoor-delivery-dev}"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }
session_exists() { tmux has-session -t "${SESSION_NAME}" 2>/dev/null; }
require_command() { command -v "$1" >/dev/null 2>&1 || die "Required command not found: $1"; }
port_is_listening() { ss -H -ltn "sport = :$1" 2>/dev/null | grep -q .; }

configure_window() {
  local window_id="$1"
  local service="$2"
  tmux rename-window -t "${window_id}" "${service}"
  tmux set-option -w -t "${window_id}" automatic-rename off
  tmux set-option -w -t "${window_id}" remain-on-exit on
  tmux set-option -w -t "${window_id}" @amr_service "${service}"
}

find_service_window() {
  local requested_service="$1"
  local window_id window_name service
  while IFS='|' read -r window_id window_name service; do
    if [[ "${service}" == "${requested_service}" || ( -z "${service}" && "${window_name}" == "${requested_service}" ) ]]; then
      printf '%s\n' "${window_id}"
      return 0
    fi
  done < <(tmux list-windows -t "${SESSION_NAME}" -F '#{window_id}|#{window_name}|#{@amr_service}')
  return 1
}

run_fastapi() {
  cd "${BACKEND_DIR}"
  exec "${BACKEND_PYTHON}" -m uvicorn app.main:app --host 127.0.0.1 --port 8000
}

run_frontend() {
  cd "${PROJECT_ROOT}"
  exec npm run dev
}

source_ros() {
  # ROS environment hooks may read optional variables before defining them.
  # Temporarily disable nounset while sourcing the generated setup files.
  set +u
  # shellcheck disable=SC1091
  source /opt/ros/jazzy/setup.bash
  # shellcheck disable=SC1091
  source "${ROS_WORKSPACE}/install/setup.bash"
  set -u
}

run_gazebo() {
  cd "${ROS_WORKSPACE}"
  source_ros
  exec ros2 launch amr_bringup navigation.launch.py headless:=True
}

run_gazebo_gui() {
  cd "${ROS_WORKSPACE}"
  source_ros
  local deadline topics
  deadline=$((SECONDS + 120))

  printf '%s\n' "Waiting for Gazebo world and robot state..."

  while ((SECONDS < deadline)); do
    topics="$(
      timeout 5 gz topic -l 2>/dev/null || true
    )"

    if grep -Fxq "/world/warehouse/scene/info" <<<"${topics}" &&
      timeout 10 ros2 topic echo --once /odom >/dev/null 2>&1; then
      printf '%s\n' "Gazebo world and robot state are ready; starting GUI."
      exec gz sim -g -v 4
    fi
    sleep 1
  done

  die "Gazebo world and robot state did not become ready within 120 seconds"
}

run_bridge() {
  cd "${ROS_WORKSPACE}"
  source_ros
  local attempt
  for attempt in $(seq 1 120); do
    if curl --fail --silent http://127.0.0.1:8000/health >/dev/null 2>&1; then
      break
    fi
    [[ "${attempt}" -lt 120 ]] || die "FastAPI did not become healthy within 120 seconds"
    sleep 1
  done
  exec ros2 run amr_web_bridge web_bridge_node \
    --ros-args \
    -p server_url:=ws://127.0.0.1:8000 \
    -p robot_id:=robot01 \
    -p diagnostics_topic:=/diagnostics \
    -p path_topic:=/plan \
    -p path_max_poses:=500 \
    -p path_publish_period:=0.5 \
    -p emergency_stop_cmd_vel_topic:=/cmd_vel \
    -p emergency_stop_zero_rate:=10.0
}

ensure_shared_token() {
  local token
  token="$("${BACKEND_PYTHON}" - "${BACKEND_ENV_FILE}" <<'PY'
import secrets
import sys
from pathlib import Path
from dotenv import dotenv_values, set_key

env_path = Path(sys.argv[1])
env_path.touch(mode=0o600, exist_ok=True)
token = dotenv_values(env_path).get("ROBOT_WS_TOKEN") or secrets.token_hex(32)
set_key(str(env_path), "ROBOT_WS_TOKEN", token, quote_mode="never")
set_key(str(env_path), "ROBOT_WS_AUTH_REQUIRED", "true", quote_mode="never")
env_path.chmod(0o600)
print(token, end="")
PY
)"
  [[ -n "${token}" ]] || die "Unable to load or create ROBOT_WS_TOKEN"
  export ROBOT_WS_TOKEN="${token}"
  export ROBOT_WS_AUTH_REQUIRED=true
  export APP_ENV=development
  export SESSION_COOKIE_SECURE=false
  export RMW_IMPLEMENTATION=rmw_fastrtps_cpp
  export ROS_DOMAIN_ID=0
}

preflight_start() {
  require_command tmux
  require_command ss
  require_command curl
  require_command gz
  require_command npm
  require_command timeout
  [[ -f /opt/ros/jazzy/setup.bash ]] || die "ROS 2 Jazzy setup was not found"
  [[ -x "${BACKEND_PYTHON}" ]] || die "Backend virtual environment not found: ${BACKEND_PYTHON}"
  [[ -f "${PROJECT_ROOT}/package.json" ]] || die "Frontend package.json not found"
  [[ -f "${ROS_WORKSPACE}/install/setup.bash" ]] || die "ROS workspace is not built: ${ROS_WORKSPACE}"
  port_is_listening 8000 && die "Port 8000 is in use. Stop the manually started FastAPI first."
  port_is_listening 3000 && die "Port 3000 is in use. Stop the manually started Next.js server first."
  if pgrep -af '[w]eb_bridge_node' >/dev/null; then
    pgrep -af '[w]eb_bridge_node' >&2 || true
    die "A ROS Web Bridge is already running. Stop it before starting this stack."
  fi
  if pgrep -af '[n]avigation.launch.py' >/dev/null; then
    pgrep -af '[n]avigation.launch.py' >&2 || true
    die "Gazebo/Nav2 is already running. Stop it before starting this stack."
  fi
  if pgrep -af '[g]z sim -g' >/dev/null; then
    pgrep -af '[g]z sim -g' >&2 || true
    die "A Gazebo GUI is already running. Stop it before starting this stack."
  fi
  if pgrep -af '[g]z sim -r -s ' >/dev/null; then
    pgrep -af '[g]z sim -r -s ' >&2 || true
    die "A Gazebo server is already running. Stop it before starting this stack."
  fi
}

start_stack() {
  if session_exists; then
    printf 'Development stack is already running in tmux session %s.\n' "${SESSION_NAME}"
    print_status
    return
  fi
  preflight_start
  ensure_shared_token
  local quoted_script fastapi_window frontend_window gazebo_window gazebo_gui_window bridge_window
  printf -v quoted_script '%q' "${SCRIPT_PATH}"
  tmux new-session -d -s "${SESSION_NAME}" -n fastapi
  tmux set-environment -t "${SESSION_NAME}" ROBOT_WS_TOKEN "${ROBOT_WS_TOKEN}"
  tmux set-environment -t "${SESSION_NAME}" ROBOT_WS_AUTH_REQUIRED "${ROBOT_WS_AUTH_REQUIRED}"
  tmux set-environment -t "${SESSION_NAME}" APP_ENV "${APP_ENV}"
  tmux set-environment -t "${SESSION_NAME}" SESSION_COOKIE_SECURE "${SESSION_COOKIE_SECURE}"
  tmux set-environment -t "${SESSION_NAME}" RMW_IMPLEMENTATION "${RMW_IMPLEMENTATION}"
  tmux set-environment -t "${SESSION_NAME}" ROS_DOMAIN_ID "${ROS_DOMAIN_ID}"
  fastapi_window="$(tmux display-message -p -t "${SESSION_NAME}:fastapi" '#{window_id}')"
  configure_window "${fastapi_window}" fastapi
  tmux respawn-pane -k -t "${fastapi_window}" "${quoted_script} __fastapi"
  frontend_window="$(tmux new-window -d -P -F '#{window_id}' -t "${SESSION_NAME}" -n frontend)"
  configure_window "${frontend_window}" frontend
  tmux respawn-pane -k -t "${frontend_window}" "${quoted_script} __frontend"
  gazebo_window="$(tmux new-window -d -P -F '#{window_id}' -t "${SESSION_NAME}" -n gazebo)"
  configure_window "${gazebo_window}" gazebo
  tmux respawn-pane -k -t "${gazebo_window}" "${quoted_script} __gazebo"
  gazebo_gui_window="$(tmux new-window -d -P -F '#{window_id}' -t "${SESSION_NAME}" -n gazebo_gui)"
  configure_window "${gazebo_gui_window}" gazebo_gui
  tmux respawn-pane -k -t "${gazebo_gui_window}" "${quoted_script} __gazebo_gui"
  bridge_window="$(tmux new-window -d -P -F '#{window_id}' -t "${SESSION_NAME}" -n bridge)"
  configure_window "${bridge_window}" bridge
  tmux respawn-pane -k -t "${bridge_window}" "${quoted_script} __bridge"
  tmux select-window -t "${fastapi_window}"
  printf 'Started development stack in tmux session %s.\n' "${SESSION_NAME}"
  printf 'Attach: %s attach\nStatus: %s status\nStop:   %s stop\n' "${SCRIPT_PATH}" "${SCRIPT_PATH}" "${SCRIPT_PATH}"
}

stop_stack() {
  if ! session_exists; then printf 'Development stack is not running.\n'; return; fi
  printf 'Stopping development stack gracefully...\n'
  while IFS= read -r pane_id; do
    tmux send-keys -t "${pane_id}" C-c 2>/dev/null || true
  done < <(tmux list-panes -s -t "${SESSION_NAME}" -F '#{pane_id}')
  sleep 3
  session_exists && tmux kill-session -t "${SESSION_NAME}"
  printf 'Development stack stopped.\n'
}

restart_stack() { stop_stack; start_stack; }

print_status() {
  if ! session_exists; then printf 'Development stack: stopped\n'; return 1; fi
  printf 'Development stack: running\n'
  tmux list-windows -t "${SESSION_NAME}" -F '  #{window_name}: #{pane_current_command} (#{?pane_dead,exited,running})'
  if curl --fail --silent http://127.0.0.1:8000/health >/dev/null 2>&1; then
    printf '  FastAPI health: ready\n'
  else
    printf '  FastAPI health: starting/unavailable\n'
  fi
}

attach_stack() {
  session_exists || die "Development stack is not running"
  exec tmux attach-session -t "${SESSION_NAME}"
}

show_logs() {
  session_exists || die "Development stack is not running"
  local service="${1:-}" window_target
  if [[ -n "${service}" ]]; then
    window_target="$(find_service_window "${service}")" \
      || die "Unknown service '${service}'. Use fastapi, frontend, gazebo, gazebo_gui, or bridge."
    tmux capture-pane -p -t "${window_target}" -S -200
    return
  fi
  for service in fastapi frontend gazebo gazebo_gui bridge; do
    printf '\n===== %s =====\n' "${service}"
    if window_target="$(find_service_window "${service}")"; then
      tmux capture-pane -p -t "${window_target}" -S -40
    else
      printf 'Service window is unavailable. Restart the stack to recreate it.\n'
    fi
  done
}

print_help() {
  cat <<EOF
Usage: ./scripts/run_dev_stack.sh [command]

  start             Start FastAPI, Next.js, Gazebo/Nav2, Gazebo GUI, and ROS Bridge (default)
  stop              Gracefully stop this script's services
  restart           Stop and start the complete stack with the saved token
  status            Show service windows and FastAPI readiness
  attach            Open tmux (Ctrl+b then 0-4 changes windows; Ctrl+b d detaches)
  logs [service]    Show logs for all services or one named service
  help              Show this help

Overrides: AMR_ROS_WORKSPACE and AMR_DEV_SESSION
EOF
}

case "${1:-start}" in
  __fastapi) run_fastapi ;;
  __frontend) run_frontend ;;
  __gazebo) run_gazebo ;;
  __gazebo_gui) run_gazebo_gui ;;
  __bridge) run_bridge ;;
  start) start_stack ;;
  stop) stop_stack ;;
  restart) restart_stack ;;
  status) print_status ;;
  attach) attach_stack ;;
  logs) show_logs "${2:-}" ;;
  help|-h|--help) print_help ;;
  *) die "Unknown command '$1'. Run ./scripts/run_dev_stack.sh help." ;;
esac
