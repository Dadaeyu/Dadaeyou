import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import {
  A11Y_ACCOUNT_PENDING_KEY,
  clearAccessibilityAccountSavePending,
  getAccessibilityAccountSaveHint,
  markAccessibilityAccountSavePending,
  readPendingAccessibilityAccountSave
} from "./accessibility-account-save.ts";

const mutableGlobals = globalThis as unknown as {
  window?: { localStorage: Storage };
};

afterEach(() => {
  delete mutableGlobals.window;
});

function installStorage() {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
    clear: () => values.clear(),
    key: () => null,
    get length() {
      return values.size;
    }
  } as Storage;
  mutableGlobals.window = { localStorage: storage };
  return values;
}

test("로그인 화면 설정은 계정 저장 실패와 재시도를 안내한다", () => {
  const hint = getAccessibilityAccountSaveHint("error", true);
  assert.equal(hint.tone, "error");
  assert.equal(hint.showRetry, true);
  assert.match(hint.text, /다른 기기에는 반영되지 않습니다/u);
});

test("계정 저장 성공·진행 중에는 재시도를 숨긴다", () => {
  assert.deepEqual(getAccessibilityAccountSaveHint("saving", true), {
    text: "계정에 저장하는 중…",
    tone: "info",
    showRetry: false
  });
  assert.deepEqual(getAccessibilityAccountSaveHint("saved", true), {
    text: "계정에 저장되었습니다.",
    tone: "success",
    showRetry: false
  });
  assert.equal(getAccessibilityAccountSaveHint("idle", true).showRetry, false);
});

test("비로그인 변경은 이 기기에만 저장된다고 안내한다", () => {
  const hint = getAccessibilityAccountSaveHint("idle", false);
  assert.equal(hint.showRetry, false);
  assert.match(hint.text, /이 기기에만 저장/u);
});

test("계정 저장 대기는 같은 사용자만 복원하고 다른 사용자에게는 넘기지 않는다", () => {
  const values = installStorage();
  const pendingState = {
    darkMode: false,
    highContrast: true,
    fontScale: 130,
    readAloud: false,
    easyMode: false
  };

  markAccessibilityAccountSavePending("user-a", pendingState);
  assert.ok(values.get(A11Y_ACCOUNT_PENDING_KEY));
  assert.deepEqual(readPendingAccessibilityAccountSave("user-a"), pendingState);
  assert.equal(readPendingAccessibilityAccountSave("user-b"), null);

  clearAccessibilityAccountSavePending();
  assert.equal(readPendingAccessibilityAccountSave("user-a"), null);
});
