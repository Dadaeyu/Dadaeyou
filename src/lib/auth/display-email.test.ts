import assert from "node:assert/strict";
import test from "node:test";
import { displayEmailFromAuthUser, isInternalAuthEmail } from "./display-email.ts";

test("네이버 Auth 전용 주소는 내부 이메일로 본다", () => {
  assert.equal(
    isInternalAuthEmail("naver_6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec@oauth.dadaeyu.invalid"),
    true
  );
  assert.equal(isInternalAuthEmail("naver_6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec"), true);
  assert.equal(isInternalAuthEmail("haetom@naver.com"), false);
});

test("마이페이지 이메일은 프로필 주소를 쓰고 내부 아이디는 숨긴다", () => {
  assert.equal(
    displayEmailFromAuthUser({
      email: "naver_6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec@oauth.dadaeyu.invalid",
      user_metadata: {
        naver_id: "6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec",
        profile_email: "haetom@naver.com"
      },
      app_metadata: { provider: "naver", providers: ["naver"] }
    }),
    "haetom@naver.com"
  );
  assert.equal(
    displayEmailFromAuthUser({
      email: "naver_6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec@oauth.dadaeyu.invalid",
      user_metadata: { naver_id: "6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec" },
      app_metadata: { provider: "naver", providers: ["naver"] }
    }),
    "네이버 로그인"
  );
  assert.equal(
    displayEmailFromAuthUser({
      email: "haetom@naver.com",
      app_metadata: { provider: "kakao", providers: ["kakao"] }
    }),
    "haetom@naver.com"
  );
});
