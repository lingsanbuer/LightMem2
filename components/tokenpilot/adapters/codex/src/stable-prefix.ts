import { createHash } from "node:crypto";
import {
  applyStablePrefixToInstructions,
  applyStablePrefixToMessage,
  extractContentText,
  findFirstUserMessageIndex,
  rewriteTextForStablePrefix,
  type HostRequestEnvelope,
} from "@tokenpilot/host-adapter";
import type { TokenPilotCodexConfig } from "./config.js";

function computeStablePromptCacheKey(model: string, stableTexts: string[]): string {
  const digest = createHash("sha256")
    .update(JSON.stringify({
      v: 2,
      host: "codex",
      model,
      stableTexts: stableTexts.filter((text) => text.trim().length > 0),
    }))
    .digest("hex")
    .slice(0, 24);
  return `lightmem2-codex-${digest}`;
}

function findRootPromptCandidate(messages: HostRequestEnvelope["messages"]): {
  index: number;
  text: string;
} | null {
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index] as any;
    if (!message || typeof message !== "object") continue;
    if (message.role !== "system") continue;
    const originalRole = message.metadata?.__codexOriginalRole;
    if (originalRole !== "developer" && originalRole !== "system") continue;
    const text = extractContentText(message.content);
    if (text.trim()) return { index, text };
  }
  return null;
}

function hasDeveloperDynamicContextMessage(
  messages: HostRequestEnvelope["messages"],
  dynamicContextText: string,
): boolean {
  const target = dynamicContextText.trim();
  if (!target) return true;
  return messages.some((message: any) => {
    if (!message || typeof message !== "object") return false;
    if (message.role !== "system") return false;
    const originalRole = message.metadata?.__codexOriginalRole;
    if (originalRole !== "developer" && originalRole !== "system") return false;
    return extractContentText(message.content).trim() === target;
  });
}

function insertDeveloperDynamicContextMessage(params: {
  envelope: HostRequestEnvelope;
  dynamicContextText: string;
  afterMessageIndex?: number;
}): HostRequestEnvelope {
  const dynamicContextText = params.dynamicContextText.trim();
  if (!dynamicContextText) return params.envelope;
  if (hasDeveloperDynamicContextMessage(params.envelope.messages, dynamicContextText)) {
    return params.envelope;
  }

  const insertAt =
    typeof params.afterMessageIndex === "number"
      ? Math.max(0, Math.min(params.envelope.messages.length, params.afterMessageIndex + 1))
      : (() => {
          const userIndex = findFirstUserMessageIndex(params.envelope.messages);
          return userIndex >= 0 ? userIndex : params.envelope.messages.length;
        })();
  const nextMessages = params.envelope.messages.slice();
  nextMessages.splice(insertAt, 0, {
    role: "system",
    content: dynamicContextText,
    metadata: {
      __codexOriginalRole: "developer",
    },
  } as HostRequestEnvelope["messages"][number]);
  return {
    ...params.envelope,
    messages: nextMessages,
  };
}

export function prepareCodexStablePrefix(
  envelope: HostRequestEnvelope,
  config: TokenPilotCodexConfig,
): HostRequestEnvelope {
  if (!config.modules.stabilizer || config.proxyMode.pureForward) return envelope;

  const candidate = findRootPromptCandidate(envelope.messages);
  const instructionText = typeof envelope.instructions === "string" ? envelope.instructions : "";
  const instructionRewrite = instructionText.trim()
    ? rewriteTextForStablePrefix(instructionText)
    : null;
  const rootRewrite = candidate ? rewriteTextForStablePrefix(candidate.text) : null;
  const dynamicContextText = rootRewrite?.dynamicContextText || instructionRewrite?.dynamicContextText || "";
  const target = config.hooks.dynamicContextTarget;

  let rewrittenEnvelope = envelope;
  if (instructionRewrite?.changed) {
    rewrittenEnvelope = applyStablePrefixToInstructions({
      envelope: rewrittenEnvelope,
      dynamicContextTarget: target,
      mergeDynamicContextIntoInstructions: false,
    });
  }
  if (candidate && rootRewrite?.changed) {
    const nextCandidate = findRootPromptCandidate(rewrittenEnvelope.messages);
    if (nextCandidate) {
      rewrittenEnvelope = applyStablePrefixToMessage({
        envelope: rewrittenEnvelope,
        messageIndex: nextCandidate.index,
        dynamicContextTarget: target,
        mergeDynamicContextIntoMessage: false,
      });
      if (target === "developer" && dynamicContextText) {
        rewrittenEnvelope = insertDeveloperDynamicContextMessage({
          envelope: rewrittenEnvelope,
          dynamicContextText,
          afterMessageIndex: nextCandidate.index,
        });
      }
    }
  } else if (target === "developer" && dynamicContextText) {
    rewrittenEnvelope = insertDeveloperDynamicContextMessage({
      envelope: rewrittenEnvelope,
      dynamicContextText,
    });
  }

  const stablePromptParts = [
    instructionRewrite?.canonicalText ?? instructionText,
    rootRewrite?.canonicalText ?? candidate?.text ?? "",
  ];
  const existingPromptCacheKey =
    typeof rewrittenEnvelope.metadata?.promptCacheKey === "string"
      ? rewrittenEnvelope.metadata.promptCacheKey.trim()
      : "";

  const nextMetadata = {
    ...(rewrittenEnvelope.metadata ?? {}),
    promptCacheKey: existingPromptCacheKey || computeStablePromptCacheKey(envelope.model, stablePromptParts),
    promptCacheRetention: "24h",
  };

  return rewrittenEnvelope !== envelope || nextMetadata.promptCacheKey !== envelope.metadata?.promptCacheKey
    ? {
        ...rewrittenEnvelope,
        metadata: nextMetadata,
      }
    : envelope;
}
