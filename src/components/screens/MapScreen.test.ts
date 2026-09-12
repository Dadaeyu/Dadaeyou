import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./MapScreen.tsx", import.meta.url), "utf8");

test("지도 경로안내는 GPS 좌표를 origin으로 보내지 않는다", () => {
  assert.doesNotMatch(source, /pendingRouteModeRef/u);
  assert.doesNotMatch(source, /name:\s*["']내 위치["']/u);
  assert.match(source, /routeOrigin/u);
  assert.match(source, /handleBeginRoute/u);
  assert.match(source, /handlePickOrigin/u);
  assert.match(source, /if \(routeOriginPhase === "searching"\) return/u);
});

test("코스에서 온 경로안내는 출발지 검색을 열고 코스로 돌아간다", () => {
  assert.match(source, /route["']\) === ["']1["']/u);
  assert.match(source, /parseCourseReturnPath/u);
  assert.match(source, /setRouteOriginPhase\(["']searching["']\)/u);
  assert.match(source, /router\.push\(returnTo\)/u);
  assert.match(source, /onDeselect=\{closePlaceDetail\}/u);
  assert.doesNotMatch(source, /params\.delete\(["']route["']\)/u);
});
