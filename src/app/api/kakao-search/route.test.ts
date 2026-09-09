import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("카카오 검색은 키워드와 주소 결과를 합친다", () => {
  assert.match(source, /KAKAO_ADDRESS_URL/u);
  assert.match(source, /mergeKakaoLocalDocuments/u);
});

test("출발지 검색은 대전 20km 반경으로 세종을 자르지 않는다", () => {
  assert.match(source, /scope["']\) === ["']origin["']/u);
  assert.match(source, /if \(!originSearch\) keywordParams\.set\(["']radius["']/u);
});
