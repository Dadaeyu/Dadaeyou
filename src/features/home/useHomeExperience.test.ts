import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./useHomeExperience.ts", import.meta.url), "utf8");

test("홈 추천 요청에 기기 GPS 좌표를 붙이지 않는다", () => {
  assert.doesNotMatch(source, /useMyLocation/u);
  assert.doesNotMatch(source, /params\.set\(["']lat["']/u);
  assert.doesNotMatch(source, /params\.set\(["']lng["']/u);
});
