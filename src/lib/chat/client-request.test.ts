import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  CHAT_REQUEST_NETWORK_ERROR_MESSAGE,
  CHAT_REQUEST_TIMEOUT_MESSAGE,
  requestChatJson
} from "./client-request.ts";

type MockResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

test("requestChatJson returns parsed JSON for a successful response", async () => {
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ message: "ok" })
    }) as Response;

  const result = await requestChatJson<{ message: string }>("/api/chat", { method: "POST" });

  assert.deepEqual(result, { message: "ok" });
});

test("requestChatJson preserves API error.error before error.message on HTTP failures", async () => {
  globalThis.fetch = async () =>
    ({
      ok: false,
      json: async () => ({ error: "사용량이 초과됐어요.", message: "fallback" })
    }) as Response;

  await assert.rejects(() => requestChatJson("/api/chat"), {
    message: "사용량이 초과됐어요."
  });
});

test("requestChatJson preserves API error.message on HTTP failures", async () => {
  globalThis.fetch = async () =>
    ({
      ok: false,
      json: async () => ({ message: "로그인이 필요해요." })
    }) as Response;

  await assert.rejects(() => requestChatJson("/api/chat"), {
    message: "로그인이 필요해요."
  });
});

test("requestChatJson uses a safe generic message when response JSON is malformed", async () => {
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => {
        throw new SyntaxError("Unexpected token");
      }
    }) as unknown as Response;

  await assert.rejects(() => requestChatJson("/api/chat"), {
    message: CHAT_REQUEST_NETWORK_ERROR_MESSAGE
  });
});

test("requestChatJson rejects on timeout even when response.json ignores abort", async () => {
  globalThis.fetch = async (_url, init) =>
    ({
      ok: true,
      json: () =>
        new Promise((resolve) => {
          init?.signal?.addEventListener("abort", () => undefined);
          setTimeout(() => resolve({ message: "late" }), 30);
        })
    }) as Response;

  await assert.rejects(() => requestChatJson("/api/chat", {}, 5), {
    message: CHAT_REQUEST_TIMEOUT_MESSAGE
  });
});

test("requestChatJson rejects on parent cancel even when fetch ignores abort", async () => {
  const controller = new AbortController();
  globalThis.fetch = async () =>
    new Promise<MockResponse>((resolve) => {
      setTimeout(() => resolve({ ok: true, json: async () => ({ message: "late" }) }), 30);
    }) as Promise<Response>;

  const request = requestChatJson("/api/chat", { signal: controller.signal }, 60_000);
  controller.abort(new Error("cancelled by caller"));

  await assert.rejects(() => request, { message: "cancelled by caller" });
});

test("requestChatJson rejects pre-aborted calls without starting fetch", async () => {
  const controller = new AbortController();
  controller.abort(new Error("already cancelled"));
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return { ok: true, json: async () => ({}) } as Response;
  };

  await assert.rejects(() => requestChatJson("/api/chat", { signal: controller.signal }), {
    message: "already cancelled"
  });
  assert.equal(fetchCalls, 0);
});

test("requestChatJson clears timeout timers after success", async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  let createdTimers = 0;
  let clearedTimers = 0;

  globalThis.setTimeout = ((handler: TimerHandler, timeout?: number, ...args: unknown[]) => {
    createdTimers += 1;
    return originalSetTimeout(handler, timeout, ...args);
  }) as typeof globalThis.setTimeout;
  globalThis.clearTimeout = ((timer?: Parameters<typeof globalThis.clearTimeout>[0]) => {
    clearedTimers += 1;
    return originalClearTimeout(timer);
  }) as typeof globalThis.clearTimeout;
  globalThis.fetch = async () =>
    ({
      ok: true,
      json: async () => ({ message: "ok" })
    }) as Response;

  try {
    await requestChatJson("/api/chat", {}, 60_000);
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }

  assert.equal(createdTimers, 1);
  assert.equal(clearedTimers, 1);
});
