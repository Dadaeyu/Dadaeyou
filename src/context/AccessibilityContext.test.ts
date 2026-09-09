import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./AccessibilityContext.tsx", import.meta.url), "utf8");

test("화면 설정 계정 저장 실패는 안내하고 다시 저장할 수 있다", () => {
  assert.match(source, /setAccountSaveStatus\(["']error["']\)/u);
  assert.match(source, /retryAccountSave/u);
  assert.match(source, /addEventListener\(["']online["']/u);
  assert.match(source, /readPendingAccessibilityAccountSave/u);
  assert.match(source, /markAccessibilityAccountSavePending/u);
  assert.doesNotMatch(source, /console\.warn\(/u);
});
