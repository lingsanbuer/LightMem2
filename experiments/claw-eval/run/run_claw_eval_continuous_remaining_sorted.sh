#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${CLAW_EVAL_REPO_ROOT}/../../.." && pwd)"


ROOT="/mnt/20t/xubuqiang/EcoClaw"
TASKS_DIR="$ROOT/TokenPilot/experiments/claw-eval/dataset/tasks"
BENCH_PY="$ROOT/TokenPilot/experiments/claw-eval/scripts/benchmark.py"
UPSTREAM_ROOT="$ROOT/claw-eval"
LOG_PATH="$ROOT/claw_eval_continuous_remaining_sorted.log"
PID_PATH="$ROOT/claw_eval_continuous_remaining_sorted.pid"
MODEL="${CLAW_EVAL_MODEL:-ecoclaw/gpt-5.4-mini}"
JUDGE="${CLAW_EVAL_JUDGE:-$MODEL}"

# Remaining categories ordered small -> large.
# Excludes already completed: communication, productivity, finance, knowledge, operations, content, safety.
# Excludes office_qa for now due to OCR service gap.
CATS=(
  data_analysis
  file_ops
  memory
  organization
  rewriting
  coding
  compliance
  comprehension
  procurement
  security
  synthesis
  research
  multimodal
  terminal
  ops
  workflow
)

run_all() {
  for cat in "${CATS[@]}"; do
    echo "[category] starting ${cat} at $(date '+%F %T')"
    TOKENPILOT_OPENCLAW_HOME=/mnt/20t/xubuqiang \
    CLAW_EVAL_SOURCE_ROOT="$UPSTREAM_ROOT" \
    XDG_CACHE_HOME=/tmp/uv-cache \
    UV_CACHE_DIR=/tmp/uv-cache \
    PYTHONUNBUFFERED=1 \
    uv run --directory "$UPSTREAM_ROOT" --extra mock \
    python -u "$BENCH_PY" \
      --tasks-dir "$TASKS_DIR" \
      --suite "$cat" \
      --session-mode continuous \
      --parallel 1 \
      --model "$MODEL" \
      --judge "$JUDGE" \
      --apply-plugin-plan \
      --execute-tasks
    echo "[category] finished ${cat} at $(date '+%F %T')"
  done
}

if [[ "${1:-}" == "--foreground" ]]; then
  run_all
  exit 0
fi

nohup bash "$0" --foreground >"$LOG_PATH" 2>&1 &
echo $! >"$PID_PATH"
echo "log=$LOG_PATH"
echo "pid=$(cat "$PID_PATH")"
