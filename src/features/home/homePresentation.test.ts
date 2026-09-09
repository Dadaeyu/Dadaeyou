import assert from "node:assert/strict";
import test from "node:test";
import * as homePresentation from "./homePresentation.ts";
import {
  buildHomePlaceMapHref,
  cleanHomePresentationText,
  formatHomeDetailValue,
  formatHomeEventPeriod,
  normalizeHomeImageSource,
  shouldShowHomeParkingDetail,
  splitHomeRecommendationPlaces,
  summarizeHomeFee,
  shouldShowHomePlaceImage,
  summarizeHomeEvidence
} from "./homePresentation.ts";

type HomeFallbackCopyBuilder = (options: { compact?: boolean }) => {
  title: string;
  description: string | null;
};

const presentationWithFallbackCopy = homePresentation as typeof homePresentation & {
  buildHomeFallbackCopy?: HomeFallbackCopyBuilder;
};

test("홈 장소 지도 링크는 정확한 장소 ID와 검색 대체값을 함께 전달한다", () => {
  assert.equal(
    buildHomePlaceMapHref({ id: " 12345 ", title: " 한밭수목원 " }),
    "/map?contentId=12345&query=%ED%95%9C%EB%B0%AD%EC%88%98%EB%AA%A9%EC%9B%90"
  );
});

test("추천 장소는 입력 순서를 유지한 대표 1곳과 보조 최대 3곳으로 나눈다", () => {
  assert.deepEqual(splitHomeRecommendationPlaces(["a", "b", "c", "d", "e"]), {
    featured: "a",
    supporting: ["b", "c", "d"]
  });
  assert.deepEqual(splitHomeRecommendationPlaces([]), {
    featured: null,
    supporting: []
  });
});

test("compact fallback card copy omits the regular long title and description", () => {
  assert.equal(typeof presentationWithFallbackCopy.buildHomeFallbackCopy, "function");

  const buildFallbackCopy = presentationWithFallbackCopy.buildHomeFallbackCopy;
  const compactCopy = buildFallbackCopy({ compact: true });
  const regularCopy = buildFallbackCopy({});

  assert.notEqual(compactCopy.title, regularCopy.title);
  assert.equal(compactCopy.description, null);
  assert.match(regularCopy.title, /장소/u);
  assert.match(regularCopy.description ?? "", /주소|방문|확인/u);
});

test("관광공사 HTTP 이미지는 홈 프록시가 허용하는 HTTPS 주소로 바꾼다", () => {
  assert.equal(
    normalizeHomeImageSource(" http://tong.visitkorea.or.kr/cms/example.jpg "),
    "https://tong.visitkorea.or.kr/cms/example.jpg"
  );
  assert.equal(normalizeHomeImageSource("/images/local.png"), "/images/local.png");
  assert.equal(
    normalizeHomeImageSource("//example.com/image.jpg"),
    "https://example.com/image.jpg"
  );
});

test("대표 이미지 실패 상태는 같은 주소에만 적용한다", () => {
  const failedSource = "https://example.com/failed.jpg";

  assert.equal(shouldShowHomePlaceImage(null, null), false);
  assert.equal(shouldShowHomePlaceImage(failedSource, failedSource), false);
  assert.equal(shouldShowHomePlaceImage("https://example.com/new.jpg", failedSource), true);
});

test("카드 근거 요약은 여러 안내를 읽을 수 있게 정리하고 길이를 제한한다", () => {
  const evidence =
    "출입통로: 이동경로 폭이 넓고 내부 턱이 없습니다.<br/>접근로: 606번 버스 정류장에서 이동할 수 있습니다.";

  assert.match(summarizeHomeEvidence(evidence), /접근로/u);
  assert.match(summarizeHomeEvidence("가".repeat(80)), /…$/u);
});

test("상세 화면 원문 안내에서 HTML과 시스템 꼬리표를 정리한다", () => {
  const source =
    "장애인 주차: 장애인 전용 주차구역 있음<br/>※ 주변 휠체어 이용자 여유공간 있음_무장애 편의시설";

  assert.equal(
    cleanHomePresentationText(source),
    "장애인 주차: 장애인 전용 주차구역 있음 · 주변 휠체어 이용자 여유공간 있음"
  );
});

test("상세 항목 값은 라벨 반복과 불릿 기호를 제거한다", () => {
  const source = "운영시간: 09:30~17:30<br/>• 10:00~18:00<br/>※ 입장은 마감 30분 전까지";

  assert.equal(
    formatHomeDetailValue(source, "운영시간"),
    "09:30~17:30 · 10:00~18:00 · 입장은 마감 30분 전까지"
  );
});

test("붙어 들어온 운영 구간과 주의 문구를 읽을 수 있게 나눈다", () => {
  const source =
    "운영시간: 3월~10월 10:00~19:00- 11월~2월 10:00~18:00※ 마지막 수요일은 홈페이지 참고";

  assert.equal(
    formatHomeDetailValue(source, "운영시간"),
    "3월~10월 10:00~19:00 · 11월~2월 10:00~18:00 · 마지막 수요일은 홈페이지 참고"
  );
});

test("운영 종료보다 늦은 입장 마감은 잘못된 안내로 노출하지 않는다", () => {
  assert.equal(
    formatHomeDetailValue("09:30~17:40 (입장 마감 21:30까지)", "운영시간"),
    "09:30~17:40"
  );
  assert.equal(
    formatHomeDetailValue("09:30~17:40 (입장 마감 17:00까지)", "운영시간"),
    "09:30~17:40 (입장 마감 17:00까지)"
  );
});

test("요금의 대상 구분과 하위 항목을 한 문장에 붙이지 않는다", () => {
  const source = "[개인] - 성인 20,000원 - 청소년 15,000원 [단체] - 성인 17,000원";

  assert.equal(
    formatHomeDetailValue(source, "이용요금"),
    "개인 · 성인 20,000원 · 청소년 15,000원 · 단체 · 성인 17,000원"
  );
});

test("긴 요금표는 대표 요금만 남기고 전체 목록을 화면에 늘어놓지 않는다", () => {
  const source =
    "[개인] - 성인(20세~64세) 20,000원 - 어린이·청소년(48개월~19세) / 국군장병 / 예술인패스 소지자 15,000원 [단체] - 성인 17,000원 - 어린이·청소년 12,000원";

  assert.equal(summarizeHomeFee(source), "개인 · 성인 20,000원 · 어린이·청소년 등 15,000원 외");
});

test("소개 전문은 요청한 길이까지 정리하되 임의로 잘라내지 않는다", () => {
  const source = `장소 소개: ${"가".repeat(260)}`;

  assert.equal(formatHomeDetailValue(source, "장소 소개", 400), "가".repeat(260));
});

test("행사 기간은 사용자에게 익숙한 날짜 표기로 보여준다", () => {
  assert.equal(formatHomeEventPeriod("20260801", "20260831"), "2026. 8. 1. ~ 2026. 8. 31.");
  assert.equal(formatHomeEventPeriod(null, "20260831"), "2026. 8. 31.까지");
});

test("주차 가능처럼 설명이 없는 값은 상세 항목으로 반복하지 않는다", () => {
  assert.equal(shouldShowHomeParkingDetail("가능"), false);
  assert.equal(shouldShowHomeParkingDetail("주차 가능"), false);
  assert.equal(shouldShowHomeParkingDetail("지하 1층 주차장 이용"), true);
});
