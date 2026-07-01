import { existsSync } from "node:fs";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import {
  ensureMultiHostVisualServer,
  readVisualSessionList,
  type VisualHostSource,
} from "@tokenpilot/product-surface";
import {
  defaultTokenPilotClaudeCodeConfigPath,
  loadTokenPilotClaudeCodeConfig,
} from "../../../../adapters/claude-code/src/config.js";
import {
  defaultTokenPilotConfigPath,
  loadTokenPilotCodexConfig,
} from "../../../../adapters/codex/src/config.js";
import { resolveOpenClawConfigPath } from "../../../../adapters/openclaw/src/context-stack/integration/openclaw-paths.js";
import { resolveStateDir as resolveOpenClawStateDir } from "../../../../adapters/openclaw/src/commands/tokenpilot/host-config-adapter.js";

type MultiHostVisualMeta = {
  url?: string;
  pid?: number;
  hosts?: Array<{ hostId: string; stateDir: string }>;
};

function childProcessExecArgv(): string[] {
  return process.execArgv.filter((arg) => arg !== "--test");
}

function visualRootDir(): string {
  return join(homedir(), ".lightmem2", "state");
}

function visualPidPath(): string {
  return join(visualRootDir(), "visual-server.pid");
}

function visualMetaPath(): string {
  return join(visualRootDir(), "visual-server.json");
}

function visualLogPath(): string {
  return join(visualRootDir(), "visual-server.log");
}

function isProcessRunning(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForVisualServer(url: string, timeoutMs = 5000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const resp = await fetch(`${url}/health`);
      if (resp.ok) return true;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }
  return false;
}

function hostSignature(hosts: VisualHostSource[]): string {
  return JSON.stringify(hosts.map((host) => ({ hostId: host.hostId, stateDir: host.stateDir })));
}

async function readOpenClawConfig(): Promise<Record<string, unknown>> {
  const configPath = resolveOpenClawConfigPath();
  try {
    const raw = await readFile(configPath, "utf8");
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function resolveVisualHosts(): Promise<VisualHostSource[]> {
  const openclawConfig = await readOpenClawConfig();
  const codexConfig = await loadTokenPilotCodexConfig(defaultTokenPilotConfigPath());
  const claudeConfig = await loadTokenPilotClaudeCodeConfig(defaultTokenPilotClaudeCodeConfigPath());

  const candidates: VisualHostSource[] = [
    {
      hostId: "openclaw",
      displayName: "OpenClaw",
      stateDir: resolveOpenClawStateDir(openclawConfig) ?? "",
    },
    {
      hostId: "codex",
      displayName: "Codex",
      stateDir: codexConfig.stateDir,
    },
    {
      hostId: "claude-code",
      displayName: "Claude Code",
      stateDir: claudeConfig.stateDir,
    },
  ];

  const hosts: VisualHostSource[] = [];
  for (const candidate of candidates) {
    const stateDir = String(candidate.stateDir ?? "").trim();
    if (!stateDir) continue;
    hosts.push({
      ...candidate,
      stateDir,
    });
  }
  return hosts;
}

export async function ensureStandaloneVisualServer(): Promise<{
  url: string;
  hosts: VisualHostSource[];
}> {
  const hosts = await resolveVisualHosts();
  const nextSignature = hostSignature(hosts);
  const metaFile = visualMetaPath();
  const pidFile = visualPidPath();
  const currentMeta = existsSync(metaFile)
    ? JSON.parse(await readFile(metaFile, "utf8")) as MultiHostVisualMeta
    : {};
  const currentPid = Number(currentMeta.pid ?? 0);
  const currentSignature = JSON.stringify(
    Array.isArray(currentMeta.hosts)
      ? currentMeta.hosts.map((host) => ({ hostId: host.hostId, stateDir: host.stateDir }))
      : [],
  );
  if (currentMeta.url && currentPid > 0 && isProcessRunning(currentPid) && currentSignature === nextSignature) {
    const healthy = await waitForVisualServer(currentMeta.url, 500);
    if (healthy) {
      return { url: currentMeta.url, hosts };
    }
  }

  await mkdir(visualRootDir(), { recursive: true });
  const log = await open(visualLogPath(), "a");
  const child = spawn(process.execPath, [...childProcessExecArgv(), __filename, "__lightmem2_visual_daemon"], {
    detached: true,
    stdio: ["ignore", log.fd, log.fd],
    env: process.env,
  });
  child.unref();
  await log.close().catch(() => undefined);
  await writeFile(pidFile, `${child.pid}\n`, "utf8");

  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    try {
      if (existsSync(metaFile)) {
        const parsed = JSON.parse(await readFile(metaFile, "utf8")) as MultiHostVisualMeta;
        const parsedSignature = JSON.stringify(
          Array.isArray(parsed.hosts)
            ? parsed.hosts.map((host) => ({ hostId: host.hostId, stateDir: host.stateDir }))
            : [],
        );
        if (parsed.url && Number(parsed.pid) === child.pid && parsedSignature === nextSignature) {
          const healthy = await waitForVisualServer(parsed.url, 1000);
          if (healthy) {
            return { url: parsed.url, hosts };
          }
        }
      }
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 120));
  }

  if (isProcessRunning(child.pid ?? 0)) {
    try {
      process.kill(child.pid ?? 0, "SIGTERM");
    } catch {
      // ignore
    }
  }
  await rm(pidFile, { force: true }).catch(() => undefined);
  throw new Error("Failed to start LightMem2 standalone visual server");
}

export async function maybeRunStandaloneVisualDaemon(argv: string[]): Promise<boolean> {
  if (argv[0] !== "__lightmem2_visual_daemon") return false;
  const hosts = await resolveVisualHosts();
  const handle = await ensureMultiHostVisualServer(hosts);
  await mkdir(dirname(visualMetaPath()), { recursive: true });
  await writeFile(
    visualMetaPath(),
    `${JSON.stringify({
      url: handle.url,
      pid: process.pid,
      hosts: hosts.map(({ hostId, stateDir }) => ({ hostId, stateDir })),
    }, null, 2)}\n`,
    "utf8",
  );
  return new Promise<boolean>(() => undefined);
}

export async function handleStandaloneVisualCommand(): Promise<{ text: string }> {
  return handleStandaloneVisualCommandWithSelection({});
}

export async function handleStandaloneVisualCommandWithSelection(params: {
  host?: string;
  sessionId?: string;
}): Promise<{ text: string }> {
  const { url, hosts } = await ensureStandaloneVisualServer();
  const query = new URL(url);
  if (typeof params.host === "string" && params.host.trim()) {
    query.searchParams.set("host", params.host.trim());
  }
  if (typeof params.sessionId === "string" && params.sessionId.trim()) {
    query.searchParams.set("session", params.sessionId.trim());
  }
  const hostLines = await Promise.all(hosts.map(async (host) => {
    const sessions = await readVisualSessionList(host.stateDir);
    return `- ${host.displayName}: ${sessions.length} session snapshots`;
  }));
  return {
    text: [
      `LightMem2 visual: ${query.toString()}`,
      `- hosts: ${hosts.length}`,
      ...hostLines,
      "- open this URL in your browser, then switch hosts from the sidebar",
    ].join("\n"),
  };
}

async function runStandaloneVisualDaemonEntry(): Promise<void> {
  if (process.argv[1] !== __filename) return;
  if (await maybeRunStandaloneVisualDaemon(process.argv.slice(2))) {
    return;
  }
}

void runStandaloneVisualDaemonEntry().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
