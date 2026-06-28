import type { TokenPilotProductSurfaceConfigAdapter, TokenPilotProductCommandResult } from "@tokenpilot/host-adapter";
import {
  formatSessionReport,
  getNestedValue,
  type ProductSurfaceLatestUxEffect,
  type ProductSurfaceSessionAggregate,
} from "@tokenpilot/product-surface";

type LatestUxEffectWithSessionId = ProductSurfaceLatestUxEffect & {
  sessionId?: string | null;
};

function normalizeSessionId(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim() : "";
  return text || undefined;
}

export async function resolvePreferredSessionId(params: {
  explicitSessionId?: string;
  stateDir?: string;
  resolveLatestSessionId(stateDir: string): Promise<string | undefined>;
  readLatestUxEffect(stateDir: string): Promise<{ sessionId?: string | null } | null>;
}): Promise<string | undefined> {
  const explicitSessionId = normalizeSessionId(params.explicitSessionId);
  if (explicitSessionId) return explicitSessionId;
  const stateDir = normalizeSessionId(params.stateDir);
  if (!stateDir) return undefined;
  return normalizeSessionId(await params.resolveLatestSessionId(stateDir))
    ?? normalizeSessionId((await params.readLatestUxEffect(stateDir))?.sessionId);
}

export async function buildSessionReportResult(params: {
  currentConfig: Record<string, unknown>;
  explicitSessionId?: string;
  configAdapter: TokenPilotProductSurfaceConfigAdapter;
  resolveLatestSessionId(stateDir: string): Promise<string | undefined>;
  readLatestUxEffect(stateDir: string): Promise<LatestUxEffectWithSessionId | null>;
  readSessionAggregate(stateDir: string, sessionId: string): Promise<ProductSurfaceSessionAggregate | null>;
}): Promise<TokenPilotProductCommandResult> {
  const stateDir = params.configAdapter.resolveStateDir(params.currentConfig);
  if (!stateDir) {
    return { text: "TokenPilot stateDir is not configured." };
  }
  const latest = await params.readLatestUxEffect(stateDir);
  const sessionId = await resolvePreferredSessionId({
    explicitSessionId: params.explicitSessionId,
    stateDir,
    resolveLatestSessionId: params.resolveLatestSessionId,
    readLatestUxEffect: params.readLatestUxEffect,
  });
  if (!sessionId) {
    return { text: "No TokenPilot session stats yet." };
  }
  const aggregate = await params.readSessionAggregate(stateDir, sessionId);
  if (!aggregate) {
    return { text: `No TokenPilot savings recorded yet for session ${sessionId}.` };
  }
  const pluginCfg = params.configAdapter.pluginConfigRecord(params.currentConfig);
  const detailsEnabled = getNestedValue(pluginCfg, ["ux", "details"]) === true;
  return {
    text: formatSessionReport({
      sessionId,
      aggregate,
      latest,
      detailsEnabled,
    }),
  };
}
