/* eslint-disable @typescript-eslint/no-explicit-any */
import { commandHelpText, parseEcoClawCommand } from "./ecoclaw.js";
import type { SessionTopologyManager } from "../session/topology.js";

export function registerEcoClawCommand(
  api: any,
  logger: { debug: (message: string) => void; info: (message: string) => void },
  topology: SessionTopologyManager,
  cfg: { stateDir: string },
  helpers: {
    extractSessionKey: (context: any) => string;
    safeId: (value: string) => string;
    purgeTaskCacheWorkspace: (stateDir: string, taskId: string) => Promise<{ purged: string[] }>;
  },
): void {
  if (typeof api.registerCommand !== "function") {
    logger.debug("[ecoclaw] registerCommand unavailable, fallback to inline command parsing.");
    return;
  }

  const handler = async (ctxOrRaw?: any, legacyContext?: any) => {
    const args =
      typeof ctxOrRaw === "string"
        ? ctxOrRaw
        : typeof ctxOrRaw?.args === "string"
          ? ctxOrRaw.args
          : "";
    const context = legacyContext ?? ctxOrRaw ?? {};
    const cmd = parseEcoClawCommand(`ecoclaw ${String(args).trim()}`.trim());
    const sessionKey = helpers.extractSessionKey(context) || "unknown";
    logger.info(`[ecoclaw] command invoked kind=${cmd.kind} args="${String(args ?? "").trim()}" session=${sessionKey}`);
    if (cmd.kind === "status") {
      return { text: topology.getStatus(sessionKey) };
    }
    if (cmd.kind === "cache_new") {
      const logical = topology.newTaskCache(sessionKey, cmd.taskId);
      return {
        text:
          `Created task-cache and switched current binding.\n${topology.getStatus(sessionKey)}\nlogical=${logical}\n\n` +
          `Reminder: this switches EcoClaw task-cache only.\n` +
          `If you want a truly clean upstream OpenClaw context, run /new now.`,
      };
    }
    if (cmd.kind === "cache_list") {
      return { text: topology.listTaskCaches(sessionKey) };
    }
    if (cmd.kind === "cache_delete") {
      const removed = topology.deleteTaskCache(sessionKey, cmd.taskId);
      if (!removed) {
        return { text: `No matching task-cache found for ${cmd.taskId ? `"${helpers.safeId(cmd.taskId)}"` : "current binding"}.` };
      }
      const purge = await helpers.purgeTaskCacheWorkspace(cfg.stateDir, removed.removedTaskId);
      return {
        text: `Deleted task-cache "${removed.removedTaskId}" (bindings=${removed.removedBindings}, purged=${purge.purged.length}).\n${topology.getStatus(sessionKey)}\nlogical=${removed.switchedToLogical}`,
      };
    }
    if (cmd.kind === "session_new") {
      const logical = topology.newSession(sessionKey);
      return { text: `Created new session in current task-cache.\n${topology.getStatus(sessionKey)}\nlogical=${logical}` };
    }
    return { text: commandHelpText() };
  };

  api.registerCommand({
    name: "ecoclaw",
    description: "EcoClaw task-cache/session controls (try: /ecoclaw help)",
    acceptsArgs: true,
    handler,
    execute: handler,
  });
  logger.debug("[ecoclaw] Registered /ecoclaw command.");
}
