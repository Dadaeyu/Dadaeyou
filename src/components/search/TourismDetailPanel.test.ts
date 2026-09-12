import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./TourismDetailPanel.tsx", import.meta.url), "utf8");

test("경로안내는 출발지 검색 뒤에 도보·자동차를 고른다", () => {
  assert.match(source, /RouteEndpointsCard/u);
  assert.match(source, /onBeginRoute/u);
  assert.doesNotMatch(source, /출발 \$\{routeOrigin\.name\} → 도착/u);
});
