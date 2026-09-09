import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

test("구글은 계정 선택, 카카오는 재로그인을 요청한다", async () => {
  const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(source, /prompt:\s*["']select_account["']/u);
  assert.match(source, /prompt:\s*["']login["']/u);
});

test("소셜 로그인 전에 기존 세션을 끊어 다른 제공자에 붙지 않게 한다", async () => {
  const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");
  assert.match(source, /await supabase\.auth\.signOut\(\)/u);
  assert.match(source, /redirectTo\.searchParams\.set\(["']provider["'],\s*provider\)/u);
});
