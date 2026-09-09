import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { User } from "@supabase/supabase-js";
import { isNaverOwnedAccount } from "./auth-kind.ts";
import {
  inferLinkedOAuthProvider,
  oauthEmailFromUser,
  oauthProfileFromUser
} from "./split-naver-oauth-helpers.ts";

test("카카오 계정 이메일이 @naver.com 이어도 네이버 소셜 계정이 아니다", () => {
  assert.equal(
    isNaverOwnedAccount({
      email: "haetom@naver.com",
      identities: [{ provider: "kakao" }],
      app_metadata: { provider: "kakao", providers: ["kakao"] }
    }),
    false
  );
});

test("카카오 identity에서 @naver.com 이메일을 카카오 로그인 주소로 읽는다", () => {
  const user = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "haetom@naver.com",
    identities: [
      {
        provider: "kakao",
        identity_data: { email: "haetom@naver.com", nickname: "해토" }
      }
    ]
  } as unknown as User;

  assert.equal(oauthEmailFromUser(user, "kakao"), "haetom@naver.com");
  assert.equal(oauthProfileFromUser(user, "kakao").nickname, "해토");
  assert.equal(inferLinkedOAuthProvider(user, "kakao"), "kakao");
});

const callbackSource = await readFile(
  new URL("../../app/auth/callback/route.ts", import.meta.url),
  "utf8"
);

test("카카오-네이버 이메일 충돌 시 다시 누르라는 안내만 반복하지 않고 새 세션을 연다", () => {
  assert.match(callbackSource, /completeOAuthAsNewUserFromNaverCollision/u);
  assert.match(callbackSource, /if \(splitUser\)/u);
});
