import assert from "node:assert/strict";
import test from "node:test";
import {
  createClaudeMessagesPayloadCodec,
  extractMessagesInputText,
} from "../src/messages-codec.js";

test("extractMessagesInputText flattens Anthropic content blocks", () => {
  const text = extractMessagesInputText([
    {
      role: "user",
      content: [
        { type: "text", text: "hello" },
        { type: "tool_result", content: "from tool" },
      ],
    },
    {
      role: "assistant",
      content: [
        { type: "text", text: "world" },
      ],
    },
  ]);
  assert.equal(text, "hello\nfrom tool\nworld");
});

test("codec maps Messages request and response shapes", () => {
  const codec = createClaudeMessagesPayloadCodec();
  const request = codec.decodeRequest({
    model: "claude-sonnet-4-6",
    stream: false,
    system: "stay stable",
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hi" }],
      },
    ],
    tools: [{ name: "bash" }],
    metadata: { sessionId: "sess-1" },
    max_tokens: 512,
  });
  assert.equal(request.session.sessionId, "sess-1");
  assert.equal(request.instructions, "stay stable");
  assert.equal(request.messages[0]?.role, "user");
  assert.equal(request.metadata?.inputText, "hi");

  const response = codec.decodeResponse({
    id: "msg_123",
    content: [
      { type: "text", text: "done" },
      { type: "tool_use", id: "tool_1", name: "bash", input: { cmd: "pwd" } },
    ],
    usage: { input_tokens: 10, output_tokens: 5 },
    stop_reason: "end_turn",
  }, request);
  assert.equal(response.assistantText, "done");
  assert.equal(response.toolCalls?.[0]?.toolCallId, "tool_1");
  assert.equal(response.toolCalls?.[0]?.toolName, "bash");
  assert.deepEqual(response.toolCalls?.[0]?.argumentsJson, { cmd: "pwd" });
  assert.deepEqual(response.usage, { input_tokens: 10, output_tokens: 5 });
});

test("claude session resolver synthesizes a per-request session id when host session markers are absent", () => {
  const codec = createClaudeMessagesPayloadCodec();
  const payloadA: any = {
    model: "claude-sonnet-4-6",
    stream: false,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hi a" }],
      },
    ],
  };
  const payloadB: any = {
    model: "claude-sonnet-4-6",
    stream: false,
    messages: [
      {
        role: "user",
        content: [{ type: "text", text: "hi b" }],
      },
    ],
  };

  const requestA = codec.decodeRequest(payloadA);
  const requestB = codec.decodeRequest(payloadB);

  assert.match(requestA.session.sessionId, /^claude-synth-/);
  assert.match(requestB.session.sessionId, /^claude-synth-/);
  assert.notEqual(requestA.session.sessionId, requestB.session.sessionId);
  assert.equal((payloadA.metadata as Record<string, unknown>)?.tokenpilotSyntheticSessionId, requestA.session.sessionId);
  assert.equal((payloadB.metadata as Record<string, unknown>)?.tokenpilotSyntheticSessionId, requestB.session.sessionId);
});
