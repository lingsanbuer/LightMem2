import test from "node:test";
import assert from "node:assert/strict";
import type { HistoryBlock } from "@ecoclaw/layer-history";
import { analyzeEvictionFromHistory } from "../src/eviction/analyzer.js";

test("eviction decision consumes HistoryBlock lifecycle state", () => {
  const blocks: HistoryBlock[] = [
    {
      blockId: "history-block:pointer-1",
      blockType: "pointer_stub",
      lifecycleState: "EVICTABLE",
      segmentIds: ["pointer-1"],
      text: "[compacted pointer stub]",
      charCount: 512,
      approxTokens: 128,
      toolName: "read",
      dataKey: "/workspace/spec.md",
      signalTypes: ["FAILED_TOOL_PATH"],
      transitionEvidence: [
        {
          fromState: "COMPACTED",
          toState: "EVICTABLE",
          reason: "pre-compacted block is outside recent window",
          signalTypes: ["FAILED_TOOL_PATH"],
        },
      ],
      metadata: {},
    },
  ];

  const decision = analyzeEvictionFromHistory(blocks, {
    enabled: true,
    policy: "lru",
    minBlockChars: 256,
  });

  assert.equal(decision.enabled, true);
  assert.equal(decision.policy, "lru");
  assert.equal(decision.blocks.length, 1);
  assert.equal(decision.instructions.length, 1);
  assert.equal(decision.instructions[0].blockId, "history-block:pointer-1");
  assert.equal(decision.instructions[0].estimatedSavedChars, 512);
  assert.deepEqual(decision.instructions[0].parameters?.segmentIds, ["pointer-1"]);
  assert.ok(decision.notes?.includes("source=history"));
});
