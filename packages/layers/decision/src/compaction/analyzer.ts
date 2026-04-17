import type { HistoryBlock } from "@ecoclaw/layer-history";
import type { CompactionDecision, CompactionInstruction } from "../types.js";

export type TurnLocalCompactionAnalyzerConfig = {
  enabled?: boolean;
  minSavedChars?: number;
  delayTurns?: number;
};

const DEFAULT_TURN_LOCAL_CONFIG: Required<TurnLocalCompactionAnalyzerConfig> = {
  enabled: true,
  minSavedChars: 100,
  delayTurns: 0,
};

function buildConsumedByPayload(
  block: HistoryBlock,
  blockById: Map<string, HistoryBlock>,
): Record<string, unknown> | undefined {
  const consumedByBlockId = block.consumedByBlockIds?.[0];
  if (!consumedByBlockId) return undefined;
  const consumedByBlock = blockById.get(consumedByBlockId);
  if (!consumedByBlock) return { blockId: consumedByBlockId };
  return {
    blockId: consumedByBlock.blockId,
    segmentId: consumedByBlock.segmentIds[0],
    toolName: consumedByBlock.toolName,
    writePreview: consumedByBlock.text.slice(0, 320),
  };
}

/**
 * Analyze HistoryBlock[] for turn-local compaction opportunities.
 *
 * First history-backed version:
 * - only compact blocks already marked COMPACTABLE by history lifecycle
 * - only compact tool_result blocks
 * - use history-owned signals/evidence instead of re-deriving the entire rule chain locally
 */
export function analyzeTurnLocalCompactionFromHistory(
  blocks: HistoryBlock[],
  config: TurnLocalCompactionAnalyzerConfig = DEFAULT_TURN_LOCAL_CONFIG,
): CompactionDecision {
  const cfg = { ...DEFAULT_TURN_LOCAL_CONFIG, ...config };
  const blockById = new Map(blocks.map((block) => [block.blockId, block]));

  if (!cfg.enabled) {
    return {
      enabled: false,
      instructions: [],
      estimatedSavedChars: 0,
      notes: ["turn_local_compaction_disabled"],
    };
  }

  const candidates = blocks.filter((block) =>
    block.blockType === "tool_result"
    && block.lifecycleState === "COMPACTABLE"
    && block.charCount >= cfg.minSavedChars,
  );

  if (candidates.length === 0) {
    return {
      enabled: true,
      instructions: [],
      estimatedSavedChars: 0,
      notes: ["no_compactable_history_blocks"],
    };
  }

  const instructions: CompactionInstruction[] = candidates.map((block) => {
    const signalSummary = (block.signals ?? [])
      .map((signal: NonNullable<HistoryBlock["signals"]>[number]) => signal.rationale)
      .slice(0, 3)
      .join("; ");
    const consumedBy = buildConsumedByPayload(block, blockById);

    return {
      strategy: "turn_local_evidence_compaction",
      segmentIds: [...block.segmentIds],
      confidence: 0.9,
      priority: 8,
      rationale: signalSummary || `history block ${block.blockId} is compactable`,
      parameters: {
        blockId: block.blockId,
        blockType: block.blockType,
        lifecycleState: block.lifecycleState,
        toolName: block.toolName,
        dataKey: block.dataKey,
        consumedBy,
        consumedByBlockIds: block.consumedByBlockIds ?? [],
        signalTypes: block.signalTypes ?? [],
      },
    };
  });

  const estimatedSavedChars = candidates.reduce((sum, block) => sum + block.charCount, 0);

  return {
    enabled: true,
    instructions,
    estimatedSavedChars,
    notes: [
      `analyzed_blocks=${blocks.length}`,
      `compactable_blocks=${candidates.length}`,
      `estimated_saved_chars=${estimatedSavedChars}`,
      "source=history",
    ],
  };
}

export function analyzeCompactionFromHistory(
  blocks: HistoryBlock[],
  config: {
    turnLocal?: TurnLocalCompactionAnalyzerConfig;
  } = {},
): CompactionDecision {
  const turnLocalDecision = analyzeTurnLocalCompactionFromHistory(blocks, config.turnLocal);

  return {
    enabled: true,
    instructions: turnLocalDecision.instructions.sort((a, b) => b.priority - a.priority),
    estimatedSavedChars: turnLocalDecision.estimatedSavedChars,
    notes: turnLocalDecision.notes,
  };
}
