/**
 * Compaction module - event-driven single executor:
 *
 * - Policy/trigger layer decides WHAT to compact and WHEN.
 * - Execution layer applies compaction instructions with one executor.
 *
 * This intentionally avoids coupling compaction execution to session-global
 * summarization/fork behavior.
 */

// Shared types & config
export * from "./types.js";

// Compaction executor layer (flattened from turn-local/)
export * from "./turn-local-compaction.js";

import type { RuntimeModule } from "@ecoclaw/kernel";
import type { CompactionModuleConfig } from "./types.js";
import { runTurnLocalEvidenceCompaction } from "./turn-local-compaction.js";

export function createCompactionModule(cfg: CompactionModuleConfig = {}): RuntimeModule {
  return {
    name: "module-compaction",
    async beforeCall(ctx) {
      const turnLocal = await runTurnLocalEvidenceCompaction(ctx, {
        enabled: cfg.turnLocalCompaction?.enabled ?? false,
        archiveDir: cfg.turnLocalCompaction?.archiveDir,
      });
      return turnLocal.turnCtx;
    },
    async afterCall(_ctx, result) {
      return result;
    },
  };
}
