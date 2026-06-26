import { installClaudeCodeTokenPilot } from "../src/install.js";

async function main() {
  const result = await installClaudeCodeTokenPilot();
  console.log([
    "TokenPilot Claude Code install complete:",
    `- settings: ${result.settingsPath}`,
    `- mcp config: ${result.mcpConfigPath}`,
    `- tokenpilot config: ${result.tokenPilotConfigPath}`,
    `- proxy base URL: ${result.proxyBaseUrl}`,
    `- tool search env: ${result.toolSearchEnvName}=${result.toolSearchEnvValue}`,
    `- recovery MCP server: ${result.mcpServerName}`,
  ].join("\n"));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
