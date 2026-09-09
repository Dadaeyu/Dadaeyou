import assert from "node:assert/strict";
import test from "node:test";
import {
  buildInternalPlaceMapHref,
  buildRelatedCourseQuery,
  getKnowledgeContentId,
  isCourseRecommendationRequest,
  normalizeContentIds
} from "./discoveryLinks.ts";

test("place recommendations open the exact place in the internal map", () => {
  assert.equal(
    buildInternalPlaceMapHref({ contentId: "12345", title: "한밭수목원" }),
    "/map?contentId=12345&query=%ED%95%9C%EB%B0%AD%EC%88%98%EB%AA%A9%EC%9B%90&mode=map"
  );
});

test("place recommendations fall back to an internal title search", () => {
  assert.equal(
    buildInternalPlaceMapHref({ contentId: null, title: "대전 예술의전당" }),
    "/map?query=%EB%8C%80%EC%A0%84+%EC%98%88%EC%88%A0%EC%9D%98%EC%A0%84%EB%8B%B9&mode=map"
  );
});

test("content ids are trimmed, deduplicated, bounded, and unsafe values are ignored", () => {
  assert.deepEqual(normalizeContentIds([" 123 ", "123", "abc-9", "a,b", "", "456"], 2), [
    "123",
    "abc-9"
  ]);
});

test("related course queries prefer existing courses containing recommended places", () => {
  assert.equal(
    buildRelatedCourseQuery(["123", "456"]),
    "/api/courses/shared?limit=3&sort=rating_desc&contentIds=123%2C456"
  );
  assert.equal(buildRelatedCourseQuery([]), "/api/courses/shared?limit=3&sort=rating_desc");
});

test("natural Korean course requests are distinguished from place-only questions", () => {
  assert.equal(isCourseRecommendationRequest("아이와 하루 코스 추천해줘"), true);
  assert.equal(isCourseRecommendationRequest("이 장소들 동선도 알려줘"), true);
  assert.equal(isCourseRecommendationRequest("휠체어 가능한 박물관 알려줘"), false);
});

test("knowledge metadata exposes a safe place content id for exact internal navigation", () => {
  assert.equal(getKnowledgeContentId({ contentid: 2738037 }), "2738037");
  assert.equal(getKnowledgeContentId({ contentId: " 12345 " }), "12345");
  assert.equal(getKnowledgeContentId({ contentid: "123,456" }), null);
});
