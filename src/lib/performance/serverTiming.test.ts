import assert from "node:assert/strict";
import test from "node:test";
import { ServerTiming, withServerTiming } from "./serverTiming.ts";

function createClock(...values: number[]) {
  let index = 0;
  return () => values[index++] ?? values.at(-1) ?? 0;
}

test("withServerTiming adds private timing headers without changing response semantics", async () => {
  const response = await withServerTiming(
    async (timing) => {
      await timing.measure("usage", async () => "reserved");
      return new Response("unchanged", {
        headers: {
          "X-Test": "preserved"
        },
        status: 202,
        statusText: "Accepted"
      });
    },
    createClock(0, 2, 7, 10)
  );

  assert.equal(response.status, 202);
  assert.equal(response.statusText, "Accepted");
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("X-Test"), "preserved");
  assert.equal(response.headers.get("Server-Timing"), "total;dur=10.0, usage;dur=5.0");
  assert.equal(await response.text(), "unchanged");
});

test("withServerTiming includes a failed span on a handled error response", async () => {
  const response = await withServerTiming(
    async (timing) => {
      try {
        await timing.measure("generation", async () => Promise.reject(new Error("upstream")));
      } catch {
        return Response.json({ message: "unchanged" }, { status: 502 });
      }

      throw new Error("unreachable");
    },
    createClock(0, 2, 7, 10)
  );

  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { message: "unchanged" });
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.equal(response.headers.get("Server-Timing"), "total;dur=10.0, generation;dur=5.0");
});

test("measure records a span when the operation throws and preserves the error", async () => {
  const timing = new ServerTiming(createClock(100, 110, 125));
  const expected = new Error("expected");

  await assert.rejects(
    timing.measure("generation", async () => Promise.reject(expected)),
    expected
  );

  assert.equal(timing.toHeaderValue(), "generation;dur=15.0");
});

test("record sanitizes invalid and excessive durations", () => {
  const timing = new ServerTiming(() => 0);

  timing.record("usage", Number.NaN);
  timing.record("classify", Number.POSITIVE_INFINITY);
  timing.record("retrieval", -1);
  timing.record("generation", 9_999_999);

  assert.equal(
    timing.toHeaderValue(),
    "usage;dur=0.0, classify;dur=0.0, retrieval;dur=0.0, generation;dur=3600000.0"
  );
});
