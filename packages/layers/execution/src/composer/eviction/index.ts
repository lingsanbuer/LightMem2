import {
  ECOCLAW_EVENT_TYPES,
  appendContextEvent,
  type RuntimeModule,
} from "@ecoclaw/kernel";
import type { EvictionDecision, EvictionInstruction, EvictionPolicy } from "@ecoclaw/layer-decision";
import { archiveContent, buildRecoveryHint } from "../../atomic/archive-recovery/index.js";

export type EvictionModuleConfig = {
  enabled?: boolean;
  policy?: EvictionPolicy;
};

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function readPolicyEvictionDecision(metadata: Record<string, unknown> | undefined): EvictionDecision | undefined {
  const policy = asRecord(metadata?.policy);
  const decisions = asRecord(policy?.decisions);
  const eviction = asRecord(decisions?.eviction);
  if (!eviction) return undefined;
  const policyName = typeof eviction.policy === "string" ? eviction.policy : "noop";
  const blocks = Array.isArray(eviction.blocks) ? eviction.blocks : [];
  const instructions = Array.isArray(eviction.instructions) ? eviction.instructions : [];
  const estimatedSavedChars =
    typeof eviction.estimatedSavedChars === "number" ? eviction.estimatedSavedChars : 0;
  const notes = Array.isArray(eviction.notes)
    ? eviction.notes.map((item) => String(item))
    : undefined;
  return {
    enabled: eviction.enabled === true,
    policy: policyName,
    blocks: blocks as EvictionDecision["blocks"],
    instructions: instructions as EvictionDecision["instructions"],
    estimatedSavedChars,
    notes,
  };
}

function normalizeToolName(metadata: Record<string, unknown> | undefined): string {
  const toolPayload = asRecord(metadata?.toolPayload);
  const directToolName = typeof metadata?.toolName === "string" ? metadata.toolName : undefined;
  const payloadToolName =
    typeof toolPayload?.toolName === "string" ? (toolPayload.toolName as string) : undefined;
  return (directToolName ?? payloadToolName ?? "context").trim() || "context";
}

function extractDataKey(
  metadata: Record<string, unknown> | undefined,
  fallbackSegmentId: string,
): string {
  const toolPayload = asRecord(metadata?.toolPayload);
  const candidates = [
    metadata?.path,
    metadata?.file_path,
    metadata?.filePath,
    toolPayload?.path,
    toolPayload?.file_path,
    toolPayload?.filePath,
  ];
  for (const value of candidates) {
    if (typeof value !== "string") continue;
    const trimmed = value.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return `segment:${fallbackSegmentId}`;
}

function readInstructionSegmentIds(instruction: EvictionInstruction): string[] {
  const parameters = asRecord(instruction.parameters);
  const raw = parameters?.segmentIds;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
    .map((item) => item.trim());
}

function buildEvictedStub(params: {
  toolName: string;
  dataKey: string;
  archivePath: string;
  originalSize: number;
  rationale: string;
}): string {
  const truncatedRationale = params.rationale.trim().slice(0, 220);
  return (
    `[Evicted ${params.toolName} block for \`${params.dataKey}\`] ` +
    (truncatedRationale ? `${truncatedRationale}. ` : "") +
    buildRecoveryHint({
      dataKey: params.dataKey,
      originalSize: params.originalSize,
      archivePath: params.archivePath,
      sourceLabel: "Evicted block",
    })
  );
}

export function createEvictionModule(cfg: EvictionModuleConfig = {}): RuntimeModule {
  const enabled = cfg.enabled ?? false;
  const fallbackPolicy: EvictionPolicy = cfg.policy ?? "noop";
  return {
    name: "module-eviction",
    async beforeCall(ctx) {
      if (!enabled) return ctx;

      const decision = readPolicyEvictionDecision(ctx.metadata) ?? {
        enabled: true,
        policy: fallbackPolicy,
        blocks: [],
        instructions: [],
        estimatedSavedChars: 0,
        notes: ["eviction_policy_decision_unavailable"],
      };

      const replacements = new Map<string, { text: string; archivePath: string; dataKey: string }>();
      if (decision.policy !== "noop") {
        for (const instruction of decision.instructions) {
          const segmentIds = readInstructionSegmentIds(instruction);
          for (const segmentId of segmentIds) {
            if (replacements.has(segmentId)) continue;
            const segment = ctx.segments.find((entry) => entry.id === segmentId);
            if (!segment) continue;
            const metadata = asRecord(segment.metadata);
            const toolName = normalizeToolName(metadata);
            const dataKey = extractDataKey(metadata, segment.id);
            const workspaceDir =
              typeof ctx.metadata?.workspaceDir === "string" ? ctx.metadata.workspaceDir : undefined;
            const { archivePath } = await archiveContent({
              sessionId: ctx.sessionId,
              segmentId: segment.id,
              sourcePass: "eviction",
              toolName,
              dataKey,
              originalText: segment.text,
              workspaceDir,
              metadata: {
                evictionPolicy: decision.policy,
                instructionPriority: instruction.priority,
                rationale: instruction.rationale,
              },
            });
            replacements.set(segmentId, {
              text: buildEvictedStub({
                toolName,
                dataKey,
                archivePath,
                originalSize: segment.text.length,
                rationale: instruction.rationale,
              }),
              archivePath,
              dataKey,
            });
          }
        }
      }

      const nextSegments = replacements.size === 0
        ? ctx.segments
        : ctx.segments.map((segment) => {
            const replacement = replacements.get(segment.id);
            if (!replacement) return segment;
            return {
              ...segment,
              text: replacement.text,
              metadata: {
                ...(segment.metadata ?? {}),
                eviction: {
                  kind: "cached_pointer_stub",
                  archived: true,
                  archivePath: replacement.archivePath,
                  dataKey: replacement.dataKey,
                  policy: decision.policy,
                },
              },
            };
          });

      const nextCtx = {
        ...ctx,
        segments: nextSegments,
        metadata: {
          ...(ctx.metadata ?? {}),
          eviction: {
            policy: decision.policy,
            blockCount: decision.blocks.length,
            instructionCount: decision.instructions.length,
            estimatedSavedChars: decision.estimatedSavedChars,
            appliedCount: replacements.size,
            notes: decision.notes ?? ["eviction_noop_placeholder"],
          },
        },
      };

      return appendContextEvent(nextCtx, {
        type: ECOCLAW_EVENT_TYPES.EVICTION_PLAN_EVALUATED,
        source: "module-eviction",
        at: new Date().toISOString(),
        payload: {
          policy: decision.policy,
          blockCount: decision.blocks.length,
          instructionCount: decision.instructions.length,
          estimatedSavedChars: decision.estimatedSavedChars,
          appliedCount: replacements.size,
          notes: decision.notes,
        },
      });
    },
  };
}
