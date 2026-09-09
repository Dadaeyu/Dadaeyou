import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./RouteEndpointsCard.tsx", import.meta.url), "utf8");

test("경로 카드는 출발지와 도착지를 따로 보여 준다", () => {
  assert.match(source, /출발지/u);
  assert.match(source, /도착지/u);
  assert.match(source, /OriginSearchField/u);
  assert.doesNotMatch(source, /→ 도착/u);
});
