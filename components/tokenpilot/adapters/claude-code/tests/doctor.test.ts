import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  CLAUDE_TOOL_SEARCH_DEFAULT,
  CLAUDE_TOOL_SEARCH_ENV,
  defaultClaudeCodeMcpConfigPath,
  normalizeTokenPilotClaudeCodeConfig,
  proxyBaseUrlForPort,
} from "../src/config.js";
import { inspectClaudeCodeDoctor } from "../src/doctor.js";

test("inspectClaudeCodeDoctor reports missing settings honestly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-claude-doctor-"));
  try {
    const settingsPath = join(dir, "settings.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");
    const report = await inspectClaudeCodeDoctor({
      config: normalizeTokenPilotClaudeCodeConfig({
        stateDir: join(dir, "state"),
        proxyPort: 18777,
      }),
      mcpConfigPath: defaultClaudeCodeMcpConfigPath(),
      settingsPath,
      tokenPilotConfigPath,
    });
    assert.equal(report.settingsInstalled, false);
    assert.equal(report.mcpInstalled, false);
    assert.equal(report.routedViaGateway, false);
    assert.equal(report.toolSearchEnabled, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectClaudeCodeDoctor detects gateway routing from settings env", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-claude-doctor-env-"));
  try {
    const proxyPort = 18778;
    const settingsPath = join(dir, "settings.json");
    const mcpConfigPath = join(dir, ".claude.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");
    await writeFile(settingsPath, `${JSON.stringify({
      env: {
        ANTHROPIC_BASE_URL: proxyBaseUrlForPort(proxyPort),
        [CLAUDE_TOOL_SEARCH_ENV]: CLAUDE_TOOL_SEARCH_DEFAULT,
      },
    }, null, 2)}\n`, "utf8");
    await writeFile(mcpConfigPath, `${JSON.stringify({
      mcpServers: {
        tokenpilot_memory_fault_recover: {
          command: process.execPath,
          args: ["/tmp/server.js"],
          env: {
            TOKENPILOT_STATE_DIR: join(dir, "state"),
          },
        },
      },
    }, null, 2)}\n`, "utf8");

    const report = await inspectClaudeCodeDoctor({
      config: normalizeTokenPilotClaudeCodeConfig({
        stateDir: join(dir, "state"),
        proxyPort,
      }),
      mcpConfigPath,
      settingsPath,
      tokenPilotConfigPath,
    });
    assert.equal(report.settingsInstalled, true);
    assert.equal(report.mcpInstalled, true);
    assert.equal(report.routedViaGateway, true);
    assert.equal(report.toolSearchEnabled, true);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
