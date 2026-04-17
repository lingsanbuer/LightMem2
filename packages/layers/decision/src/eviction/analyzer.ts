import type { HistoryBlock } from "@ecoclaw/layer-history";
import type { EvictionBlock, EvictionDecision, EvictionPolicy } from "../types.js";

export type EvictionAnalyzerConfig = {
  enabled?: boolean;
  policy?: EvictionPolicy;
  minBlockChars?: number;
};

const DEFAULT_EVICTION_CONFIG: Required<EvictionAnalyzerConfig> = {
  enabled: false,
  policy: "noop",
  minBlockChars: 256,
};

function buildBlocksFromHistory(
  blocks: HistoryBlock[],
  minBlockChars: number,
): EvictionBlock[] {
  return blocks
    .filter((block) => block.charCount >= minBlockChars)
    .map((block, index) => ({
      id: block.blockId,
      messageIds: [...block.segmentIds],
      blockType: block.blockType,
      chars: block.charCount,
      approxTokens: block.approxTokens,
      recencyRank: Math.max(0, blocks.length - index),
      frequency: block.signalTypes?.includes("REPEATED_READ") ? 2 : 1,
      regenerationCost:
        block.lifecycleState === "EVICTABLE"
          ? Math.max(1, Math.round(block.charCount / 8))
          : Math.max(1, Math.round(block.charCount / 16)),
      metadata: {
        ...(block.metadata ?? {}),
        lifecycleState: block.lifecycleState,
        toolName: block.toolName,
        dataKey: block.dataKey,
        signalTypes: block.signalTypes ?? [],
      },
    }));
}

export function analyzeEvictionFromHistory(
  historyBlocks: HistoryBlock[],
  config: EvictionAnalyzerConfig = DEFAULT_EVICTION_CONFIG,
): EvictionDecision {
  const cfg = { ...DEFAULT_EVICTION_CONFIG, ...config };
  if (!cfg.enabled) {
    return {
      enabled: false,
      policy: cfg.policy,
      blocks: [],
      instructions: [],
      estimatedSavedChars: 0,
      notes: ["eviction_disabled"],
    };
  }

  const blocks = buildBlocksFromHistory(historyBlocks, cfg.minBlockChars);
  const candidates = historyBlocks.filter((block) =>
    block.lifecycleState === "EVICTABLE"
    && block.charCount >= cfg.minBlockChars,
  );
  const instructions =
    cfg.policy === "noop"
      ? []
      : candidates.map((block, index) => ({
          blockId: block.blockId,
          confidence: 0.85,
          priority: Math.max(1, 10 - index),
          rationale:
            block.transitionEvidence?.[0]?.reason
            ?? `history block ${block.blockId} is eligible for eviction`,
          estimatedSavedChars: block.charCount,
          parameters: {
            lifecycleState: block.lifecycleState,
            blockType: block.blockType,
            segmentIds: [...block.segmentIds],
            toolName: block.toolName,
            dataKey: block.dataKey,
            signalTypes: block.signalTypes ?? [],
          },
        }));

  return {
    enabled: true,
    policy: cfg.policy,
    blocks,
    instructions,
    estimatedSavedChars: instructions.reduce((sum, item) => sum + item.estimatedSavedChars, 0),
    notes: [
      "source=history",
      `policy=${cfg.policy}`,
      `blocks=${blocks.length}`,
      `instructions=${instructions.length}`,
    ],
  };
}
