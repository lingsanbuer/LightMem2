import assert from "node:assert/strict";
import test from "node:test";

import { snapshotCodexResponsesStream } from "../src/stream-observer.js";

test("snapshotCodexResponsesStream extracts ids, usage, and assistant text from SSE payloads", () => {
  const raw = [
    "event: response.created",
    "data: {\"response\":{\"id\":\"resp-1\",\"previous_response_id\":\"resp-0\"}}",
    "",
    "event: response.output_text.delta",
    "data: {\"delta\":{\"output_text\":\"Hello \"}}",
    "",
    "event: response.output_text.delta",
    "data: {\"delta\":{\"content\":[{\"text\":\"world\"}]}}",
    "",
    "event: response.completed",
    "data: {\"usage\":{\"input_tokens\":100,\"output_tokens\":20}}",
    "",
    "data: [DONE]",
    "",
  ].join("\n");

  const snapshot = snapshotCodexResponsesStream(raw);
  assert.equal(snapshot.responseId, "resp-1");
  assert.equal(snapshot.previousResponseId, "resp-0");
  assert.equal(snapshot.assistantText, "Hello world");
  assert.deepEqual(snapshot.usage, { input_tokens: 100, output_tokens: 20 });
});
