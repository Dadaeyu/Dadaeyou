import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AccountSection.tsx", import.meta.url), "utf8");

test("계정 화면은 Auth 전용 네이버 이메일을 그대로 보여 주지 않는다", () => {
  assert.match(source, /displayEmailFromAuthUser/u);
  assert.doesNotMatch(source, /\{user\?\.email \?\? "—"\}/u);
});
