import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./OriginPlacePicker.tsx", import.meta.url), "utf8");

test("출발지 검색은 이전 요청 결과를 나중에 덮어쓰지 않는다", () => {
  assert.match(source, /let cancelled = false/u);
  assert.match(source, /if \(cancelled\) return/u);
  assert.match(source, /fetchKakaoPlaces/u);
  assert.match(source, /originSearch:\s*true/u);
});
