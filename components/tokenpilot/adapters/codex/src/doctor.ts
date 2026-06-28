import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { TOKENPILOT_MCP_SERVER_NAME } from "@tokenpilot/mcp";
import type { TokenPilotCodexConfig } from "./config.js";
import { readCodexMcpServerFromToml, readCodexProviderFromToml } from "./config.js";
import { readDaemonStatus } from "./daemon.js";
import { resolveCodexHookCommandForInstall, resolveCodexMcpServerSpecForInstall } from "./install.js";

export type CodexDoctorReport = {
  configPath: string;
  hooksConfigPath: string;
  tokenPilotConfigPath: string;
  proxyBaseUrl: string;
  expectedHookCommand: string;
  expectedMcpCommand: string;
  expectedMcpArgs: string[];
  providerInstalled: boolean;
  hooksInstalled: boolean;
  hooksComplete: boolean;
  hooksMatchExpectedCommand: boolean;
  installedHookEvents: string[];
  missingHookEvents: string[];
  daemonRunning: boolean;
  proxyHealthy: boolean;
  stateDir: string;
  upstreamProvider?: string;
  mcpInstalled: boolean;
  mcpStateDirMatches: boolean;
  mcpCommandMatches: boolean;
  mcpArgsMatch: boolean;
};

const HOOK_EVENT_NAMES = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "Stop",
] as const;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function hookGroupHasTokenPilot(group: unknown): boolean {
  if (!group || typeof group !== "object") return false;
  const hooks = (group as Record<string, unknown>).hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const command = (entry as Record<string, unknown>).command;
    return typeof command === "string" && command.includes("hooks-handler.js");
  });
}

function hookGroupHasExpectedCommand(group: unknown, expectedCommand: string): boolean {
  if (!group || typeof group !== "object") return false;
  const hooks = (group as Record<string, unknown>).hooks;
  if (!Array.isArray(hooks)) return false;
  return hooks.some((entry) => {
    if (!entry || typeof entry !== "object") return false;
    const command = (entry as Record<string, unknown>).command;
    return typeof command === "string" && command.trim() === expectedCommand;
  });
}

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/health`);
    return resp.ok;
  } catch {
    return false;
  }
}

export function formatCodexDoctorReport(report: CodexDoctorReport): string {
  const lines = [
    "TokenPilot Codex doctor:",
    `- tokenpilot config: ${report.tokenPilotConfigPath}`,
    `- codex config: ${report.configPath}`,
    `- hooks config: ${report.hooksConfigPath}`,
    `- stateDir: ${report.stateDir}`,
    `- expected hook command: ${report.expectedHookCommand}`,
    `- expected MCP command: ${report.expectedMcpCommand}`,
    `- expected MCP args: ${report.expectedMcpArgs.length > 0 ? report.expectedMcpArgs.join(" ") : "(none)"}`,
    `- provider installed: ${report.providerInstalled ? "yes" : "no"}`,
    `- recovery MCP installed: ${report.mcpInstalled ? "yes" : "no"}`,
    `- hooks installed: ${report.hooksInstalled ? "yes" : "no"}`,
    `- hooks complete: ${report.hooksComplete ? "yes" : "no"}`,
    `- hooks match expected command: ${report.hooksMatchExpectedCommand ? "yes" : "no"}`,
    `- installed hook events: ${report.installedHookEvents.length > 0 ? report.installedHookEvents.join(", ") : "(none)"}`,
    `- missing hook events: ${report.missingHookEvents.length > 0 ? report.missingHookEvents.join(", ") : "(none)"}`,
    `- recovery MCP stateDir matches: ${report.mcpStateDirMatches ? "yes" : "no"}`,
    `- recovery MCP command matches: ${report.mcpCommandMatches ? "yes" : "no"}`,
    `- recovery MCP args match: ${report.mcpArgsMatch ? "yes" : "no"}`,
    `- daemon running: ${report.daemonRunning ? "yes" : "no"}`,
    `- proxy healthy: ${report.proxyHealthy ? "yes" : "no"}`,
    `- proxy base URL: ${report.proxyBaseUrl}`,
    `- upstream provider: ${report.upstreamProvider ?? "(unset)"}`,
  ];
  const fixes: string[] = [];
  if (!report.providerInstalled) {
    fixes.push("- rerun the Codex install command to refresh the TokenPilot provider entry in `config.toml`");
  }
  if (!report.hooksInstalled || !report.hooksComplete || !report.hooksMatchExpectedCommand) {
    fixes.push("- rerun the Codex install command to repair TokenPilot hook groups in `hooks.json`");
  }
  if (!report.mcpInstalled || !report.mcpStateDirMatches || !report.mcpCommandMatches || !report.mcpArgsMatch) {
    fixes.push("- rerun the Codex install command to refresh the recovery MCP entry in `config.toml`");
  }
  if (!report.daemonRunning || !report.proxyHealthy) {
    fixes.push("- start or restart the TokenPilot Codex daemon before using Codex");
  }
  if (fixes.length > 0) {
    lines.push("", "Suggested fixes:");
    lines.push(...fixes);
  }
  return lines.join("\n");
}

export async function inspectCodexDoctor(params: {
  config: TokenPilotCodexConfig;
  configPath: string;
  tokenPilotConfigPath: string;
  hooksConfigPath: string;
}): Promise<CodexDoctorReport> {
  const daemon = await readDaemonStatus(params.config);
  const proxyBaseUrl = `http://127.0.0.1:${params.config.proxyPort}/v1`;
  const providerName = params.config.providerName || "tokenpilot";
  const expectedHookCommand = resolveCodexHookCommandForInstall();
  const expectedMcpSpec = resolveCodexMcpServerSpecForInstall(params.config.stateDir);
  const tokenpilotProvider = await readCodexProviderFromToml(providerName, params.configPath);
  const mcp = await readCodexMcpServerFromToml(TOKENPILOT_MCP_SERVER_NAME, params.configPath);
  let hooksRoot: Record<string, unknown> = {};
  if (existsSync(params.hooksConfigPath)) {
    hooksRoot = JSON.parse(await readFile(params.hooksConfigPath, "utf8").catch(() => "{}")) as Record<string, unknown>;
  }
  const hooks = asRecord(hooksRoot.hooks);
  const installedHookEvents: string[] = [];
  const matchedHookEvents: string[] = [];
  for (const name of HOOK_EVENT_NAMES) {
    const groups = hooks[name];
    if (Array.isArray(groups) && groups.some(hookGroupHasTokenPilot)) {
      installedHookEvents.push(name);
    }
    if (Array.isArray(groups) && groups.some((group) => hookGroupHasExpectedCommand(group, expectedHookCommand))) {
      matchedHookEvents.push(name);
    }
  }
  const missingHookEvents = HOOK_EVENT_NAMES.filter((name) => !installedHookEvents.includes(name));
  const hooksComplete = missingHookEvents.length === 0;
  const hooksInstalled = installedHookEvents.length > 0;
  const hooksMatchExpectedCommand = HOOK_EVENT_NAMES.every((name) => matchedHookEvents.includes(name));
  return {
    configPath: params.configPath,
    hooksConfigPath: params.hooksConfigPath,
    tokenPilotConfigPath: params.tokenPilotConfigPath,
    proxyBaseUrl,
    expectedHookCommand,
    expectedMcpCommand: expectedMcpSpec.command,
    expectedMcpArgs: expectedMcpSpec.args,
    providerInstalled: Boolean(tokenpilotProvider),
    hooksInstalled,
    hooksComplete,
    hooksMatchExpectedCommand,
    installedHookEvents,
    missingHookEvents,
    daemonRunning: daemon.running,
    proxyHealthy: await checkHealth(proxyBaseUrl),
    stateDir: params.config.stateDir,
    upstreamProvider: params.config.upstreamProvider,
    mcpInstalled: Boolean(mcp?.command),
    mcpStateDirMatches: mcp?.env?.TOKENPILOT_STATE_DIR === params.config.stateDir,
    mcpCommandMatches: mcp?.command === expectedMcpSpec.command,
    mcpArgsMatch:
      Array.isArray(mcp?.args)
      && mcp.args.length === expectedMcpSpec.args.length
      && mcp.args.every((value, index) => value === expectedMcpSpec.args[index]),
  };
}
