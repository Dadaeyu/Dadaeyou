import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = readFileSync(new URL("./AccessibilityContext.tsx", import.meta.url), "utf8");
const parsed = ts.createSourceFile(
  "context.tsx",
  source,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX
);
let speakSource = "";
function visit(node: ts.Node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(parsed) === "speak") {
    speakSource = node.initializer!.getText(parsed);
  }
  ts.forEachChild(node, visit);
}
visit(parsed);

function setup() {
  const spoken: SpeechSynthesisUtterance[] = [];
  const speak = runInNewContext(ts.transpile(`const speak = ${speakSource}; speak;`), {
    useCallback: (callback: unknown) => callback,
    activeUtterance: { current: null },
    window: {
      speechSynthesis: {
        cancel() {},
        speak(u: SpeechSynthesisUtterance) {
          spoken.push(u);
        }
      }
    },
    SpeechSynthesisUtterance: class {
      text: string;
      constructor(text: string) {
        this.text = text;
      }
    }
  }) as (text: string, force?: boolean) => void;
  return { speak, spoken };
}

test("읽는 중에는 중복을 막고 완료 후 같은 안내를 다시 읽는다", () => {
  const { speak, spoken } = setup();
  speak("지도 보기");
  speak("지도 보기");
  assert.equal(spoken.length, 1);
  spoken[0].onend?.call(spoken[0], {} as SpeechSynthesisEvent);
  speak("지도 보기");
  assert.equal(spoken.length, 2);
});

test("음성 오류 후에도 같은 안내를 재시도할 수 있다", () => {
  const { speak, spoken } = setup();
  speak("다유에게 묻기");
  spoken[0].onerror?.call(spoken[0], {} as SpeechSynthesisErrorEvent);
  speak("다유에게 묻기");
  assert.equal(spoken.length, 2);
});

test("이전 음성의 늦은 완료가 현재 음성의 중복 방지를 해제하지 않는다", () => {
  const { speak, spoken } = setup();
  speak("지도 보기");
  speak("다유에게 묻기");
  spoken[0].onend?.call(spoken[0], {} as SpeechSynthesisEvent);
  speak("다유에게 묻기");
  assert.equal(spoken.length, 2);
});

test("다음 내용 읽기는 같은 문구도 강제로 읽고 이전 완료 이벤트는 무시한다", () => {
  const { speak, spoken } = setup();
  speak("같은 내용");
  speak("같은 내용", true);
  assert.equal(spoken.length, 2);
  spoken[0].onend?.call(spoken[0], {} as SpeechSynthesisEvent);
  speak("같은 내용");
  assert.equal(spoken.length, 2);
  spoken[1].onend?.call(spoken[1], {} as SpeechSynthesisEvent);
  speak("같은 내용");
  assert.equal(spoken.length, 3);
});
