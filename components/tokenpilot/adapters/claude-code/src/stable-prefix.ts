import {
  applyStablePrefixToInstructions,
  replaceContentText,
  type HostRequestEnvelope,
} from "@tokenpilot/host-adapter";
import type { TokenPilotClaudeCodeConfig } from "./config.js";

export function prepareClaudeStablePrefix(
  envelope: HostRequestEnvelope,
  config: TokenPilotClaudeCodeConfig,
): HostRequestEnvelope {
  if (!config.modules.stabilizer) return envelope;
  return applyStablePrefixToInstructions({
    envelope,
    dynamicContextTarget: config.hooks.dynamicContextTarget,
    mergeDynamicContextIntoInstructions: config.hooks.dynamicContextTarget === "developer",
  });
}

export function replaceClaudeMessageText(
  envelope: HostRequestEnvelope,
  messageIndex: number,
  nextText: string,
): HostRequestEnvelope {
  const message = envelope.messages[messageIndex];
  if (!message) return envelope;
  const updated = envelope.messages.slice();
  updated[messageIndex] = {
    ...message,
    content: replaceContentText(message.content, nextText),
  };
  return {
    ...envelope,
    messages: updated,
  };
}
