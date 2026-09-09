import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./ensure-member.ts", import.meta.url), "utf8");

test("회원 닉네임은 Auth 이메일 로컬파트가 아니라 프로필 이름을 쓴다", () => {
  assert.match(source, /suggestedNicknameFromAuthUser/u);
  assert.doesNotMatch(source, /email\?\.split\(["']@["']\)/u);
});
