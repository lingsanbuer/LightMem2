import {
  extractContentText,
  prependTextToContent,
  replaceContentText,
  rewriteTextForStablePrefix,
  type HostRequestEnvelope,
} from "@tokenpilot/host-adapter";
import type { TokenPilotClaudeCodeConfig } from "./config.js";

function findFirstUserIndex(messages: HostRequestEnvelope["messages"]): number {
  return messages.findIndex((message) => message?.role === "user");
}

export function prepareClaudeStablePrefix(
  envelope: HostRequestEnvelope,
  config: TokenPilotClaudeCodeConfig,
): HostRequestEnvelope {
  if (!config.modules.stabilizer) return envelope;

  const sourceInstructions = typeof envelope.instructions === "string" ? envelope.instructions : "";
  if (!sourceInstructions.trim()) return envelope;

  const rewrite = rewriteTextForStablePrefix(sourceInstructions);
  if (!rewrite.changed) return envelope;

  let nextMessages = envelope.messages;
  let changed = rewrite.forwardedText !== sourceInstructions;

  if (rewrite.dynamicContextText) {
    const userIndex = findFirstUserIndex(envelope.messages);
    if (userIndex >= 0) {
      const userMessage = envelope.messages[userIndex];
      const currentText = extractContentText(userMessage.content);
      if (!currentText.includes(rewrite.dynamicContextText)) {
        nextMessages = envelope.messages.slice();
        nextMessages[userIndex] = {
          ...userMessage,
          content: prependTextToContent(userMessage.content, rewrite.dynamicContextText),
        };
        changed = true;
      }
    }
  }

  if (!changed) return envelope;
  return {
    ...envelope,
    instructions: rewrite.forwardedText,
    messages: nextMessages,
  };
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
