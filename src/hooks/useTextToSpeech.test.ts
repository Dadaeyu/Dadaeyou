import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

function setup() {
  const statuses: string[] = [];
  let resolveResponse!: (response: unknown) => void;
  const response = new Promise((resolve) => {
    resolveResponse = resolve;
  });
  const audios: { onended?: () => void; onerror?: () => void }[] = [];
  const exports: Record<
    string,
    () => {
      speak: (options: { text: string; onError?: (e: Error) => void }) => Promise<void>;
      stop: () => void;
    }
  > = {};
  const source = readFileSync(new URL("./useTextToSpeech.ts", import.meta.url), "utf8");
  runInNewContext(
    ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
    }).outputText,
    {
      exports,
      require: () => ({
        useCallback: (fn: unknown) => fn,
        useRef: (current: unknown) => ({ current }),
        useEffect() {},
        useState: (initial: unknown) => [
          initial,
          (value: string) => {
            if (typeof value === "string") statuses.push(value);
          }
        ]
      }),
      Audio: class {
        src = "";
        onended?: () => void;
        onerror?: () => void;
        constructor() {
          audios.push(this);
        }
        play() {
          return Promise.resolve();
        }
        pause() {}
        load() {}
        removeAttribute() {}
      },
      AbortController,
      URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
      fetch: () => response
    }
  );
  return {
    hook: exports.useTextToSpeech(),
    statuses,
    resolveResponse,
    getAudio: () => audios.at(-1)!
  };
}

test("음성 응답 대기와 실제 재생, 종료 상태를 구분한다", async () => {
  const { hook, statuses, resolveResponse, getAudio } = setup();
  const pending = hook.speak({ text: "긴 답변" });
  await Promise.resolve();
  assert.equal(statuses.at(-1), "loading");
  resolveResponse({ ok: true, blob: async () => ({}) });
  await pending;
  assert.equal(statuses.at(-1), "playing");
  getAudio().onended?.();
  assert.equal(statuses.at(-1), "idle");
});

test("생성 중 취소한 요청의 늦은 응답은 재생하지 않는다", async () => {
  const { hook, statuses, resolveResponse } = setup();
  const pending = hook.speak({ text: "취소할 답변" });
  await Promise.resolve();
  hook.stop();
  resolveResponse({ ok: true, blob: async () => ({}) });
  await pending;
  assert.equal(statuses.at(-1), "idle");
  assert.equal(statuses.includes("playing"), false);
});

test("서버 오류는 원래 안내를 전달하고 대기 상태를 끝낸다", async () => {
  const { hook, statuses, resolveResponse } = setup();
  let message = "";
  const pending = hook.speak({
    text: "답변",
    onError: (e) => {
      message = e.message;
    }
  });
  resolveResponse({ ok: false, json: async () => ({ message: "음성 요청이 많아요." }) });
  await pending;
  assert.equal(message, "음성 요청이 많아요.");
  assert.equal(statuses.at(-1), "idle");
});
