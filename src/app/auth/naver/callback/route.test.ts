import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./route.ts", import.meta.url), "utf8");

test("네이버 콜백은 탈퇴 계정을 social_rejoin 루프로 보내지 않는다", () => {
  assert.doesNotMatch(source, /error=social_rejoin/u);
  assert.match(source, /retireWithdrawnNaverUser/u);
  assert.match(source, /establishSessionForEmail\(email,\s*sessionMeta\)/u);
});

test("네이버 콜백은 Auth 전용 이메일을 닉네임으로 넣지 않는다", () => {
  assert.match(source, /humanProfileName/u);
  assert.match(source, /isGeneratedNickname/u);
});
