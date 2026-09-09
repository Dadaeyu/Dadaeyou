import assert from "node:assert/strict";
import test from "node:test";
import { isGeneratedNickname, suggestedNicknameFromAuthUser } from "./display-nickname.ts";

test("네이버 Auth 전용 이메일의 로컬파트는 닉네임으로 쓰지 않는다", () => {
  assert.equal(isGeneratedNickname("naver_6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec"), true);
  assert.equal(isGeneratedNickname("user_00c9be04"), true);
  assert.equal(isGeneratedNickname("deleted_ed8a020e70a2"), true);
  assert.equal(isGeneratedNickname("해토"), false);
  assert.equal(isGeneratedNickname("naver_fan"), false);
});

test("온보딩 닉네임은 프로필 이름만 쓰고 이메일은 쓰지 않는다", () => {
  assert.equal(
    suggestedNicknameFromAuthUser({
      email: "naver_6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec@oauth.dadaeyu.invalid",
      user_metadata: { naver_id: "6qf9fwu0vbasin82d1j23bqirepsendcajluzmsuuec" }
    }),
    ""
  );
  assert.equal(
    suggestedNicknameFromAuthUser({
      email: "naver_abc@oauth.dadaeyu.invalid",
      user_metadata: { nickname: "다대유", name: "홍길동" }
    }),
    "다대유"
  );
  assert.equal(
    suggestedNicknameFromAuthUser({
      email: "haetom@naver.com",
      user_metadata: { name: "해토" }
    }),
    "해토"
  );
});
