import assert from "node:assert/strict";
import test from "node:test";
import { hasEmailPasswordAuth, isNaverOwnedAccount, isOAuthUser } from "./auth-kind.ts";

test("카카오·구글·네이버 계정은 이메일이 있어도 비밀번호 인증이 아니다", () => {
  for (const provider of ["kakao", "google", "naver"] as const) {
    assert.equal(
      hasEmailPasswordAuth({
        email: "user@example.com",
        identities: [{ provider }],
        app_metadata: { provider, providers: [provider] }
      }),
      false
    );
    assert.equal(
      isOAuthUser({
        email: "user@example.com",
        app_metadata: { provider, providers: [provider] }
      }),
      true
    );
  }
});

test("identities가 비어 있어도 provider가 소셜이면 비밀번호를 요구하지 않는다", () => {
  assert.equal(
    hasEmailPasswordAuth({
      email: "user@example.com",
      identities: [],
      app_metadata: { provider: "kakao", providers: ["kakao"] }
    }),
    false
  );
});

test("이메일만 있고 identities/providers가 없으면 소셜일 수 있어 비밀번호 계정으로 보지 않는다", () => {
  assert.equal(hasEmailPasswordAuth({ email: "user@example.com" }), false);
  assert.equal(hasEmailPasswordAuth({ email: "user@example.com", app_metadata: {} }), false);
});

test("이메일 비밀번호 가입만 비밀번호 인증으로 본다", () => {
  assert.equal(
    hasEmailPasswordAuth({
      email: "user@example.com",
      identities: [{ provider: "email" }],
      app_metadata: { provider: "email", providers: ["email"] }
    }),
    true
  );
  assert.equal(
    isOAuthUser({
      email: "user@example.com",
      identities: [{ provider: "email" }],
      app_metadata: { provider: "email", providers: ["email"] }
    }),
    false
  );
});

test("이메일과 소셜이 함께 있으면 소셜 계정으로 보고 비밀번호를 요구하지 않는다", () => {
  assert.equal(
    hasEmailPasswordAuth({
      email: "user@example.com",
      identities: [{ provider: "email" }, { provider: "kakao" }],
      app_metadata: { provider: "kakao", providers: ["email", "kakao"] }
    }),
    false
  );
});

test("카카오 전용 계정은 네이버 원계정으로 보지 않는다", () => {
  assert.equal(
    isNaverOwnedAccount({
      email: "user@example.com",
      identities: [{ provider: "kakao" }],
      app_metadata: { provider: "kakao", providers: ["kakao"] }
    }),
    false
  );
  assert.equal(
    isNaverOwnedAccount({
      email: "user@example.com",
      identities: [{ provider: "kakao" }],
      app_metadata: { provider: "kakao", providers: ["kakao", "naver"] }
    }),
    false
  );
  assert.equal(
    isNaverOwnedAccount({
      email: "user@example.com",
      user_metadata: { naver_id: "12345678" },
      app_metadata: { provider: "kakao", providers: ["kakao", "naver"] }
    }),
    true
  );
  assert.equal(
    isNaverOwnedAccount({
      email: "haetom@naver.com",
      identities: [{ provider: "kakao" }],
      app_metadata: { provider: "kakao", providers: ["kakao"] }
    }),
    false
  );
});

test("네이버는 매직링크 때문에 identities가 email이어도 비밀번호를 요구하지 않는다", () => {
  assert.equal(
    hasEmailPasswordAuth({
      email: "naveruser@example.com",
      identities: [{ provider: "email" }],
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: { naver_id: "12345678" }
    }),
    false
  );
  assert.equal(
    hasEmailPasswordAuth({
      email: "naver_abc@oauth.dadaeyu.invalid",
      identities: [{ provider: "email" }],
      app_metadata: { provider: "email", providers: ["email"] }
    }),
    false
  );
});
