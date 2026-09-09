import assert from "node:assert/strict";
import test from "node:test";
import { addressDocumentToKeyword, mergeKakaoLocalDocuments } from "./kakao-local-merge.ts";

test("주소 검색 결과는 키워드 문서와 같은 형태로 맞춘다", () => {
  const mapped = addressDocumentToKeyword({
    x: "127.38",
    y: "36.35",
    address_name: "대전 서구 둔산동 1",
    road_address: { address_name: "대전 서구 둔산로 100", building_name: "대전시청" }
  });
  assert.equal(mapped.place_name, "대전시청");
  assert.equal(mapped.road_address_name, "대전 서구 둔산로 100");
  assert.equal(mapped.category_name, "주소");
});

test("키워드와 주소 결과를 좌표 기준으로 합친다", () => {
  const merged = mergeKakaoLocalDocuments(
    [
      {
        id: "1",
        place_name: "대전역",
        x: "127.43",
        y: "36.33",
        address_name: "대전 동구"
      }
    ],
    [
      {
        x: "127.43",
        y: "36.33",
        address_name: "같은 좌표"
      },
      {
        x: "127.38",
        y: "36.35",
        road_address: { address_name: "대전 서구 둔산로 100" }
      }
    ],
    15
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0]?.place_name, "대전역");
  assert.equal(merged[1]?.place_name, "대전 서구 둔산로 100");
});
