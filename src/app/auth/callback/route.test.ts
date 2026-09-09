import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("세션 교환 실패를 무조건 social_rejoin으로 안내하지 않는다", () => {
  assert.match(source, /isBannedSessionError\(sessionError\)/u);
  assert.match(source, /auth_callback_failed/u);
  assert.doesNotMatch(source, /if \(sessionError\) \{[\s\S]*login\?error=social_rejoin&reason=/u);
});

test("카카오가 네이버 계정 이메일과 겹치면 같은 요청에서 카카오 세션을 연다", () => {
  assert.match(source, /isNaverOwnedAccount\(authUser\)/u);
  assert.match(source, /completeOAuthAsNewUserFromNaverCollision/u);
  assert.match(source, /if \(splitUser\)/u);
});
