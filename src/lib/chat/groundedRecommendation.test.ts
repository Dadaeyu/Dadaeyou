import assert from "node:assert/strict";
import test from "node:test";
import { shouldUseGroundedRecommendation } from "./groundedRecommendation.ts";

test("장소 추천은 한 곳만 검색돼도 근거 기반 문장을 사용한다", () => {
  assert.equal(shouldUseGroundedRecommendation("recommend_place", 1), true);
  assert.equal(shouldUseGroundedRecommendation("recommend_place", 2), true);
});

test("검색 장소가 없거나 추천 의도가 아니면 근거 기반 추천 분기를 사용하지 않는다", () => {
  assert.equal(shouldUseGroundedRecommendation("recommend_place", 0), false);
  assert.equal(shouldUseGroundedRecommendation("ask_info", 2), false);
});
