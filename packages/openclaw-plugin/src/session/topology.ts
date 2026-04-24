export type SessionTaskBinding = {
  taskId: string;
  sessionSeq: number;
};

export type SessionTopologyManager = {
  getLogicalSessionId(sessionKey: string, upstreamSessionId?: string): string;
  getStatus(sessionKey: string): string;
  listTaskCaches(sessionKey: string): string;
  newTaskCache(sessionKey: string, taskId?: string): string;
  newSession(sessionKey: string): string;
  bindUpstreamSession(sessionKey: string, upstreamSessionId?: string): void;
  getUpstreamSessionId(sessionKey: string): string | null;
  deleteTaskCache(sessionKey: string, taskId?: string): {
    removedTaskId: string;
    removedBindings: number;
    switchedToLogical: string;
  } | null;
};

function safeId(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const norm = trimmed.replace(/[^a-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return norm || "main";
}

function buildLogicalSessionId(taskId: string, sessionSeq: number): string {
  return `ecoclaw-task-${safeId(taskId)}-s${Math.max(1, sessionSeq)}`;
}

export function createSessionTopologyManager(): SessionTopologyManager {
  const bindingBySessionKey = new Map<string, SessionTaskBinding>();
  const countersByTaskId = new Map<string, number>();
  const upstreamSessionIdBySessionKey = new Map<string, string>();
  let globalDefaultTaskId: string | null = null;

  function scopedFamilyPrefix(sessionKey: string): string | null {
    const key = (sessionKey || "").trim();
    if (!key.startsWith("scoped:")) return null;
    const parts = key.split(":");
    if (parts.length < 3) return null;
    return `${parts[0]}:${parts[1]}:${parts[2]}`;
  }

  function ensure(sessionKey: string, preferredTaskId?: string): SessionTaskBinding {
    const key = sessionKey || "unknown";
    const existing = bindingBySessionKey.get(key);
    if (existing) return existing;
    const defaultTaskId = safeId(preferredTaskId ?? globalDefaultTaskId ?? `default-${safeId(key)}`);
    const initialSeq = 1;
    const init: SessionTaskBinding = { taskId: defaultTaskId, sessionSeq: initialSeq };
    bindingBySessionKey.set(key, init);
    countersByTaskId.set(defaultTaskId, Math.max(countersByTaskId.get(defaultTaskId) ?? 0, initialSeq));
    return init;
  }

  return {
    getLogicalSessionId(sessionKey: string, upstreamSessionId?: string): string {
      const b = ensure(sessionKey);
      const base = buildLogicalSessionId(b.taskId, b.sessionSeq);
      const upstream = String(
        upstreamSessionId ?? upstreamSessionIdBySessionKey.get(sessionKey) ?? "",
      ).trim();
      if (!upstream) return base;
      return `${base}__oc_${safeId(upstream)}`;
    },
    getStatus(sessionKey: string): string {
      const b = ensure(sessionKey);
      const base = buildLogicalSessionId(b.taskId, b.sessionSeq);
      const upstream = upstreamSessionIdBySessionKey.get(sessionKey) ?? "-";
      return `sessionKey=${sessionKey} task=${b.taskId} logical=${base} seq=${b.sessionSeq} openclawSessionId=${upstream}`;
    },
    listTaskCaches(sessionKey: string): string {
      const current = ensure(sessionKey);
      const taskIds = new Set<string>();
      for (const binding of bindingBySessionKey.values()) taskIds.add(binding.taskId);
      for (const taskId of countersByTaskId.keys()) taskIds.add(taskId);
      const sorted = Array.from(taskIds).sort((a, b) => a.localeCompare(b));
      if (sorted.length === 0) {
        return `No task-cache found.\n${this.getStatus(sessionKey)}`;
      }
      const lines = ["Task-caches:"];
      for (const taskId of sorted) {
        const seqMax = Math.max(1, countersByTaskId.get(taskId) ?? 1);
        const activeBindings = Array.from(bindingBySessionKey.values()).filter((b) => b.taskId === taskId).length;
        const mark = taskId === current.taskId ? "*" : " ";
        lines.push(`${mark} ${taskId} (sessions<=${seqMax}, bindings=${activeBindings})`);
      }
      lines.push("", `current: ${current.taskId} -> ${buildLogicalSessionId(current.taskId, current.sessionSeq)}`);
      return lines.join("\n");
    },
    newTaskCache(sessionKey: string, taskId?: string): string {
      const chosenTaskId = safeId(taskId ?? `task-${Date.now()}`);
      const seq = 1;
      countersByTaskId.set(chosenTaskId, Math.max(countersByTaskId.get(chosenTaskId) ?? 0, seq));
      globalDefaultTaskId = chosenTaskId;
      bindingBySessionKey.set(sessionKey, { taskId: chosenTaskId, sessionSeq: seq });
      const family = scopedFamilyPrefix(sessionKey);
      if (family) {
        for (const [key] of bindingBySessionKey.entries()) {
          if (key === sessionKey) continue;
          if (key === family || key.startsWith(`${family}:`)) {
            bindingBySessionKey.set(key, { taskId: chosenTaskId, sessionSeq: seq });
          }
        }
      }
      return buildLogicalSessionId(chosenTaskId, seq);
    },
    newSession(sessionKey: string): string {
      const current = ensure(sessionKey);
      const next = (countersByTaskId.get(current.taskId) ?? current.sessionSeq) + 1;
      countersByTaskId.set(current.taskId, next);
      const updated: SessionTaskBinding = { taskId: current.taskId, sessionSeq: next };
      bindingBySessionKey.set(sessionKey, updated);
      const family = scopedFamilyPrefix(sessionKey);
      if (family) {
        for (const [key, binding] of bindingBySessionKey.entries()) {
          if (key === sessionKey) continue;
          if (binding.taskId !== current.taskId) continue;
          if (key === family || key.startsWith(`${family}:`)) {
            bindingBySessionKey.set(key, { taskId: current.taskId, sessionSeq: next });
          }
        }
      }
      return buildLogicalSessionId(updated.taskId, updated.sessionSeq);
    },
    bindUpstreamSession(sessionKey: string, upstreamSessionId?: string): void {
      const upstream = String(upstreamSessionId ?? "").trim();
      if (!upstream) return;
      upstreamSessionIdBySessionKey.set(sessionKey, upstream);
    },
    getUpstreamSessionId(sessionKey: string): string | null {
      return upstreamSessionIdBySessionKey.get(sessionKey) ?? null;
    },
    deleteTaskCache(sessionKey: string, taskId?: string) {
      const current = ensure(sessionKey);
      const targetTaskId = safeId(taskId ?? current.taskId);
      let removedBindings = 0;
      for (const [key, binding] of bindingBySessionKey.entries()) {
        if (binding.taskId === targetTaskId) {
          bindingBySessionKey.delete(key);
          removedBindings += 1;
        }
      }
      countersByTaskId.delete(targetTaskId);
      if (globalDefaultTaskId === targetTaskId) {
        globalDefaultTaskId = null;
      }
      if (removedBindings === 0) return null;
      const baseDefaultTaskId = `default-${safeId(sessionKey || "unknown")}`;
      const fallbackTaskId =
        targetTaskId === baseDefaultTaskId
          ? `${baseDefaultTaskId}-r${Date.now().toString(36)}`
          : baseDefaultTaskId;
      const fallback = ensure(sessionKey, fallbackTaskId);
      return {
        removedTaskId: targetTaskId,
        removedBindings,
        switchedToLogical: buildLogicalSessionId(fallback.taskId, fallback.sessionSeq),
      };
    },
  };
}
