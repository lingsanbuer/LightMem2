import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { appendCodexRecentTurnBinding, upsertCodexSessionSnapshot } from "../src/session-state.js";
import { renderCodexSessionReport } from "../src/session-report.js";

test("codex session report renders topology and recent reduction metrics", async () => {
  const dir = await mkdtemp(join(tmpdir(), "tokenpilot-codex-report-"));
  try {
    await upsertCodexSessionSnapshot(dir, "sess-1", {
      latestResponseId: "resp-2",
      previousResponseId: "resp-1",
      latestModel: "gpt-test",
      workspaceHint: "/tmp/work",
    });
    await appendCodexRecentTurnBinding(dir, {
      sessionId: "sess-1",
      responseId: "resp-2",
      previousResponseId: "resp-1",
      model: "gpt-test",
      requestChars: 12,
      responseChars: 34,
      assistantChars: 20,
      stream: false,
      updatedAt: new Date().toISOString(),
    });
    await mkdir(join(dir, "ux-effects", "sessions"), { recursive: true });
    await writeFile(
      join(dir, "ux-effects", "latest.json"),
      `${JSON.stringify({
        sessionId: "sess-1",
        countMode: "chars",
        details: {
          requestSavedCount: 800,
        },
      }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(dir, "ux-effects", "sessions", "sess-1.json"),
      `${JSON.stringify({
        sessionId: "sess-1",
        turns: 1,
        latestCountMode: "chars",
        tokenOptimizedTurns: 0,
        tokenSavedCount: 0,
        avgSavedTokensPerOptimizedTurn: 0,
        charOptimizedTurns: 1,
        charSavedCount: 800,
        avgSavedCharsPerOptimizedTurn: 800,
      }, null, 2)}\n`,
      "utf8",
    );
    await writeFile(
      join(dir, "ux-effects", "history.jsonl"),
      `${JSON.stringify({
        sessionId: "sess-1",
        details: {
          routeSavedChars: {
            code_like: 500,
            readme_doc: 300,
          },
          routeHitCount: {
            code_like: 2,
            readme_doc: 1,
          },
          passSavedChars: {
            tool_payload_trim: 700,
            read_state_compaction: 100,
          },
          recoveryObservedSegments: 2,
          recoverySkippedSegments: 2,
        },
      })}\n`,
      "utf8",
    );

    const report = await renderCodexSessionReport(dir, "sess-1");

    assert.match(report, /^Session: sess-1/m);
    assert.match(report, /^Response chain: resp-2/m);
    assert.match(report, /TokenPilot Codex report:/);
    assert.match(report, /saved chars: 800/i);
    assert.match(report, /latest request savings: 800 chars/i);
    assert.match(report, /recent top routes: code_like=500 chars\/2 hits, readme_doc=300 chars\/1 hits/i);
    assert.match(report, /recent top passes: tool_payload_trim=700 chars, read_state_compaction=100 chars/i);
    assert.match(report, /recent recovery segments: observed=2, exempted=2/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
