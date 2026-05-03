#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${CLAW_EVAL_REPO_ROOT}/../../.." && pwd)"


ROOT_DIR="${PROJECT_ROOT}"
BASELINE_SCRIPT="${ROOT_DIR}/run_claw_eval_isolated_general.sh"
REDUCTION_SCRIPT="${ROOT_DIR}/run_claw_eval_isolated_general_reduction.sh"

BASELINE_LOG_FILE_DEFAULT="${ROOT_DIR}/claw_eval_isolated_general_baseline_then_reduction_baseline.log"
REDUCTION_LOG_FILE_DEFAULT="${ROOT_DIR}/claw_eval_isolated_general_baseline_then_reduction_reduction.log"
MASTER_LOG_FILE="${CLAW_EVAL_MASTER_LOG_FILE:-${ROOT_DIR}/claw_eval_isolated_general_baseline_then_reduction.log}"
MASTER_PID_FILE="${CLAW_EVAL_MASTER_PID_FILE:-${ROOT_DIR}/claw_eval_isolated_general_baseline_then_reduction.pid}"
BASELINE_PID_FILE="${ROOT_DIR}/claw_eval_isolated_general.pid"
REDUCTION_PID_FILE="${ROOT_DIR}/claw_eval_isolated_general_reduction.pid"

wait_for_pid_exit() {
  local pid="$1"
  while ps -p "$pid" > /dev/null 2>&1; do
    sleep 10
  done
}

run_sequence() {
  local baseline_log_file="${CLAW_EVAL_BASELINE_LOG_FILE:-${BASELINE_LOG_FILE_DEFAULT}}"
  local reduction_log_file="${CLAW_EVAL_REDUCTION_LOG_FILE:-${REDUCTION_LOG_FILE_DEFAULT}}"

  echo "[sequence] starting baseline run"
  CLAW_EVAL_LOG_FILE="${baseline_log_file}" bash "${BASELINE_SCRIPT}"
  local baseline_pid
  baseline_pid=$(cat "${BASELINE_PID_FILE}")
  echo "[sequence] baseline pid=${baseline_pid} log=${baseline_log_file}"
  wait_for_pid_exit "${baseline_pid}"
  echo "[sequence] baseline run completed"

  echo "[sequence] starting reduction-only plugin run"
  CLAW_EVAL_LOG_FILE="${reduction_log_file}" bash "${REDUCTION_SCRIPT}"
  local reduction_pid
  reduction_pid=$(cat "${REDUCTION_PID_FILE}")
  echo "[sequence] reduction pid=${reduction_pid} log=${reduction_log_file}"
  wait_for_pid_exit "${reduction_pid}"
  echo "[sequence] reduction-only plugin run completed"
}

if [[ "${1:-}" == "--foreground" ]]; then
  cd "${ROOT_DIR}"
  run_sequence
  exit 0
fi

mkdir -p "$(dirname "${MASTER_LOG_FILE}")"
nohup bash "$0" --foreground > "${MASTER_LOG_FILE}" 2>&1 &
echo $! > "${MASTER_PID_FILE}"
echo "started claw-eval isolated general baseline->reduction sequence"
echo "pid=$(cat "${MASTER_PID_FILE}")"
echo "log=${MASTER_LOG_FILE}"
