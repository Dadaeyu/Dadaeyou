import assert from "node:assert/strict";
import test from "node:test";
import { mapBakeryKnowledgeRows } from "./bakeryKnowledge.ts";

test("기존 빵집 장소 데이터를 챗봇이 사용할 수 있는 음식점 근거로 변환한다", () => {
  const rows = mapBakeryKnowledgeRows(
    [
      {
        contentid: "1796079",
        title: "성심당",
        addr1: "대전광역시 중구 대종로480번길 15",
        mapx: "127.4272",
        mapy: "36.3275"
      }
    ],
    [
      {
        contentid: "1796079",
        overview: "대전을 대표하는 빵집",
        tel: "1588-8069",
        usetime: "08:00~22:00",
        restdate: null,
        usefee: null,
        parking: "인근 주차장 이용"
      }
    ],
    [
      {
        contentid: "1796079",
        parking: "장애인 주차구역 있음",
        route: "주 출입구까지 경사로 있음",
        publictransport: null,
        wheelchair: null,
        exit: null,
        elevator: null,
        restroom: null,
        stroller: null,
        lactationroom: null
      }
    ]
  );

  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "성심당");
  assert.equal(rows[0].category, "음식점");
  assert.equal(rows[0].metadata.contentid, "1796079");
  assert.equal(rows[0].metadata.address, "대전광역시 중구 대종로480번길 15");
  assert.equal(rows[0].metadata.operating_time, "08:00~22:00");
  assert.equal(rows[0].metadata.accessibility.parking, "장애인 주차구역 있음");
  assert.match(rows[0].content, /대전을 대표하는 빵집/u);
});

test("상세 정보가 없어도 장소 원본만으로 추천 후보를 만든다", () => {
  const rows = mapBakeryKnowledgeRows([
    {
      contentid: 2912871,
      title: "그린베이커리",
      addr1: null,
      mapx: 127.4,
      mapy: 36.3
    }
  ]);

  assert.equal(rows[0].metadata.contentid, "2912871");
  assert.match(rows[0].content, /그린베이커리/u);
});
