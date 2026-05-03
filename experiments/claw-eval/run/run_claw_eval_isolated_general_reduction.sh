#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${CLAW_EVAL_REPO_ROOT}/../../.." && pwd)"


ROOT_DIR="${PROJECT_ROOT}"
REPO_DIR="${CLAW_EVAL_REPO_ROOT}/../.."
BENCH_PY="${CLAW_EVAL_REPO_ROOT}/scripts/benchmark.py"
TASKS_DIR="${CLAW_EVAL_REPO_ROOT}/dataset/tasks"
SOURCE_DIR="${CLAW_EVAL_REPO_ROOT}/vendor"

export TOKENPILOT_OPENCLAW_HOME="${TOKENPILOT_OPENCLAW_HOME:-/mnt/20t/xubuqiang}"
export CLAW_EVAL_SOURCE_ROOT="${CLAW_EVAL_SOURCE_ROOT:-${SOURCE_DIR}}"
export XDG_CACHE_HOME="${XDG_CACHE_HOME:-/tmp/uv-cache}"
export UV_CACHE_DIR="${UV_CACHE_DIR:-/tmp/uv-cache}"
export PYTHONUNBUFFERED="${PYTHONUNBUFFERED:-1}"
export CLAW_EVAL_AGENT_TIMEOUT_SECONDS="${CLAW_EVAL_AGENT_TIMEOUT_SECONDS:-0}"
export TOKENPILOT_ENABLE_REDUCTION="${TOKENPILOT_ENABLE_REDUCTION:-true}"
export TOKENPILOT_ENABLE_EVICTION="${TOKENPILOT_ENABLE_EVICTION:-false}"
export TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED="${TOKENPILOT_TASK_STATE_ESTIMATOR_ENABLED:-false}"

SUITE="${CLAW_EVAL_SUITE:-general}"
MODEL="${CLAW_EVAL_MODEL:-tokenpilot/gpt-5.4-mini}"
LOG_FILE="${CLAW_EVAL_LOG_FILE:-${ROOT_DIR}/claw_eval_isolated_general_reduction.log}"
PID_FILE="${CLAW_EVAL_PID_FILE:-${ROOT_DIR}/claw_eval_isolated_general_reduction.pid}"
EXTRA_ARGS="${CLAW_EVAL_EXTRA_ARGS:-}"

mkdir -p "$(dirname "${LOG_FILE}")"

if [[ "${1:-}" == "--foreground" ]]; then
  cd "${ROOT_DIR}"
  exec uv run --directory "${SOURCE_DIR}" --extra mock python -u "${BENCH_PY}" \
    --tasks-dir "${TASKS_DIR}" \
    --suite "${SUITE}" \
    --session-mode isolated \
    --parallel 1 \
    --model "${MODEL}" \
    --apply-plugin-plan \
    --execute-tasks \
    ${EXTRA_ARGS}
fi

nohup bash "$0" --foreground > "${LOG_FILE}" 2>&1 &
echo $! > "${PID_FILE}"
echo "started claw-eval isolated general reduction-only run"
echo "pid=$(cat "${PID_FILE}")"
echo "log=${LOG_FILE}"
