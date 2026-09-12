import assert from "node:assert/strict";
import test from "node:test";
import { buildPlaceRouteMapHref, parseCourseReturnPath } from "./mapRouteHref.ts";

test("코스 장소 경로안내 링크는 지도에 장소와 출발지 검색을 넘긴다", () => {
  assert.equal(
    buildPlaceRouteMapHref({
      contentId: " 12345 ",
      name: " 성심당 ",
      from: "/course/88"
    }),
    "/map?contentId=12345&query=%EC%84%B1%EC%8B%AC%EB%8B%B9&route=1&from=%2Fcourse%2F88"
  );
});

test("코스가 아닌 복귀 경로는 지도 링크에 넣지 않는다", () => {
  assert.equal(
    buildPlaceRouteMapHref({
      contentId: "12345",
      name: "성심당",
      from: "https://example.com"
    }),
    "/map?contentId=12345&query=%EC%84%B1%EC%8B%AC%EB%8B%B9&route=1"
  );
  assert.equal(parseCourseReturnPath("/course/88"), "/course/88");
  assert.equal(parseCourseReturnPath("/course/ai-preview"), "/course/ai-preview");
  assert.equal(parseCourseReturnPath("/map"), null);
  assert.equal(parseCourseReturnPath("//evil.example"), null);
});
