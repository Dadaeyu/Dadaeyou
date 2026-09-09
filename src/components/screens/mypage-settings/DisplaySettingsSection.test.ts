import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("./DisplaySettingsSection.tsx", import.meta.url), "utf8");

test("화면 설정은 계정 저장 실패 안내와 다시 저장을 보여 준다", () => {
  assert.match(source, /AccessibilityAccountSaveHint/u);
  assert.match(source, /retryAccountSave/u);
  assert.match(source, /accountSaveStatus/u);
  assert.doesNotMatch(source, /변경 내용은 바로 적용되며 계정에 저장됩니다\./u);
});
