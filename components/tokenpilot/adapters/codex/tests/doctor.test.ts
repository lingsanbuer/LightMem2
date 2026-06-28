import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createServer } from "node:net";

import { normalizeTokenPilotCodexConfig } from "../src/config.js";
import { formatCodexDoctorReport, inspectCodexDoctor } from "../src/doctor.js";

async function reserveUnusedPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("failed to reserve test port")));
        return;
      }
      const { port } = address;
      server.close((error) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
  });
}

test("inspectCodexDoctor reports missing provider and hooks honestly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-codex-doctor-"));
  try {
    const proxyPort = await reserveUnusedPort();
    const codexConfigPath = join(dir, "config.toml");
    const hooksConfigPath = join(dir, "hooks.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");

    await writeFile(codexConfigPath, "model_provider = \"OpenAI\"\n", "utf8");
    await writeFile(hooksConfigPath, JSON.stringify({ hooks: {} }, null, 2), "utf8");
    await mkdir(join(dir, "state"), { recursive: true });

    const report = await inspectCodexDoctor({
      config: normalizeTokenPilotCodexConfig({
        stateDir: join(dir, "state"),
        proxyPort,
      }),
      configPath: codexConfigPath,
      hooksConfigPath,
      tokenPilotConfigPath,
    });

    assert.equal(report.providerInstalled, false);
    assert.equal(report.hooksInstalled, false);
    assert.equal(report.hooksComplete, false);
    assert.equal(report.hooksMatchExpectedCommand, false);
    assert.deepEqual(report.installedHookEvents, []);
    assert.deepEqual(report.missingHookEvents, ["SessionStart", "PreToolUse", "PostToolUse", "Stop"]);
    assert.equal(report.daemonRunning, false);
    assert.equal(report.mcpInstalled, false);
    assert.equal(report.mcpStateDirMatches, false);
    assert.equal(report.mcpCommandMatches, false);
    assert.equal(report.mcpArgsMatch, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectCodexDoctor checks the configured provider name", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-codex-doctor-provider-"));
  try {
    const proxyPort = await reserveUnusedPort();
    const codexConfigPath = join(dir, "config.toml");
    const hooksConfigPath = join(dir, "hooks.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");

    await writeFile(codexConfigPath, [
      "model_provider = \"tp-custom\"",
      "",
      "[model_providers.tp-custom]",
      "name = \"TokenPilot Custom\"",
      "base_url = \"http://127.0.0.1:17667/v1\"",
      "wire_api = \"responses\"",
      "requires_openai_auth = true",
      "",
    ].join("\n"), "utf8");
    await writeFile(hooksConfigPath, JSON.stringify({ hooks: {} }, null, 2), "utf8");
    await mkdir(join(dir, "state"), { recursive: true });

    const report = await inspectCodexDoctor({
      config: normalizeTokenPilotCodexConfig({
        stateDir: join(dir, "state"),
        proxyPort,
        providerName: "tp-custom",
      }),
      configPath: codexConfigPath,
      hooksConfigPath,
      tokenPilotConfigPath,
    });

    assert.equal(report.providerInstalled, true);
    assert.equal(report.hooksInstalled, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectCodexDoctor detects installed recovery MCP entry", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-codex-doctor-mcp-"));
  try {
    const proxyPort = await reserveUnusedPort();
    const codexConfigPath = join(dir, "config.toml");
    const hooksConfigPath = join(dir, "hooks.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");

    await writeFile(codexConfigPath, [
      "model_provider = \"tokenpilot\"",
      "",
      "[model_providers.tokenpilot]",
      "name = \"TokenPilot\"",
      "base_url = \"http://127.0.0.1:17667/v1\"",
      "wire_api = \"responses\"",
      "requires_openai_auth = true",
      "",
      "[mcp_servers.tokenpilot_memory_fault_recover]",
      `command = ${JSON.stringify(process.execPath)}`,
      `args = [${JSON.stringify("/tmp/server.js")}]`,
      "",
      "[mcp_servers.tokenpilot_memory_fault_recover.env]",
      `TOKENPILOT_STATE_DIR = ${JSON.stringify(join(dir, "state"))}`,
      "",
    ].join("\n"), "utf8");
    await writeFile(hooksConfigPath, JSON.stringify({ hooks: {} }, null, 2), "utf8");
    await mkdir(join(dir, "state"), { recursive: true });

    const report = await inspectCodexDoctor({
      config: normalizeTokenPilotCodexConfig({
        stateDir: join(dir, "state"),
        proxyPort,
      }),
      configPath: codexConfigPath,
      hooksConfigPath,
      tokenPilotConfigPath,
    });

    assert.equal(report.providerInstalled, true);
    assert.equal(report.mcpInstalled, true);
    assert.equal(report.mcpStateDirMatches, true);
    assert.equal(report.mcpCommandMatches, true);
    assert.equal(report.mcpArgsMatch, false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("inspectCodexDoctor reports partial hook installs explicitly", async () => {
  const dir = await mkdtemp(join(tmpdir(), "lightmem2-codex-doctor-hooks-"));
  try {
    const proxyPort = await reserveUnusedPort();
    const codexConfigPath = join(dir, "config.toml");
    const hooksConfigPath = join(dir, "hooks.json");
    const tokenPilotConfigPath = join(dir, "tokenpilot.json");

    await writeFile(codexConfigPath, "model_provider = \"tokenpilot\"\n", "utf8");
    await writeFile(hooksConfigPath, JSON.stringify({
      hooks: {
        SessionStart: [{ hooks: [{ type: "command", command: `${process.execPath} /tmp/tokenpilot/hooks-handler.js` }] }],
        PostToolUse: [{ hooks: [{ type: "command", command: `${process.execPath} /tmp/tokenpilot/hooks-handler.js` }] }],
      },
    }, null, 2), "utf8");
    await mkdir(join(dir, "state"), { recursive: true });

    const report = await inspectCodexDoctor({
      config: normalizeTokenPilotCodexConfig({
        stateDir: join(dir, "state"),
        proxyPort,
      }),
      configPath: codexConfigPath,
      hooksConfigPath,
      tokenPilotConfigPath,
    });

    assert.equal(report.hooksInstalled, true);
    assert.equal(report.hooksComplete, false);
    assert.equal(report.hooksMatchExpectedCommand, false);
    assert.deepEqual(report.installedHookEvents, ["SessionStart", "PostToolUse"]);
    assert.deepEqual(report.missingHookEvents, ["PreToolUse", "Stop"]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("formatCodexDoctorReport includes remediation hints for drifted installs", async () => {
  const proxyPort = await reserveUnusedPort();
  const report = await inspectCodexDoctor({
    config: normalizeTokenPilotCodexConfig({
      stateDir: join(tmpdir(), "lightmem2-codex-doctor-remediation-state"),
      proxyPort,
    }),
    configPath: join(tmpdir(), "lightmem2-missing-codex-config.toml"),
    hooksConfigPath: join(tmpdir(), "lightmem2-missing-codex-hooks.json"),
    tokenPilotConfigPath: join(tmpdir(), "lightmem2-missing-codex-tokenpilot.json"),
  });
  const text = formatCodexDoctorReport(report);
  assert.match(text, /Suggested fixes:/);
  assert.match(text, /rerun the Codex install command/i);
});
