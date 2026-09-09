import assert from "node:assert/strict";
import test from "node:test";
import { getChatScrollTarget } from "./scrollTarget.ts";

test("an assistant reply keeps the latest user question as the visible scroll anchor", () => {
  assert.deepEqual(
    getChatScrollTarget(
      [
        { id: 1, role: "assistant" },
        { id: 2, role: "user" },
        { id: 3, role: "assistant" }
      ],
      false
    ),
    { kind: "message", messageId: 2, block: "start" }
  );
});

test("a pending user question scrolls to the bottom while the answer is loading", () => {
  assert.deepEqual(
    getChatScrollTarget(
      [
        { id: 1, role: "assistant" },
        { id: 2, role: "user" }
      ],
      true
    ),
    { kind: "bottom", block: "end" }
  );
});
