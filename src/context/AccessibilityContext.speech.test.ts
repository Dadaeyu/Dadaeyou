import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { JSDOM } from "jsdom";
import {
  findHoverSpeakableBlock,
  findSpeakableBlock,
  getSpeakableText,
  isA11yChrome,
  resolveSpeechTarget,
  shouldStopHoverSpeech
} from "../lib/accessibility.ts";

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

test("실제 호버 이벤트는 홈 텍스트와 상세정보를 읽고 끄면 읽지 않는다", () => {
  let effectSource = "";
  function findEffect(node: ts.Node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(parsed) === "useEffect" &&
      node.arguments[0]?.getText(parsed).includes("const handleMouseOver")
    )
      effectSource = node.arguments[0].getText(parsed);
    ts.forEachChild(node, findEffect);
  }
  findEffect(parsed);
  const dom = new JSDOM(
    `<main><div><span id="weather">대전 맑음</span></div><div role="dialog"><h4 id="detail">장애인 화장실 있음</h4><button aria-label="지도 보기"><svg aria-hidden="true"><path id="icon" /></svg></button></div><div id="empty"></div></main>`
  );
  const spoken: string[] = [];
  let cancelled = 0;
  const state = { readAloud: true };
  const effect = runInNewContext(ts.transpile(`(${effectSource})`), {
    state,
    document: dom.window.document,
    Element: dom.window.Element,
    window: { speechSynthesis: { cancel: () => cancelled++ } },
    activeUtterance: { current: null },
    lastBlockRef: { current: null },
    speakSourceRef: { current: "other" },
    setCanSpeakNext() {},
    findHoverSpeakableBlock,
    findSpeakableBlock,
    isA11yChrome,
    resolveSpeechTarget,
    shouldStopHoverSpeech,
    speakBlock(block: Element) {
      const text = getSpeakableText(block);
      if (text) spoken.push(text);
      return Boolean(text);
    }
  });
  const cleanup = effect();
  const hover = (id: string) =>
    dom.window.document
      .getElementById(id)!
      .dispatchEvent(new dom.window.MouseEvent("mouseover", { bubbles: true }));
  hover("weather");
  hover("detail");
  hover("icon");
  assert.deepEqual(spoken, ["대전 맑음", "장애인 화장실 있음", "지도 보기"]);
  dom.window.document.getElementById("icon")!.dispatchEvent(
    new dom.window.MouseEvent("mouseout", {
      bubbles: true,
      relatedTarget: dom.window.document.getElementById("empty")
    })
  );
  assert.equal(cancelled, 1);
  cleanup();
  state.readAloud = false;
  effect();
  hover("weather");
  assert.equal(spoken.length, 3);
  dom.window.close();
});
