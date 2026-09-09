import assert from "node:assert/strict";
import test from "node:test";
import {
  formatChatAccessibilityText,
  formatChatDisplayText,
  getPublicChatSourceLabel,
  shouldReturnChatPlaceCards,
  uniqueChatSuggestions
} from "./presentation.ts";

test("chat display text removes raw markup and keeps readable sentence breaks", () => {
  assert.equal(
    formatChatDisplayText(
      "이동경로 폭 넓음<br/>문화시설 특성상 휠체어 이용 쉬움.<br>내부 턱 없음&nbsp;"
    ),
    "이동경로 폭 넓음\n문화시설 특성상 휠체어 이용 쉬움.\n내부 턱 없음"
  );
});

test("accessibility source prose becomes readable visitor guidance", () => {
  assert.equal(
    formatChatAccessibilityText(
      "문화시설 부지 넓음. 이동경로 폭 넓음<br/>내부 턱 없음.<br/>보조견 동반가능_시각장애인 편의시설"
    ),
    "문화시설 부지가 넓어요. 이동 경로가 넓어요\n내부에 턱이 없어요.\n보조견 동반 가능"
  );
});

test("internal source identifiers become public source names", () => {
  assert.equal(
    getPublicChatSourceLabel("tourapi:KorWithService2:2738037"),
    "한국관광공사 관광·무장애 여행정보"
  );
  assert.equal(getPublicChatSourceLabel("daejeon:public_toilet:station"), "대전시 공공데이터");
  assert.equal(getPublicChatSourceLabel("unknown-internal-source:123"), null);
});

test("follow-up suggestions remove duplicates and respect the visible limit", () => {
  assert.deepEqual(
    uniqueChatSuggestions(
      ["장소 자세히 알려줘", "장소 자세히 알려줘", "유모차 기준으로 다시 알려줘"],
      2
    ),
    ["장소 자세히 알려줘", "유모차 기준으로 다시 알려줘"]
  );
});

test("place cards stay visible for recommendation narrowing but not for detail-only follow-ups", () => {
  assert.equal(typeof shouldReturnChatPlaceCards, "function");
  assert.equal(
    shouldReturnChatPlaceCards({
      intent: "recommend_place",
      isFollowUp: true,
      hasPlaces: true
    }),
    true
  );
  assert.equal(
    shouldReturnChatPlaceCards({
      intent: "check_accessibility",
      isFollowUp: true,
      hasPlaces: true
    }),
    false
  );
  assert.equal(
    shouldReturnChatPlaceCards({
      intent: "check_accessibility",
      isFollowUp: false,
      hasPlaces: true
    }),
    true
  );
  assert.equal(
    shouldReturnChatPlaceCards({
      intent: "ask_info",
      isFollowUp: false,
      hasPlaces: true
    }),
    true
  );
  assert.equal(
    shouldReturnChatPlaceCards({
      intent: "ask_info",
      isFollowUp: true,
      hasPlaces: true
    }),
    false
  );
});
