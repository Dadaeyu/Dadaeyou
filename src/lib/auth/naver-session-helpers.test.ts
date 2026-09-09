import assert from "node:assert/strict";
import test from "node:test";
import { isUnusableNaverAuthUser, retiredNaverIdMarker } from "./naver-session-helpers.ts";

test("탈퇴 마커는 실제 네이버 id와 겹치지 않는다", () => {
  const userId = "ed8a020e-70a2-4d10-9962-f05f6011cdb9";
  const marker = retiredNaverIdMarker(userId);
  assert.equal(marker, "withdrawn:ed8a020e70a24d109962f05f6011cdb9");
  assert.equal(marker.startsWith("withdrawn:"), true);
  assert.notEqual(marker, "6qF9fWU0vBasiN82d1j23bqirepSeNdCajluZMsUUEc");
});

test("탈퇴·차단 계정은 네이버 재로그인에 쓰지 않는다", () => {
  assert.equal(
    isUnusableNaverAuthUser({ email: "naver_1@oauth.dadaeyu.invalid" }, "withdrawn"),
    true
  );
  assert.equal(
    isUnusableNaverAuthUser({
      email: "deleted_abc@withdrawn.local",
      user_metadata: { naver_id: "abc" }
    }),
    true
  );
  assert.equal(
    isUnusableNaverAuthUser({
      email: "naver_1@oauth.dadaeyu.invalid",
      user_metadata: { withdrawn: true, naver_id: "abc" }
    }),
    true
  );
  assert.equal(
    isUnusableNaverAuthUser({
      email: "naver_1@oauth.dadaeyu.invalid",
      banned_until: "2126-07-27T16:07:40.206978Z",
      user_metadata: { naver_id: "abc" }
    }),
    true
  );
  assert.equal(
    isUnusableNaverAuthUser({
      email: "naver_1@oauth.dadaeyu.invalid",
      user_metadata: { naver_id: retiredNaverIdMarker("ed8a020e-70a2-4d10-9962-f05f6011cdb9") }
    }),
    true
  );
  assert.equal(
    isUnusableNaverAuthUser({
      email: "naver_1@oauth.dadaeyu.invalid",
      user_metadata: { naver_id: "abc" }
    }),
    false
  );
});
