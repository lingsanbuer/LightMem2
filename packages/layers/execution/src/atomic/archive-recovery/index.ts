import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import {
  defaultArchiveDir,
  defaultArchiveLookupDirs,
  defaultFaultStatePath,
  defaultPluginStateDir,
  sanitizePathPart,
} from "../../composer/compaction/archive.js";

export type ArchiveRecoveryRequest = {
  dataKey: string;
  archivePath: string;
  requestedAt: number;
  turnId: string;
};

export type ArchiveRecoveryState = {
  pendingRecoveries: ArchiveRecoveryRequest[];
};

export type GenericArchiveEntry = {
  schemaVersion: number;
  kind: string;
  sessionId: string;
  segmentId: string;
  sourcePass: string;
  toolName: string;
  dataKey: string;
  originalText: string;
  originalSize: number;
  archivedAt: string;
  metadata?: Record<string, unknown>;
};

type ArchiveContentParams = {
  sessionId: string;
  segmentId: string;
  sourcePass: string;
  toolName: string;
  dataKey: string;
  originalText: string;
  workspaceDir?: string;
  archiveDir?: string;
  metadata?: Record<string, unknown>;
};

type ArchiveLocationParams = {
  sessionId: string;
  segmentId: string;
  workspaceDir?: string;
  archiveDir?: string;
};

export function buildRecoveryHint(params: {
  dataKey: string;
  originalSize: number;
  archivePath: string;
  sourceLabel: string;
}): string {
  const { dataKey, originalSize, archivePath, sourceLabel } = params;
  return (
    `\n\n[${sourceLabel}] Full content omitted to save context (${originalSize.toLocaleString()} chars).\n` +
    `If you need the full content, just say: memory_fault('${dataKey}')\n` +
    `Do NOT call the tool again — the system will automatically recover this content for you.\n` +
    `Archive: ${archivePath}`
  );
}

export async function archiveContent(params: ArchiveContentParams): Promise<{
  archivePath: string;
  archiveDir: string;
}> {
  const { archiveDir, archivePath } = buildArchiveLocation(params);

  await mkdir(dirname(archivePath), { recursive: true });
  const entry: GenericArchiveEntry = {
    schemaVersion: 1,
    kind: `${params.sourcePass}_archive`,
    sessionId: params.sessionId,
    segmentId: params.segmentId,
    sourcePass: params.sourcePass,
    toolName: params.toolName,
    dataKey: params.dataKey,
    originalText: params.originalText,
    originalSize: params.originalText.length,
    archivedAt: new Date().toISOString(),
    metadata: params.metadata,
  };
  await writeFile(archivePath, `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  await updateArchiveLookup(params.dataKey, archivePath, archiveDir);

  return { archivePath, archiveDir };
}

export function buildArchiveLocation(params: ArchiveLocationParams): {
  archiveDir: string;
  archivePath: string;
} {
  const archiveDir = params.archiveDir ?? defaultArchiveDir(params.sessionId, params.workspaceDir);
  const timestamp = Date.now();
  const fileName = `${timestamp}-${sanitizePathPart(params.segmentId)}.json`;
  const archivePath = join(archiveDir, fileName);
  return { archiveDir, archivePath };
}

export async function updateArchiveLookup(
  dataKey: string,
  archivePath: string,
  archiveDir: string,
): Promise<void> {
  const lookupPath = join(archiveDir, "key-lookup.json");
  let lookup: Record<string, string> = {};
  try {
    const raw = await readFile(lookupPath, "utf8");
    lookup = JSON.parse(raw) as Record<string, string>;
  } catch {
    lookup = {};
  }
  lookup[dataKey] = archivePath;
  await writeFile(lookupPath, JSON.stringify(lookup, null, 2), "utf8");
}

export async function readArchive(archivePath: string): Promise<GenericArchiveEntry | null> {
  try {
    const content = await readFile(archivePath, "utf8");
    const parsed = JSON.parse(content);
    if (typeof parsed?.originalText !== "string") return null;
    if (typeof parsed?.dataKey !== "string") return null;
    if (typeof parsed?.toolName !== "string") return null;
    return parsed as GenericArchiveEntry;
  } catch {
    return null;
  }
}

export async function resolveArchivePathFromLookup(
  dataKey: string,
  stateDir: string,
  sessionId: string,
): Promise<string | null> {
  const candidates = defaultArchiveLookupDirs(sessionId, stateDir);
  if (sessionId !== "proxy-session") {
    candidates.push(...defaultArchiveLookupDirs("proxy-session", stateDir));
  }
  for (const archiveDir of candidates) {
    const lookupPath = join(archiveDir, "key-lookup.json");
    try {
      const raw = await readFile(lookupPath, "utf8");
      const lookup = JSON.parse(raw) as Record<string, string>;
      const found = lookup[dataKey];
      if (found) return found;
    } catch {
      // Try next candidate.
    }
  }
  return null;
}

export async function readRecoveryState(
  stateDir: string,
  sessionId: string,
): Promise<ArchiveRecoveryState> {
  const path = defaultFaultStatePath(sessionId, stateDir);
  try {
    const content = await readFile(path, "utf8");
    const parsed = JSON.parse(content) as ArchiveRecoveryState;
    if (!Array.isArray(parsed.pendingRecoveries)) {
      return { pendingRecoveries: [] };
    }
    return parsed;
  } catch {
    return { pendingRecoveries: [] };
  }
}

export async function writeRecoveryState(
  stateDir: string,
  sessionId: string,
  state: ArchiveRecoveryState,
): Promise<void> {
  const path = defaultFaultStatePath(sessionId, stateDir);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state, null, 2), "utf8");
}

export async function clearRecoveryState(
  stateDir: string,
  sessionId: string,
): Promise<void> {
  const path = defaultFaultStatePath(sessionId, stateDir);
  try {
    await unlink(path);
  } catch {
    // Ignore missing files.
  }
}

export function resolveRecoveryStateDir(stateDir?: string): string {
  return stateDir ?? defaultPluginStateDir();
}
