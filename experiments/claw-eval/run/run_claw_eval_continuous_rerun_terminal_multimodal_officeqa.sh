#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAW_EVAL_REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PROJECT_ROOT="$(cd "${CLAW_EVAL_REPO_ROOT}/../../.." && pwd)"


ROOT="/mnt/20t/xubuqiang/EcoClaw"
TASKS_DIR="$ROOT/TokenPilot/experiments/claw-eval/dataset/tasks"
BENCH_PY="$ROOT/TokenPilot/experiments/claw-eval/scripts/benchmark.py"
UPSTREAM_ROOT="$ROOT/claw-eval"
LOG_PATH="$ROOT/claw_eval_continuous_rerun_terminal_multimodal_officeqa.log"
PID_PATH="$ROOT/claw_eval_continuous_rerun_terminal_multimodal_officeqa.pid"
MODEL="${CLAW_EVAL_MODEL:-ecoclaw/gpt-5.4-mini}"
JUDGE="${CLAW_EVAL_JUDGE:-$MODEL}"

run_suite() {
  local name="$1"
  local suite="$2"
  echo "[group] starting ${name} at $(date '+%F %T')"
  TOKENPILOT_OPENCLAW_HOME=/mnt/20t/xubuqiang \
  CLAW_EVAL_SOURCE_ROOT="$UPSTREAM_ROOT" \
  XDG_CACHE_HOME=/tmp/uv-cache \
  UV_CACHE_DIR=/tmp/uv-cache \
  PYTHONUNBUFFERED=1 \
  uv run --directory "$UPSTREAM_ROOT" --extra mock \
  python -u "$BENCH_PY" \
    --tasks-dir "$TASKS_DIR" \
    --suite "$suite" \
    --session-mode continuous \
    --parallel 1 \
    --model "$MODEL" \
    --judge "$JUDGE" \
    --apply-plugin-plan \
    --execute-tasks
  echo "[group] finished ${name} at $(date '+%F %T')"
}

run_all() {
  run_suite terminal \
    'T100_reverse_decoder,T101_wal_recovery,T102_xss_filter,T103_schema_migration,T104_packet_decoder'
  run_suite multimodal_t_only \
    'T056zh_phone_model_comparison,T057_deepseek_logo_identification,T058zh_painting_identification,T072_restaurant_menu_contact'
  run_suite office_qa \
    'T076_officeqa_defense_spending,T077_officeqa_highest_dept_spending,T078_officeqa_max_yield_spread,T079_officeqa_zipf_exponent,T080_officeqa_bond_yield_change,T081_officeqa_cagr_trust_fund,T082_officeqa_qoq_esf_change,T083_officeqa_mad_excise_tax,T084_officeqa_geometric_mean_silver,T085_officeqa_army_expenditures'
}

if [[ "${1:-}" == "--foreground" ]]; then
  run_all
  exit 0
fi

nohup bash "$0" --foreground >"$LOG_PATH" 2>&1 &
echo $! >"$PID_PATH"
echo "log=$LOG_PATH"
echo "pid=$(cat "$PID_PATH")"
