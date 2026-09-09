import assert from "node:assert/strict";
import test from "node:test";
import { resolveHomeImageDelivery } from "./homeImage.ts";

test("허용된 관광공사 이미지는 Next 이미지 최적화가 원격 원본을 직접 가져온다", () => {
  assert.deepEqual(
    resolveHomeImageDelivery("https://tong.visitkorea.or.kr/cms/example.jpg?width=1200"),
    {
      src: "https://tong.visitkorea.or.kr/cms/example.jpg?width=1200",
      unoptimized: false
    }
  );
});

test("허용되지 않은 원격 이미지는 기존 보안 프록시를 거쳐 실패 대체 처리를 유지한다", () => {
  assert.deepEqual(resolveHomeImageDelivery("https://example.com/place.jpg"), {
    src: "/api/home/image?src=https%3A%2F%2Fexample.com%2Fplace.jpg",
    unoptimized: false
  });
  assert.deepEqual(resolveHomeImageDelivery("https://tong.visitkorea.or.kr:8443/place.jpg"), {
    src: "/api/home/image?src=https%3A%2F%2Ftong.visitkorea.or.kr%3A8443%2Fplace.jpg",
    unoptimized: false
  });
});

test("로컬 이미지는 최적화하고 data/blob 이미지는 원본 표시를 유지한다", () => {
  assert.deepEqual(resolveHomeImageDelivery("/images/place.jpg"), {
    src: "/images/place.jpg",
    unoptimized: false
  });
  assert.deepEqual(resolveHomeImageDelivery("data:image/png;base64,AA=="), {
    src: "data:image/png;base64,AA==",
    unoptimized: true
  });
  assert.deepEqual(resolveHomeImageDelivery("blob:https://dadaeyu.vercel.app/example"), {
    src: "blob:https://dadaeyu.vercel.app/example",
    unoptimized: true
  });
});
