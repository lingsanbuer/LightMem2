import { existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { resolveTokenPilotMcpServerSpec } from "@tokenpilot/mcp";
import {
  CLAUDE_TOOL_SEARCH_DEFAULT,
  CLAUDE_TOOL_SEARCH_ENV,
  defaultClaudeCodeMcpConfigPath,
  defaultClaudeCodeSettingsPath,
  defaultTokenPilotClaudeCodeConfigPath,
  loadTokenPilotClaudeCodeConfig,
  proxyBaseUrlForPort,
  writeTokenPilotClaudeCodeConfig,
} from "./config.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export async function installClaudeCodeTokenPilot(params?: {
  settingsPath?: string;
  tokenPilotConfigPath?: string;
  mcpConfigPath?: string;
}): Promise<{
  settingsPath: string;
  mcpConfigPath: string;
  tokenPilotConfigPath: string;
  proxyBaseUrl: string;
  stateDir: string;
  settingsBackedUp: boolean;
  mcpConfigBackedUp: boolean;
  toolSearchEnvName: string;
  toolSearchEnvValue: string;
  mcpServerName: string;
}> {
  const settingsPath = params?.settingsPath ?? defaultClaudeCodeSettingsPath();
  const mcpConfigPath = params?.mcpConfigPath ?? defaultClaudeCodeMcpConfigPath();
  const tokenPilotConfigPath = params?.tokenPilotConfigPath ?? defaultTokenPilotClaudeCodeConfigPath();
  const config = await loadTokenPilotClaudeCodeConfig(tokenPilotConfigPath);
  await writeTokenPilotClaudeCodeConfig(config, tokenPilotConfigPath);
  const mcpServer = resolveTokenPilotMcpServerSpec({
    stateDir: config.stateDir,
  });

  const existing = existsSync(settingsPath)
    ? JSON.parse(await readFile(settingsPath, "utf8"))
    : {};
  const root = asRecord(existing);
  const env = {
    ...asRecord(root.env),
    ANTHROPIC_BASE_URL: proxyBaseUrlForPort(config.proxyPort),
    [CLAUDE_TOOL_SEARCH_ENV]: CLAUDE_TOOL_SEARCH_DEFAULT,
  };
  const next = {
    ...root,
    env,
  };

  await mkdir(dirname(settingsPath), { recursive: true });
  const settingsBackedUp = existsSync(settingsPath);
  if (existsSync(settingsPath)) {
    await copyFile(settingsPath, `${settingsPath}.tokenpilot.bak`);
  }
  await writeFile(settingsPath, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  const mcpExisting = existsSync(mcpConfigPath)
    ? JSON.parse(await readFile(mcpConfigPath, "utf8"))
    : {};
  const mcpRoot = asRecord(mcpExisting);
  const mcpServers = {
    ...asRecord(mcpRoot.mcpServers),
    [mcpServer.serverName]: {
      command: mcpServer.command,
      args: mcpServer.args,
      env: mcpServer.env,
    },
  };
  await mkdir(dirname(mcpConfigPath), { recursive: true });
  const mcpConfigBackedUp = existsSync(mcpConfigPath);
  if (existsSync(mcpConfigPath)) {
    await copyFile(mcpConfigPath, `${mcpConfigPath}.tokenpilot.bak`);
  }
  await writeFile(mcpConfigPath, `${JSON.stringify({ ...mcpRoot, mcpServers }, null, 2)}\n`, "utf8");
  return {
    settingsPath,
    mcpConfigPath,
    tokenPilotConfigPath,
    proxyBaseUrl: proxyBaseUrlForPort(config.proxyPort),
    stateDir: config.stateDir,
    settingsBackedUp,
    mcpConfigBackedUp,
    toolSearchEnvName: CLAUDE_TOOL_SEARCH_ENV,
    toolSearchEnvValue: CLAUDE_TOOL_SEARCH_DEFAULT,
    mcpServerName: mcpServer.serverName,
  };
}
