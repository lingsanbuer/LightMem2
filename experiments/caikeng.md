# PinchBench / OpenClaw Runtime Pitfalls

## 2026-05-11: PinchBench continuous run writes native session store to global home

- Symptom:
  - `PinchBench` grading reported `Transcript not found ... Sessions dir contents: []`.
  - Task execution itself succeeded and produced workspace outputs.
  - TokenPilot canonical transcript existed under `tokenpilot-plugin-state/.../canonical-state/*.json`.

- Key evidence:
  - Runtime debug inside `lib_agent.py` showed:
    - `HOME=/tmp/.../openclaw_home`
    - `OPENCLAW_CONFIG_PATH=/tmp/.../.openclaw/openclaw.json`
    - `OPENCLAW_STATE_DIR=/tmp/.../.openclaw`
  - But after the run:
    - `/tmp/.../.openclaw/agents/bench-kuaipao.../sessions/` existed but was empty.
    - `/home/xubuqiang/.openclaw/agents/bench-kuaipao.../sessions/` contained updated `sessions.json` and `*.jsonl`.

- Conclusion:
  - In this setup, `openclaw agent` / gateway session persistence still wrote the native session store to the global home, not the temporary benchmark runtime home.
  - `PinchBench` transcript loader was reading the tmp runtime home, so it saw an empty native session store.
  - This is not a file permission failure. It is a runtime state-dir / home isolation mismatch.

- Consequence:
  - Benchmark task may run successfully, but grading can fail because transcript lookup and transcript persistence point at different homes.

- Temporary debugging hook:
  - `PINCHBENCH_DEBUG_OPENCLAW_RUNTIME=true`
  - Added logging for:
    - `HOME`
    - `OPENCLAW_CONFIG_PATH`
    - `OPENCLAW_STATE_DIR`
    - resolved agent store dir
    - `openclaw config file`
    - `openclaw agents list`

- Notes:
  - Do not "fix" this by making `PinchBench` depend on TokenPilot canonical transcript as the primary source, because other methods must also use the native OpenClaw transcript path.
  - Proper fix should make native `agents/<agent>/sessions/` persist into the same tmp runtime home that benchmark reads.
