import {
  defaultClaudeCodeMcpConfigPath,
  defaultClaudeCodeSettingsPath,
  defaultTokenPilotClaudeCodeConfigPath,
  loadTokenPilotClaudeCodeConfig,
} from "../src/config.js";
import { formatClaudeCodeDoctorReport, inspectClaudeCodeDoctor } from "../src/doctor.js";

async function main() {
  const configPath = defaultTokenPilotClaudeCodeConfigPath();
  const config = await loadTokenPilotClaudeCodeConfig(configPath);
  const report = await inspectClaudeCodeDoctor({
    config,
    mcpConfigPath: defaultClaudeCodeMcpConfigPath(),
    settingsPath: defaultClaudeCodeSettingsPath(),
    tokenPilotConfigPath: configPath,
  });
  console.log(formatClaudeCodeDoctorReport(report));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
