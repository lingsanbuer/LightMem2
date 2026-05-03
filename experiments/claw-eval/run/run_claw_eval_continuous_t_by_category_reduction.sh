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

MODEL="${CLAW_EVAL_MODEL:-tokenpilot/gpt-5.4-mini}"
LOG_FILE="${CLAW_EVAL_LOG_FILE:-${ROOT_DIR}/claw_eval_continuous_t_by_category_reduction.log}"
PID_FILE="${CLAW_EVAL_PID_FILE:-${ROOT_DIR}/claw_eval_continuous_t_by_category_reduction.pid}"
EXTRA_ARGS="${CLAW_EVAL_EXTRA_ARGS:-}"

CATEGORY_ROWS=$(python3 - <<'PY'
from pathlib import Path
from collections import OrderedDict
import yaml
root = Path('/mnt/20t/xubuqiang/EcoClaw/TokenPilot/experiments/claw-eval/dataset/tasks')
by_cat = OrderedDict()
for task_yaml in sorted(root.glob('*/task.yaml')):
    task_id = task_yaml.parent.name
    if not task_id.startswith('T'):
        continue
    data = yaml.safe_load(task_yaml.read_text(encoding='utf-8')) or {}
    cat = str(data.get('category') or 'uncategorized')
    by_cat.setdefault(cat, []).append(task_id)
for cat, ids in by_cat.items():
    print(f"{cat}\t{','.join(ids)}")
PY
)

mkdir -p "$(dirname "${LOG_FILE}")"

run_foreground() {
  cd "${ROOT_DIR}"
  while IFS=$'\t' read -r category suite; do
    [[ -z "${category}" ]] && continue
    echo "[category] ${category} count=$(python3 - <<PY
suite = '''${suite}'''.strip()
print(0 if not suite else len([x for x in suite.split(',') if x]))
PY
)"
    uv run --directory "${SOURCE_DIR}" --extra mock python -u "${BENCH_PY}" \
      --tasks-dir "${TASKS_DIR}" \
      --suite "${suite}" \
      --session-mode continuous \
      --parallel 1 \
      --model "${MODEL}" \
      --judge "${MODEL}" \
      --apply-plugin-plan \
      --execute-tasks \
      ${EXTRA_ARGS}
  done <<< "${CATEGORY_ROWS}"
}

if [[ "${1:-}" == "--foreground" ]]; then
  run_foreground
  exit 0
fi

nohup bash "$0" --foreground > "${LOG_FILE}" 2>&1 &
echo $! > "${PID_FILE}"
echo "started claw-eval continuous T* by-category reduction-only run"
echo "pid=$(cat "${PID_FILE}")"
echo "log=${LOG_FILE}"
