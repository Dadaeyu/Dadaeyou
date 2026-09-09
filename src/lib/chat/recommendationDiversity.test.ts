import assert from "node:assert/strict";
import test from "node:test";
import { asksForSingleRecommendation, selectDiverseItems } from "./recommendationDiversity.ts";

type Candidate = { id: string; title: string };
type RecommendationDiversityModule = typeof import("./recommendationDiversity.ts") & {
  resolveRequestedRecommendationLimit?: (
    message: string,
    options?: { defaultLimit?: number; maxLimit?: number }
  ) => number;
};

const candidates: Candidate[] = [
  { id: "a-1", title: "천연기념물센터" },
  { id: "a-2", title: "천연기념물센터" },
  { id: "b-1", title: "대전시립미술관" },
  { id: "c-1", title: "한밭수목원" },
  { id: "d-1", title: "대전교통문화연수원" }
];

test("같은 장소의 문서 조각이 여러 개여도 추천 후보는 장소별로 하나씩 고른다", () => {
  const selected = selectDiverseItems({
    items: candidates,
    getTitle: (candidate) => candidate.title,
    limit: 3
  });

  assert.deepEqual(
    selected.map((candidate) => candidate.title),
    ["천연기념물센터", "대전시립미술관", "한밭수목원"]
  );
});

test("이미 보여준 장소보다 새로운 장소를 먼저 추천한다", () => {
  const selected = selectDiverseItems({
    items: candidates,
    getTitle: (candidate) => candidate.title,
    limit: 3,
    seenTitles: ["천연 기념물 센터", "대전시립미술관"]
  });

  assert.deepEqual(
    selected.map((candidate) => candidate.title),
    ["한밭수목원", "대전교통문화연수원", "천연기념물센터"]
  );
});

test("새 후보가 부족하면 이전 장소도 뒤에서 보충한다", () => {
  const selected = selectDiverseItems({
    items: candidates,
    getTitle: (candidate) => candidate.title,
    limit: 4,
    seenTitles: ["천연기념물센터", "대전시립미술관", "한밭수목원"]
  });

  assert.deepEqual(
    selected.map((candidate) => candidate.title),
    ["대전교통문화연수원", "천연기념물센터", "대전시립미술관", "한밭수목원"]
  );
});

test("'추천한 곳 말고'를 한 곳만 추천해 달라는 요청으로 오해하지 않는다", () => {
  assert.equal(asksForSingleRecommendation("방금 추천한 곳 말고 다른 곳도 추천해줘"), false);
  assert.equal(asksForSingleRecommendation("그중 한 곳만 추천해줘"), true);
});

async function loadRequestedRecommendationLimitResolver() {
  const loadedModule =
    (await import("./recommendationDiversity.ts")) as RecommendationDiversityModule;
  const resolveRequestedRecommendationLimit = loadedModule.resolveRequestedRecommendationLimit;
  assert.equal(
    typeof resolveRequestedRecommendationLimit,
    "function",
    "recommendationDiversity.ts should export resolveRequestedRecommendationLimit"
  );
  return resolveRequestedRecommendationLimit as NonNullable<
    RecommendationDiversityModule["resolveRequestedRecommendationLimit"]
  >;
}

test("요청 문장에 숫자와 개 단위가 있으면 그 추천 개수를 사용한다", async () => {
  const resolveRequestedRecommendationLimit = await loadRequestedRecommendationLimitResolver();

  assert.equal(resolveRequestedRecommendationLimit("대전 문화시설 2개 추천해줘"), 2);
});

test("요청 문장에 한국어 수사와 곳 단위가 있으면 그 추천 개수를 사용한다", async () => {
  const resolveRequestedRecommendationLimit = await loadRequestedRecommendationLimitResolver();

  assert.equal(resolveRequestedRecommendationLimit("휠체어로 가기 좋은 곳 두 곳 추천해줘"), 2);
});

test("하나만 요청하면 추천 개수를 1로 해석한다", async () => {
  const resolveRequestedRecommendationLimit = await loadRequestedRecommendationLimitResolver();

  assert.equal(resolveRequestedRecommendationLimit("그중 하나만 추천해줘"), 1);
});

test("명시한 추천 개수가 최대값보다 크면 최대값으로 제한한다", async () => {
  const resolveRequestedRecommendationLimit = await loadRequestedRecommendationLimitResolver();

  assert.equal(
    resolveRequestedRecommendationLimit("대전 여행지 10개 추천해줘", {
      defaultLimit: 2,
      maxLimit: 5
    }),
    5
  );
});

test("명시한 추천 개수가 없으면 기본 추천 개수를 사용한다", async () => {
  const resolveRequestedRecommendationLimit = await loadRequestedRecommendationLimitResolver();

  assert.equal(
    resolveRequestedRecommendationLimit("대전 문화시설 추천해줘", {
      defaultLimit: 2,
      maxLimit: 5
    }),
    2
  );
});
