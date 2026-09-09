import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("./EasyHome.tsx", import.meta.url), "utf8");

test("easy home does not force-scroll when selecting help choices", () => {
  assert.match(source, /const selectNeed = \(needId: HomeNeedId\) => \{/u);
  assert.match(source, /onClick=\{\(\) => selectNeed\(option\.id\)\}/u);
  assert.match(source, /onClick=\{\(\) => selectNeed\("accessible_toilet"\)\}/u);
  assert.doesNotMatch(source, /const selectNeedAndShowResults/u);
});

test("easy home exposes an explicit recommendation scroll button", () => {
  assert.match(source, /선택한 조건으로 추천 보기/u);
  assert.match(source, /const showSelectedRecommendations = \(\) => \{/u);
  assert.match(source, /scrollIntoView\(\{/u);
  assert.match(source, /aria-controls=\{EASY_RECOMMENDATIONS_ID\}/u);
});
