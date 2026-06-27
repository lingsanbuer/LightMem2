import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { installClaudeCodeTokenPilot } from "../src/install.js";

test("installClaudeCodeTokenPilot writes settings, MCP config, and backups existing files", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-claude-install-"));
  try {
    const settingsPath = join(dir, "settings.json");
    const mcpConfigPath = join(dir, ".claude.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");

    await writeFile(settingsPath, `${JSON.stringify({ env: { KEEP_ME: "1" } }, null, 2)}\n`, "utf8");
    await writeFile(mcpConfigPath, `${JSON.stringify({ mcpServers: { existing: { command: "node" } } }, null, 2)}\n`, "utf8");

    const result = await installClaudeCodeTokenPilot({
      settingsPath,
      mcpConfigPath,
      tokenPilotConfigPath,
    });

    assert.equal(result.settingsBackedUp, true);
    assert.equal(result.mcpConfigBackedUp, true);

    const settings = JSON.parse(await readFile(settingsPath, "utf8")) as {
      env?: Record<string, string>;
    };
    assert.equal(typeof settings.env?.ANTHROPIC_BASE_URL, "string");
    assert.equal(settings.env?.ENABLE_TOOL_SEARCH, "true");
    assert.equal(settings.env?.KEEP_ME, "1");

    const mcp = JSON.parse(await readFile(mcpConfigPath, "utf8")) as {
      mcpServers?: Record<string, { command?: string; env?: Record<string, string> }>;
    };
    assert.equal(typeof mcp.mcpServers?.tokenpilot_memory_fault_recover?.command, "string");
    assert.equal(
      mcp.mcpServers?.tokenpilot_memory_fault_recover?.env?.TOKENPILOT_STATE_DIR,
      result.stateDir,
    );
    assert.equal(typeof mcp.mcpServers?.existing?.command, "string");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
