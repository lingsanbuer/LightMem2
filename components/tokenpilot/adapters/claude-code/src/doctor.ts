import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import {
  TOKENPILOT_MCP_SERVER_NAME,
  inspectClaudeMcpServerConfig,
  listClaudeMcpConfigCandidates,
} from "@tokenpilot/mcp";
import {
  CLAUDE_TOOL_SEARCH_DEFAULT,
  CLAUDE_TOOL_SEARCH_ENV,
  proxyBaseUrlForPort,
  type TokenPilotClaudeCodeConfig,
} from "./config.js";

export type ClaudeCodeDoctorReport = {
  settingsPath: string;
  tokenPilotConfigPath: string;
  stateDir: string;
  proxyBaseUrl: string;
  mcpConfigPath: string;
  settingsInstalled: boolean;
  routedViaGateway: boolean;
  toolSearchEnabled: boolean;
  proxyHealthy: boolean;
  upstreamBaseUrl: string;
  mcpInstalled: boolean;
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

async function checkHealth(baseUrl: string): Promise<boolean> {
  try {
    const resp = await fetch(`${baseUrl.replace(/\/+$/, "")}/health`);
    return resp.ok;
  } catch {
    return false;
  }
}

export function formatClaudeCodeDoctorReport(report: ClaudeCodeDoctorReport): string {
  return [
    "TokenPilot Claude Code doctor:",
    `- tokenpilot config: ${report.tokenPilotConfigPath}`,
    `- claude settings: ${report.settingsPath}`,
    `- mcp config: ${report.mcpConfigPath}`,
    `- stateDir: ${report.stateDir}`,
    `- settings installed: ${report.settingsInstalled ? "yes" : "no"}`,
    `- recovery MCP installed: ${report.mcpInstalled ? "yes" : "no"}`,
    `- routed via gateway: ${report.routedViaGateway ? "yes" : "no"}`,
    `- tool search enabled: ${report.toolSearchEnabled ? "yes" : "no"}`,
    `- proxy healthy: ${report.proxyHealthy ? "yes" : "no"}`,
    `- proxy base URL: ${report.proxyBaseUrl}`,
    `- upstream base URL: ${report.upstreamBaseUrl}`,
  ].join("\n");
}

export async function inspectClaudeCodeDoctor(params: {
  config: TokenPilotClaudeCodeConfig;
  settingsPath: string;
  tokenPilotConfigPath: string;
  mcpConfigPath: string;
}): Promise<ClaudeCodeDoctorReport> {
  const proxyBaseUrl = proxyBaseUrlForPort(params.config.proxyPort);
  let settingsInstalled = false;
  let routedViaGateway = false;
  let toolSearchEnabled = false;
  let mcpConfigPath = params.mcpConfigPath;
  let mcpInstalled = false;

  if (existsSync(params.settingsPath)) {
    settingsInstalled = true;
    try {
      const root = JSON.parse(await readFile(params.settingsPath, "utf8"));
      const env = asRecord(asRecord(root).env);
      routedViaGateway = env.ANTHROPIC_BASE_URL === proxyBaseUrl;
      toolSearchEnabled = env[CLAUDE_TOOL_SEARCH_ENV] === CLAUDE_TOOL_SEARCH_DEFAULT;
    } catch {
      settingsInstalled = true;
    }
  }

  for (const candidate of await listClaudeMcpConfigCandidates(params.mcpConfigPath)) {
    const inspected = await inspectClaudeMcpServerConfig(candidate, TOKENPILOT_MCP_SERVER_NAME);
    if (inspected.installed) {
      mcpInstalled = true;
      mcpConfigPath = candidate;
      break;
    }
  }

  return {
    settingsPath: params.settingsPath,
    mcpConfigPath,
    tokenPilotConfigPath: params.tokenPilotConfigPath,
    stateDir: params.config.stateDir,
    proxyBaseUrl,
    settingsInstalled,
    mcpInstalled,
    routedViaGateway,
    toolSearchEnabled,
    proxyHealthy: await checkHealth(proxyBaseUrl),
    upstreamBaseUrl: params.config.upstreamBaseUrl,
  };
}
