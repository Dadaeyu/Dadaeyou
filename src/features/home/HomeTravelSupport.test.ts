import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const homeSource = readFileSync(
  new URL("../../components/screens/Home.tsx", import.meta.url),
  "utf8"
);
const easyHomeSource = readFileSync(new URL("./EasyHome.tsx", import.meta.url), "utf8");
const travelSupportSource = readFileSync(
  new URL("./HomeTravelSupport.tsx", import.meta.url),
  "utf8"
);

test("홈 화면은 필요한 도움 추천 뒤에 대전 이동지원 서비스 안내를 노출한다", () => {
  assert.match(homeSource, /HomeTravelSupport/u);
  assert.match(homeSource, /<HomeTravelSupport\s*\/>/u);
});

test("쉬운 화면은 큰 버튼형 대전 이동지원 서비스 안내를 노출한다", () => {
  assert.match(easyHomeSource, /HomeTravelSupport/u);
  assert.match(easyHomeSource, /<HomeTravelSupport\s+easyMode\s*\/>/u);
});

test("대전 이동지원 서비스 안내는 사랑나눔콜 전화와 공식 사이트로 연결한다", () => {
  assert.match(travelSupportSource, /사랑나눔콜/u);
  assert.match(travelSupportSource, /대중교통 이용이 어려운 교통약자/u);
  assert.match(travelSupportSource, /1588-1668/u);
  assert.match(travelSupportSource, /tel:15881668/u);
  assert.match(travelSupportSource, /https:\/\/www\.djcall\.or\.kr\//u);
  assert.match(travelSupportSource, /target="_blank"/u);
  assert.match(travelSupportSource, /rel="noreferrer"/u);
  assert.match(travelSupportSource, /aria-label="사랑나눔콜 1588-1668로 전화하기"/u);
  assert.match(
    travelSupportSource,
    /aria-label="대전교통약자이동지원센터 공식 안내 새 창에서 보기"/u
  );
});
