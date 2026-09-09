import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./page.tsx", import.meta.url), "utf8");

test("온보딩은 생성된 네이버 id 닉네임을 입력칸에 넣지 않는다", () => {
  assert.match(source, /isGeneratedNickname/u);
  assert.match(source, /suggestedNicknameFromAuthUser/u);
});
