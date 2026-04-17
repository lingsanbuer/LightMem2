import type { ContextSegment } from "@ecoclaw/kernel";

export type HistoryBlockType =
  | "tool_result"
  | "write_result"
  | "assistant_reply"
  | "system_context"
  | "summary_seed"
  | "pointer_stub"
  | "other";

export type HistoryLifecycleState =
  | "ACTIVE"
  | "COMPACTABLE"
  | "COMPACTED"
  | "EVICTABLE"
  | "EVICTED_CACHED"
  | "EVICTED_DROPPED";

export type HistorySignalType =
  | "READ_CONSUMED_BY_WRITE"
  | "REPEATED_READ"
  | "FAILED_TOOL_PATH"
  | "LARGE_BLOCK"
  | "RECENT_BLOCK";

export type HistoryBlock = {
  blockId: string;
  blockType: HistoryBlockType;
  lifecycleState: HistoryLifecycleState;
  segmentIds: string[];
  text: string;
  charCount: number;
  approxTokens: number;
  createdAt?: string;
  source?: string;
  toolName?: string;
  dataKey?: string;
  priority?: number;
  localityScore?: number;
  importanceScore?: number;
  signals?: HistorySignal[];
  signalTypes?: HistorySignalType[];
  consumedByBlockIds?: string[];
  transitionEvidence?: HistoryTransitionEvidence[];
  metadata?: Record<string, unknown>;
};

export type HistorySignal = {
  type: HistorySignalType;
  blockId: string;
  confidence: number;
  rationale: string;
  metadata?: Record<string, unknown>;
};

export type HistoryTransitionEvidence = {
  fromState: HistoryLifecycleState;
  toState: HistoryLifecycleState;
  reason: string;
  signalTypes: HistorySignalType[];
};

export type HistoryChunkingResult = {
  blocks: HistoryBlock[];
  segmentToBlockId: Map<string, string>;
};

export type HistoryChunkingConfig = {
  largeBlockChars?: number;
};

export type HistoryScoringConfig = {
  recentWindowSize?: number;
  largeBlockChars?: number;
};

export type HistorySegmentLike = ContextSegment;

export type HistoryLifecycleConfig = {
  compactableSignalConfidenceMin?: number;
};

export type HistoryLifecycleDerivationResult = {
  blocks: HistoryBlock[];
  blockSignals: Map<string, HistorySignal[]>;
};
