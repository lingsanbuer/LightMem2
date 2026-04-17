import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createEvictionModule } from "../src/composer/eviction/index.js";
import { createMockRuntime, createTurnContext } from "./test-utils.js";

test("eviction archives instructed segment and replaces it with recoverable stub", async () => {
  const workspaceDir = await mkdtemp(join(tmpdir(), "ecoclaw-eviction-"));
  const module = createEvictionModule({
    enabled: true,
    policy: "lru",
  });
  const runtime = createMockRuntime();
  const ctx = createTurnContext({
    sessionId: "session-eviction-1",
    segments: [
      {
        id: "tool-pointer-1",
        kind: "volatile",
        text: "B".repeat(800),
        priority: 6,
        source: "tool",
        metadata: {
          role: "tool",
          toolPayload: {
            toolName: "read",
            path: "/workspace/spec.md",
          },
        },
      },
    ],
    metadata: {
      workspaceDir,
      policy: {
        decisions: {
          eviction: {
            enabled: true,
            policy: "lru",
            blocks: [],
            instructions: [
              {
                blockId: "history-block:pointer-1",
                confidence: 0.85,
                priority: 9,
                rationale: "pre-compacted block is outside recent window",
                estimatedSavedChars: 800,
                parameters: {
                  segmentIds: ["tool-pointer-1"],
                  dataKey: "/workspace/spec.md",
                  toolName: "read",
                },
              },
            ],
            estimatedSavedChars: 800,
            notes: ["source=history"],
          },
        },
      },
    },
  });

  const nextCtx = await module.beforeCall!(ctx, runtime);
  const nextText = nextCtx.segments[0]?.text ?? "";
  assert.match(nextText, /\[Evicted read block for `\/workspace\/spec.md`\]/);
  assert.match(nextText, /memory_fault\('\/workspace\/spec.md'\)/);

  const evictionMeta = nextCtx.metadata?.eviction as Record<string, unknown> | undefined;
  assert.ok(evictionMeta);
  assert.equal(evictionMeta?.policy, "lru");
  assert.equal(evictionMeta?.instructionCount, 1);
  assert.equal(evictionMeta?.appliedCount, 1);

  const segmentMeta = nextCtx.segments[0]?.metadata?.eviction as Record<string, unknown> | undefined;
  assert.ok(segmentMeta);
  assert.equal(segmentMeta?.kind, "cached_pointer_stub");
  assert.equal(segmentMeta?.archived, true);
  assert.equal(typeof segmentMeta?.archivePath, "string");
});
