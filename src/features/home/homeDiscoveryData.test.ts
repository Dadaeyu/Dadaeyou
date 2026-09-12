import assert from "node:assert/strict";
import test from "node:test";
import {
  formatHomeDiscoveryPeriod,
  getCourseDiscoveryTitle,
  pickCourseDiscoveryImage,
  pickFestivalPlaces,
  rankFavoritePlaces,
  rankReviewPlaces,
  rankSharedCourses
} from "./homeDiscoveryData.ts";
import type { RankedHomePlace } from "./homeData.ts";

const placeSignals = [
  { id: "empty", name: "반응 없음", average_rating: 5, review_count: 0, like_count: 0 },
  { id: "a", name: "즐겨찾기 1위", average_rating: 3.5, review_count: 1, like_count: 8 },
  { id: "b", name: "후기 많은 곳", average_rating: 4.8, review_count: 7, like_count: 1 },
  { id: "c", name: "평점 1위", average_rating: 5, review_count: 1, like_count: 1 },
  { id: "d", name: "즐겨찾기 2위", average_rating: null, review_count: 0, like_count: 6 },
  { id: "e", name: "평점 2위", average_rating: 4.9, review_count: 1, like_count: 0 },
  { id: "f", name: "즐겨찾기 3위", average_rating: 2, review_count: 1, like_count: 4 },
  { id: "g", name: "즐겨찾기 4위", average_rating: 1, review_count: 1, like_count: 3 },
  { id: "h", name: "다섯 번째 즐겨찾기", average_rating: 5, review_count: 3, like_count: 2 }
];

test("후기 좋은 장소는 후기 있는 장소만 평점과 후기 수 기준으로 최대 4개 고른다", () => {
  const ranked = rankReviewPlaces(placeSignals);

  assert.deepEqual(
    ranked.map((place) => place.id),
    ["h", "c", "e", "b"]
  );
});

test("즐겨찾기 많은 장소는 찜이 있는 장소만 찜 수 기준으로 최대 4개 고른다", () => {
  const ranked = rankFavoritePlaces(placeSignals);

  assert.deepEqual(
    ranked.map((place) => place.id),
    ["a", "d", "f", "g"]
  );
});

test("공유 코스는 신호, 장소, 장소 이미지가 모두 있는 항목만 고른다", () => {
  const ranked = rankSharedCourses(
    [
      {
        course_id: 1,
        course_nm: "빈 신호",
        places: [{ title: "A", addr1: null, firstimage: "https://img/a.jpg" }],
        like_count: 0,
        average_rating: 0
      },
      {
        course_id: 2,
        course_nm: "두 번째 장소 사진",
        places: [
          { title: "B", addr1: null, firstimage: "" },
          { title: "C", addr1: null, firstimage: "https://img/c.jpg" }
        ],
        like_count: 2,
        average_rating: 5,
        review_count: 1
      },
      {
        course_id: 3,
        course_nm: "찜 코스",
        places: [{ title: "D", addr1: null, firstimage: "https://img/d.jpg" }],
        like_count: 4,
        average_rating: 3,
        review_count: 0
      },
      {
        course_id: 4,
        course_nm: "평점 코스",
        places: [{ title: "E", addr1: null, firstimage: "https://img/e.jpg" }],
        like_count: 1,
        average_rating: 5,
        review_count: 3
      }
    ],
    3
  );

  assert.deepEqual(
    ranked.map((course) => course.course_id),
    [3, 4, 2]
  );
  assert.equal(ranked[2]?.discoveryImage, "https://img/c.jpg");
});

test("코스 이미지는 포함 장소 중 처음 확인되는 firstimage를 사용한다", () => {
  assert.equal(
    pickCourseDiscoveryImage({
      places: [
        { title: "A", addr1: null, firstimage: "  " },
        { title: "B", addr1: null, firstimage: "https://img/b.jpg" }
      ]
    }),
    "https://img/b.jpg"
  );
  assert.equal(
    pickCourseDiscoveryImage({
      places: [{ title: "A", addr1: null, firstimage: " https://img/a.jpg " }]
    }),
    "https://img/a.jpg"
  );
});

test("임시처럼 짧은 코스명은 첫 장소와 장소 수를 이용해 설명형 제목으로 바꾼다", () => {
  assert.equal(
    getCourseDiscoveryTitle({
      course_nm: "코스2-1",
      place_count: 4,
      places: [{ title: "대전선사박물관", addr1: null, firstimage: null }]
    }),
    "대전선사박물관부터 둘러보는 4곳 코스"
  );
  assert.equal(
    getCourseDiscoveryTitle({ course_nm: "한밭수목원 산책", place_count: 2, places: [] }),
    "한밭수목원 산책"
  );
});

test("행사 기간은 홈 발견 카드용 짧은 날짜로 표시한다", () => {
  assert.equal(formatHomeDiscoveryPeriod("20260801", "20260831"), "8. 1. - 8. 31.");
  assert.equal(formatHomeDiscoveryPeriod("20260801", null), "8. 1.부터");
  assert.equal(formatHomeDiscoveryPeriod(null, "20260831"), "8. 31.까지");
  assert.equal(formatHomeDiscoveryPeriod("20260230", null), "일정 확인");
});

test("행사는 받은 순서를 유지하면서 최대 3개만 쓴다", () => {
  const festivals = [1, 2, 3, 4].map(
    (id) =>
      ({
        id: String(id),
        title: `행사 ${id}`,
        category: null,
        address: null,
        imageUrl: null,
        latitude: null,
        longitude: null,
        sourceUpdatedAt: null,
        overview: null,
        hours: null,
        restDate: null,
        fee: null,
        phone: null,
        parking: null,
        officialUrl: null,
        reservationUrl: null,
        accessibility: [],
        matchedNeedIds: []
      }) satisfies RankedHomePlace
  );

  assert.deepEqual(
    pickFestivalPlaces(festivals).map((festival) => festival.id),
    ["1", "2", "3"]
  );
});
