import assert from "node:assert/strict";
import test from "node:test";
import {
  buildHomeCourseCandidates,
  buildHomeCourseSummaries,
  loadHomeCourseSummaries,
  type HomeCourseRow
} from "./homeCourseSummary.ts";

function course(
  courseId: number,
  name: string,
  overrides: Partial<HomeCourseRow> = {}
): HomeCourseRow {
  return {
    course_id: courseId,
    course_nm: name,
    open_yn: "Y",
    delete_yn: "N",
    ...overrides
  };
}

test("홈 코스 후보는 기존 반응 점수와 동률 기준으로 정렬한다", () => {
  const candidates = buildHomeCourseCandidates(
    [course(1, "나 코스"), course(2, "다 코스"), course(3, "가 코스")],
    [
      { course_id: 1 },
      { course_id: 1 },
      { course_id: 2 },
      { course_id: 2 },
      { course_id: 3 },
      { course_id: 3 },
      { course_id: 3 }
    ],
    [
      { course_id: 1, course_rating: 5 },
      { course_id: 1, course_rating: 5 },
      { course_id: 2, course_rating: 3 },
      { course_id: 2, course_rating: 3 },
      { course_id: 2, course_rating: 3 },
      { course_id: 3, course_rating: 4 }
    ]
  );

  // 세 코스 모두 점수 15점. 좋아요 수, 후기 수 순으로 기존 홈 동률을 해소한다.
  assert.deepEqual(
    candidates.map((candidate) => candidate.course_id),
    [3, 2, 1]
  );
});

test("동일한 반응 수치의 마지막 동률은 한글 코스명 순으로 안정적으로 정렬한다", () => {
  const candidates = buildHomeCourseCandidates(
    [course(1, "하늘 코스"), course(2, "가람 코스")],
    [{ course_id: 1 }, { course_id: 1 }, { course_id: 2 }, { course_id: 2 }],
    []
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.course_nm),
    ["가람 코스", "하늘 코스"]
  );
});

test("비공개·삭제·테스트 코스는 홈 후보에서 제외한다", () => {
  const candidates = buildHomeCourseCandidates(
    [
      course(1, "공개 코스"),
      course(2, "비공개 코스", { open_yn: "N" }),
      course(3, "삭제 코스", { delete_yn: "Y" }),
      course(4, "테스트 코스")
    ],
    [
      { course_id: 1 },
      { course_id: 1 },
      { course_id: 2 },
      { course_id: 2 },
      { course_id: 3 },
      { course_id: 3 },
      { course_id: 4 },
      { course_id: 4 }
    ],
    []
  );

  assert.deepEqual(
    candidates.map((candidate) => candidate.course_id),
    [1]
  );
});

test("장소나 대표 이미지가 없는 후보는 건너뛰고 빈 입력은 빈 요약을 반환한다", () => {
  const candidates = buildHomeCourseCandidates(
    [course(1, "이미지 없음"), course(2, "표시 가능")],
    [{ course_id: 1 }, { course_id: 1 }, { course_id: 2 }, { course_id: 2 }],
    []
  );
  const summaries = buildHomeCourseSummaries(
    candidates,
    [
      { course_id: 1, day: 1, place_id: 10 },
      { course_id: 2, day: 1, place_id: 20 },
      { course_id: 2, day: 2, place_id: 21 }
    ],
    [
      {
        place_id: 10,
        title: "숨김 장소",
        firstimage: "https://img/hidden.jpg",
        use_yn: "N",
        delete_yn: "N"
      },
      {
        place_id: 20,
        title: "삭제된 장소",
        firstimage: "https://img/deleted.jpg",
        use_yn: "Y",
        delete_yn: "Y"
      },
      {
        place_id: 21,
        title: "한밭수목원",
        firstimage: "https://img/arboretum.jpg",
        use_yn: "Y",
        delete_yn: null
      }
    ]
  );

  assert.deepEqual(summaries, [
    {
      course_id: 2,
      course_nm: "표시 가능",
      places: [{ title: "한밭수목원", firstimage: "https://img/arboretum.jpg" }],
      place_count: 1,
      like_count: 2,
      average_rating: 0,
      review_count: 0
    }
  ]);
  assert.deepEqual(buildHomeCourseCandidates([], [], []), []);
  assert.deepEqual(buildHomeCourseSummaries([], [], []), []);
});

test("요약 로더는 정렬된 후보를 작은 배치로 보강하고 2개를 찾으면 중단한다", async () => {
  const detailBatches: number[][] = [];
  const placeBatches: number[][] = [];
  const courses = [
    course(1, "첫 후보"),
    course(2, "둘째 후보"),
    course(3, "셋째 후보"),
    course(4, "넷째 후보"),
    course(5, "조회하면 안 되는 후보")
  ];
  const likes = courses.flatMap((item, index) =>
    Array.from({ length: 6 - index }, () => ({ course_id: item.course_id }))
  );

  const summaries = await loadHomeCourseSummaries(
    {
      loadCourses: async () => courses,
      loadLikes: async () => likes,
      loadRatings: async () => [],
      loadDetails: async (courseIds) => {
        detailBatches.push([...courseIds]);
        return courseIds.map((courseId) => ({
          course_id: courseId,
          day: 1,
          place_id: courseId * 10
        }));
      },
      loadPlaces: async (placeIds) => {
        placeBatches.push([...placeIds]);
        return placeIds.map((placeId) => ({
          place_id: placeId,
          title: `장소 ${placeId}`,
          firstimage: placeId >= 30 ? `https://img/${placeId}.jpg` : null,
          use_yn: "Y",
          delete_yn: placeId === 20 ? "Y" : "N"
        }));
      }
    },
    { batchSize: 2, resultLimit: 2 }
  );

  assert.deepEqual(
    summaries.map((summary) => summary.course_id),
    [3, 4]
  );
  assert.deepEqual(detailBatches, [
    [1, 2],
    [3, 4]
  ]);
  assert.deepEqual(placeBatches, [
    [10, 20],
    [30, 40]
  ]);
});

test("공개 코스가 없으면 집계나 장소 보강 쿼리를 시작하지 않는다", async () => {
  const calls: string[] = [];
  const summaries = await loadHomeCourseSummaries({
    loadCourses: async () => [],
    loadLikes: async () => {
      calls.push("likes");
      return [];
    },
    loadRatings: async () => {
      calls.push("ratings");
      return [];
    },
    loadDetails: async () => {
      calls.push("details");
      return [];
    },
    loadPlaces: async () => {
      calls.push("places");
      return [];
    }
  });

  assert.deepEqual(summaries, []);
  assert.deepEqual(calls, []);
});
