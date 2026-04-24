import { join, dirname } from "node:path";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

export type RecentTurnBinding = {
  userMessage: string;
  matchKey: string;
  sessionKey: string;
  upstreamSessionId?: string;
  at: number;
};

function recentTurnBindingsPath(stateDir: string): string {
  return join(stateDir, "ecoclaw", "controls", "recent-turn-bindings.json");
}

export function loadRecentTurnBindingsFromState(
  stateDir: string,
  normalizeTurnBindingMessage: (text: string) => string,
): RecentTurnBinding[] {
  try {
    const parsed = JSON.parse(readFileSync(recentTurnBindingsPath(stateDir), "utf8"));
    if (!Array.isArray(parsed)) return [];
    const out: RecentTurnBinding[] = [];
    for (const entry of parsed) {
      if (!entry || typeof entry !== "object") continue;
      const userMessage = String((entry as any).userMessage ?? "").trim();
      const matchKey =
        String((entry as any).matchKey ?? "").trim() || normalizeTurnBindingMessage(userMessage);
      const sessionKey = String((entry as any).sessionKey ?? "").trim();
      const upstreamSessionId = String((entry as any).upstreamSessionId ?? "").trim() || undefined;
      const atRaw = Number((entry as any).at ?? 0);
      const at = Number.isFinite(atRaw) ? atRaw : 0;
      if (!userMessage || !matchKey || !sessionKey || !at) continue;
      out.push({ userMessage, matchKey, sessionKey, upstreamSessionId, at });
    }
    return out;
  } catch {
    return [];
  }
}

export function persistRecentTurnBindingsToState(stateDir: string, bindings: RecentTurnBinding[]): void {
  try {
    mkdirSync(dirname(recentTurnBindingsPath(stateDir)), { recursive: true });
    writeFileSync(recentTurnBindingsPath(stateDir), JSON.stringify(bindings.slice(-128), null, 2), "utf8");
  } catch {
    // Best-effort only: provider-side lookup can still rely on in-memory bindings if persistence fails.
  }
}
