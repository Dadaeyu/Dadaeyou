import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { naverAuthEmail, resolveNaverAuthEmail } from "./naver-oauth.ts";

test("네이버 로그인 URL은 재인증을 강제한다", async () => {
  const source = await readFile(new URL("./naver-oauth.ts", import.meta.url), "utf8");
  assert.match(source, /auth_type:\s*["']reauthenticate["']/u);
});

test("네이버 Auth 이메일은 프로필 이메일이 있어도 카카오와 겹치지 않는 전용 주소를 쓴다", () => {
  assert.equal(naverAuthEmail("12345678"), "naver_12345678@oauth.dadaeyu.invalid");
  assert.equal(
    resolveNaverAuthEmail("12345678", "user@example.com"),
    "naver_12345678@oauth.dadaeyu.invalid"
  );
});

test("네이버 세션은 같은 이메일의 카카오 계정을 재사용하지 않는다", async () => {
  const source = await readFile(new URL("./naver-session.ts", import.meta.url), "utf8");
  assert.match(source, /isNaverOAuthUser\(byProfile\)/u);
  assert.match(source, /isolateNaverAuthEmail/u);
});

test("탈퇴한 네이버 계정은 안내만 반복하지 않고 같은 요청에서 새 세션을 연다", async () => {
  const source = await readFile(new URL("./naver-session.ts", import.meta.url), "utf8");
  assert.match(source, /retireWithdrawnNaverUser/u);
  assert.match(source, /isUnusableNaverAuthUser/u);
  assert.doesNotMatch(source, /throw new WithdrawnNaverAccountError/u);
  assert.doesNotMatch(source, /error=social_rejoin/u);
});
