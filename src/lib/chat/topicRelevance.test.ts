import assert from "node:assert/strict";
import test from "node:test";
import {
  extractExplicitChatCategories,
  extractExplicitChatTheme,
  filterRowsByAllowedContentIds,
  filterRowsByExplicitCategories,
  resolveSessionChatCategories,
  resolveSessionChatTheme
} from "./topicRelevance.ts";

test("빵집 요청은 음식점 범주와 빵집 테마로 해석한다", () => {
  assert.deepEqual(extractExplicitChatCategories("유명한 빵집 위주로 1박 2일 코스 짜줘"), [
    "음식점"
  ]);
  assert.equal(extractExplicitChatTheme("유명한 빵집 위주로 1박 2일 코스 짜줘"), "bakery");
});

test("명시한 음식점 요청에서는 문화시설 후보를 제거한다", () => {
  const rows = [
    { title: "성심당", category: "음식점" },
    { title: "3·8민주의거기념관", category: "문화시설" }
  ];

  assert.deepEqual(filterRowsByExplicitCategories(rows, ["음식점"]), [rows[0]]);
});

test("후속 질문은 현재 대화의 직전 빵집 조건을 이어받는다", () => {
  const history = [{ role: "user" as const, content: "유명한 빵집 추천해줘" }];

  assert.deepEqual(resolveSessionChatCategories("그중 휠체어로 갈 수 있는 곳은?", history), [
    "음식점"
  ]);
  assert.equal(resolveSessionChatTheme("그중 휠체어로 갈 수 있는 곳은?", history), "bakery");
});

test("새 장소나 새 범주를 명시하면 이전 빵집 조건을 이어받지 않는다", () => {
  const history = [{ role: "user" as const, content: "유명한 빵집 추천해줘" }];

  assert.deepEqual(resolveSessionChatCategories("대전시립미술관은 어때?", history), ["문화시설"]);
  assert.equal(resolveSessionChatTheme("대전시립미술관은 어때?", history), null);
});

test("빵집 테마가 지정되면 허용된 장소 content id만 남긴다", () => {
  const rows = [
    { title: "성심당", metadata: { contentid: "1796079" } },
    { title: "일반 식당", metadata: { contentid: "999" } }
  ];

  assert.deepEqual(filterRowsByAllowedContentIds(rows, ["1796079"]), [rows[0]]);
});
