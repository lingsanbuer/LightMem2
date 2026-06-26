import type { HostGatewayUpstreamConfig } from "@tokenpilot/host-adapter";
import { createDefaultGatewayForwarder } from "@tokenpilot/host-adapter";
import type { TokenPilotClaudeCodeConfig } from "./config.js";

export function resolveClaudeCodeUpstream(
  config: TokenPilotClaudeCodeConfig,
): HostGatewayUpstreamConfig {
  return {
    baseUrl: config.proxyBaseUrl?.replace(/\/+$/, "") || config.upstreamBaseUrl,
    apiKey: config.proxyApiKey || config.upstreamApiKey,
    name: "Anthropic",
    protocol: "anthropic-messages",
  };
}

export const defaultClaudeCodeGatewayForwarder = createDefaultGatewayForwarder();
