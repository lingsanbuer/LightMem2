import test from "node:test";
import assert from "node:assert/strict";
import { buildHistoryView } from "@ecoclaw/layer-history";
import { analyzeCompactionFromHistory } from "../src/compaction/analyzer.js";
import { createTurnContext } from "./test-utils.js";

test("compaction decision consumes HistoryBlock lifecycle state", () => {
  const ctx = createTurnContext({
    segments: [
      {
        id: "read-1",
        kind: "volatile",
        text: "A".repeat(600),
        priority: 5,
        source: "tool",
        metadata: {
          toolName: "read",
          path: "/workspace/spec.md",
        },
      },
      {
        id: "write-1",
        kind: "volatile",
        text: "Successfully wrote 120 bytes to /workspace/output.md",
        priority: 5,
        source: "tool",
        metadata: {
          toolName: "write",
          path: "/workspace/output.md",
        },
      },
    ],
  });

  const history = buildHistoryView(ctx);
  const readBlock = history.blocks.find((block) => block.segmentIds.includes("read-1"));
  assert.ok(readBlock);
  assert.equal(readBlock.lifecycleState, "COMPACTABLE");

  const decision = analyzeCompactionFromHistory(history.blocks);
  assert.equal(decision.enabled, true);
  assert.equal(decision.instructions.length, 1);
  assert.equal(decision.instructions[0].strategy, "turn_local_evidence_compaction");
  assert.deepEqual(decision.instructions[0].segmentIds, ["read-1"]);
  assert.deepEqual(decision.instructions[0].parameters?.consumedBy, {
    blockId: "history-block:write-1",
    segmentId: "write-1",
    toolName: "write",
    writePreview: "Successfully wrote 120 bytes to /workspace/output.md",
  });
  assert.ok(decision.notes?.includes("source=history"));
});
