import type { ContextSegment } from "@ecoclaw/kernel";
import type { ReductionPassHandler } from "../../composer/reduction/types.js";
import {
  clearRecoveryState,
  readArchive,
  readRecoveryState,
  resolveArchivePathFromLookup,
  resolveRecoveryStateDir,
  writeRecoveryState,
  type ArchiveRecoveryRequest,
} from "../archive-recovery/index.js";

type MemoryFaultRecoveryConfig = {
  enabled: boolean;
  noteLabel: string;
  stateDir?: string;
  maxRecoveriesPerTurn: number;
};

const parsePositiveInt = (value: unknown, fallback: number): number =>
  typeof value === "number" && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : fallback;

const parseBool = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

const resolveConfig = (options?: Record<string, unknown>): MemoryFaultRecoveryConfig => ({
  enabled: parseBool(options?.enabled, true),
  noteLabel:
    typeof options?.noteLabel === "string" && options.noteLabel.trim().length > 0
      ? options.noteLabel.trim()
      : "memory_fault_recovery",
  stateDir: typeof options?.stateDir === "string" ? options.stateDir : undefined,
  maxRecoveriesPerTurn: parsePositiveInt(options?.maxRecoveriesPerTurn, 10),
});

export const memoryFaultRecoveryPass: ReductionPassHandler = {
  beforeCall: async ({ turnCtx, spec }) => {
    const config = resolveConfig(spec.options);

    if (!config.enabled) {
      return {
        changed: false,
        skippedReason: "pass_disabled",
      };
    }

    const stateDir = resolveRecoveryStateDir(config.stateDir);

    let usedSessionId = turnCtx.sessionId;
    let faultState = await readRecoveryState(stateDir, turnCtx.sessionId);
    let pendingRecoveries = faultState.pendingRecoveries ?? [];
    if (pendingRecoveries.length === 0 && turnCtx.sessionId !== "proxy-session") {
      usedSessionId = "proxy-session";
      faultState = await readRecoveryState(stateDir, "proxy-session");
      pendingRecoveries = faultState.pendingRecoveries ?? [];
    }

    if (pendingRecoveries.length === 0) {
      return {
        changed: false,
        skippedReason: "no_pending_fault_recoveries",
      };
    }

    const toRecover = pendingRecoveries.slice(0, config.maxRecoveriesPerTurn);
    const untried = pendingRecoveries.slice(config.maxRecoveriesPerTurn);

    const recoveredSegments: ContextSegment[] = [];
    const recoveredDataKeys: string[] = [];
    const failedFaultEntries: ArchiveRecoveryRequest[] = [];
    let totalRecoveredChars = 0;

    for (const fault of toRecover) {
      let archivePath = fault.archivePath;
      if (!archivePath) {
        archivePath = (await resolveArchivePathFromLookup(fault.dataKey, stateDir, usedSessionId)) ?? "";
      }
      const archive = await readArchive(archivePath);
      if (!archive) {
        failedFaultEntries.push(fault);
        continue;
      }

      recoveredDataKeys.push(fault.dataKey);
      totalRecoveredChars += archive.originalText.length;

      const segmentId = `memory-fault-recovery-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const recoveryText =
        `\n\n[Memory Fault Recovery] Recovered content for: ${fault.dataKey}\n` +
        `Original size: ${archive.originalSize.toLocaleString()} chars\n` +
        `Archived by: ${archive.sourcePass}\n` +
        `--- Recovered Content ---\n` +
        `${archive.originalText}\n` +
        `--- End Recovered Content ---\n`;

      recoveredSegments.push({
        id: segmentId,
        kind: "volatile",
        text: recoveryText,
        priority: 200,
        source: "memory_fault_recovery",
        metadata: {
          dataKey: fault.dataKey,
          archivePath: archivePath || fault.archivePath,
          originalSize: archive.originalSize,
          sourcePass: archive.sourcePass,
          recoveredAt: new Date().toISOString(),
          faultRequestedAt: new Date(fault.requestedAt).toISOString(),
        },
      });
    }

    if (recoveredSegments.length === 0) {
      const toKeep = [...untried, ...failedFaultEntries];
      if (toKeep.length > 0) {
        try {
          await writeRecoveryState(stateDir, usedSessionId, { pendingRecoveries: toKeep });
        } catch {
          // Best effort.
        }
      } else {
        await clearRecoveryState(stateDir, usedSessionId);
      }
      return {
        changed: false,
        skippedReason: "no_recoveries_this_turn",
        note: `failedDataKeys=${failedFaultEntries.map((f) => f.dataKey).join(",")}`,
      };
    }

    const nextSegments = [...turnCtx.segments, ...recoveredSegments];
    const toKeep = [...untried, ...failedFaultEntries];
    if (toKeep.length > 0) {
      try {
        await writeRecoveryState(stateDir, usedSessionId, { pendingRecoveries: toKeep });
      } catch {
        // Best effort.
      }
    } else {
      await clearRecoveryState(stateDir, usedSessionId);
    }

    return {
      changed: true,
      turnCtx: {
        ...turnCtx,
        segments: nextSegments,
      },
      note: `${config.noteLabel}:recovered=${recoveredSegments.length},chars=${totalRecoveredChars.toLocaleString()},failed=${failedFaultEntries.length}`,
      touchedSegmentIds: recoveredSegments.map((s) => s.id),
      metadata: {
        recoveredDataKeys,
        failedDataKeys: failedFaultEntries.map((f) => f.dataKey),
        totalRecoveredChars,
        stillPending: toKeep.length,
      },
    };
  },
};
