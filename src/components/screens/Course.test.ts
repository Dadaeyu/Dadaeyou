import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./Course.tsx", import.meta.url), "utf8");

test("코스 보기 경로안내는 지도 출발지 검색으로 넘긴다", () => {
  assert.match(source, /buildPlaceRouteMapHref/u);
  assert.match(source, /onBeginRoute=/u);
  assert.match(source, /!isEditing && selectedSearchPlace\.contentId/u);
  assert.match(source, /from:\s*`\/course\/\$\{id\}`/u);
});

test("코스 편집 장소 추가 검색에는 경로안내를 넘기지 않는다", () => {
  const placeSearchBlock = source.slice(
    source.indexOf("{placeSearchOpen ?"),
    source.indexOf(") : selectedSearchPlace ?")
  );
  assert.match(placeSearchBlock, /detailAction=\{addPlaceFromSearch\}/u);
  assert.doesNotMatch(placeSearchBlock, /onBeginRoute=/u);
});
