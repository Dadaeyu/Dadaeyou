import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test, { afterEach } from "node:test";
import { JSDOM } from "jsdom";
import {
  A11Y_STORAGE_KEY,
  applyAccessibilityState,
  DEFAULT_A11Y_STATE,
  loadAccessibilityState,
  mergeAccessibilityPreferences,
  saveAccessibilityState,
  findHoverSpeakableBlock,
  findNextSpeakableBlock,
  findSpeakableBlock,
  getSpeakableText,
  resolveSpeechTarget,
  shouldStopHoverSpeech,
  type AccessibilityState
} from "./accessibility.ts";

type TestStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  clear: () => void;
};

type TestRoot = {
  classes: Set<string>;
  styleValues: Map<string, string>;
  classList: {
    add: (name: string) => void;
    toggle: (name: string, force?: boolean) => void;
    contains: (name: string) => boolean;
  };
  style: {
    setProperty: (name: string, value: string) => void;
    getPropertyValue: (name: string) => string;
  };
};

const mutableGlobals = globalThis as unknown as {
  localStorage?: TestStorage;
  window?: { localStorage: TestStorage };
  document?: {
    documentElement: TestRoot;
    getElementById?: (id: string) => { textContent?: string | null } | null;
  };
};

function installLocalStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const storage: TestStorage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => {
      values.set(key, value);
    },
    clear: () => values.clear()
  };

  mutableGlobals.localStorage = storage;
  mutableGlobals.window = { localStorage: storage };
  return values;
}

function installDocument() {
  const root: TestRoot = {
    classes: new Set<string>(),
    styleValues: new Map<string, string>(),
    classList: {
      add(name) {
        root.classes.add(name);
      },
      toggle(name, force) {
        if (force) {
          root.classes.add(name);
        } else {
          root.classes.delete(name);
        }
      },
      contains(name) {
        return root.classes.has(name);
      }
    },
    style: {
      setProperty(name, value) {
        root.styleValues.set(name, value);
      },
      getPropertyValue(name) {
        return root.styleValues.get(name) ?? "";
      }
    }
  };

  mutableGlobals.document = { documentElement: root };
  return root;
}

afterEach(() => {
  delete mutableGlobals.localStorage;
  delete mutableGlobals.window;
  delete mutableGlobals.document;
});

test("이전 저장 데이터에 easyMode가 없으면 false로 읽는다", () => {
  installLocalStorage({
    [A11Y_STORAGE_KEY]: JSON.stringify({
      darkMode: true,
      highContrast: true,
      fontScale: 130,
      readAloud: true
    })
  });

  const state = loadAccessibilityState();

  assert.equal(state.easyMode, false);
  assert.equal(state.darkMode, true);
  assert.equal(state.highContrast, true);
  assert.equal(state.fontScale, 130);
  assert.equal(state.readAloud, true);
});

test("쉬운 화면은 폰트 배율과 독립적으로 저장되고 DOM 클래스에 적용된다", () => {
  const stored = installLocalStorage();
  const root = installDocument();
  const easyModeState: AccessibilityState = {
    ...DEFAULT_A11Y_STATE,
    easyMode: true,
    fontScale: 100
  };

  saveAccessibilityState(easyModeState);
  applyAccessibilityState(easyModeState);

  assert.equal(JSON.parse(stored.get(A11Y_STORAGE_KEY) ?? "{}").easyMode, true);
  assert.equal(root.classList.contains("easy-mode"), true);
  assert.equal(root.classList.contains("font-scale-large"), false);
  assert.equal(root.style.getPropertyValue("--a11y-scale"), "1");

  applyAccessibilityState({ ...easyModeState, easyMode: false, fontScale: 160 });

  assert.equal(root.classList.contains("easy-mode"), false);
  assert.equal(root.classList.contains("font-scale-large"), true);
  assert.equal(root.style.getPropertyValue("--a11y-scale"), "1.6");
});

test("DB preferences 동기화는 현재 로컬 easyMode 값을 보존한다", () => {
  const fromDb = mergeAccessibilityPreferences(
    {
      dark_mode: true,
      high_contrast: false,
      font_scale: 150,
      read_aloud: true
    },
    { ...DEFAULT_A11Y_STATE, easyMode: true, fontScale: 120 }
  );

  assert.deepEqual(fromDb, {
    darkMode: true,
    highContrast: false,
    fontScale: 150,
    readAloud: true,
    easyMode: true
  });
});

test("pre-hydration script applies the easy-mode root class from stored state", () => {
  const layout = readFileSync(path.join(process.cwd(), "src", "app", "layout.tsx"), "utf8");

  assert.match(layout, /if \(s\.easyMode\) el\.classList\.add\("easy-mode"\);/u);
});

test("입력 요소는 현재 값 또는 placeholder를 읽을 수 있는 텍스트로 반환한다", () => {
  const inputWithValue = {
    getAttribute(name: string) {
      if (name === "aria-label") return "질문 입력";
      return null;
    },
    tagName: "INPUT",
    textContent: "",
    value: "유모차 가능한 곳 알려줘",
    placeholder: "메시지를 입력하세요"
  } as unknown as Element;

  assert.equal(getSpeakableText(inputWithValue), "질문 입력, 유모차 가능한 곳 알려줘");

  const textareaWithPlaceholder = {
    getAttribute(name: string) {
      if (name === "aria-label") return "댓글 입력";
      return null;
    },
    tagName: "TEXTAREA",
    textContent: "",
    value: "",
    placeholder: "댓글을 입력하세요"
  } as unknown as Element;

  assert.equal(getSpeakableText(textareaWithPlaceholder), "댓글 입력, 댓글을 입력하세요");
});

test("비밀번호와 선택 입력은 민감하거나 무의미한 value를 읽지 않는다", () => {
  const passwordInput = {
    getAttribute(name: string) {
      if (name === "aria-label") return "비밀번호";
      if (name === "type") return "password";
      return null;
    },
    tagName: "INPUT",
    textContent: "",
    type: "password",
    value: "secret-password",
    placeholder: "비밀번호를 입력하세요"
  } as unknown as Element;

  assert.equal(getSpeakableText(passwordInput), "비밀번호, 비밀번호를 입력하세요");

  const checkbox = {
    getAttribute(name: string) {
      if (name === "aria-label") return "답변 자동 읽기";
      if (name === "type") return "checkbox";
      return null;
    },
    tagName: "INPUT",
    textContent: "",
    type: "checkbox",
    value: "on"
  } as unknown as Element;

  assert.equal(getSpeakableText(checkbox), "답변 자동 읽기");
});

test("select는 옵션 전체가 아니라 현재 선택된 값만 읽는다", () => {
  // 실제 버그 재현: 시간 select(0시~23시 24개 option)에 마우스를 올리면 element.textContent가
  // 그대로 쓰여 24개 옵션이 전부 이어 읽혔다. 실제로 의미 있는 건 선택된 값 하나뿐이다.
  const dom = new JSDOM(
    `<select aria-label="시작 시각">
       <option value="8">8시</option>
       <option value="9" selected>9시</option>
       <option value="10">10시</option>
     </select>`
  );
  const select = dom.window.document.querySelector("select");
  if (!select) throw new Error("test fixture missing <select>");

  const text = getSpeakableText(select);

  assert.equal(text, "시작 시각, 9시");
  assert.ok(!text?.includes("8시"));
  assert.ok(!text?.includes("10시"));
});

test("aria-labelledby가 있으면 제목과 본문을 함께 읽는다", () => {
  const title = { textContent: "방문 정보" };
  const section = {
    getAttribute(name: string) {
      if (name === "aria-labelledby") return "visit-title";
      if (name === "data-speak-text") return null;
      if (name === "aria-label") return null;
      if (name === "role") return null;
      return null;
    },
    hasAttribute(name: string) {
      return name === "data-speakable";
    },
    tagName: "SECTION",
    textContent: "방문 정보 운영시간 09:00-18:00 휴무일 매주 월요일"
  } as unknown as Element;

  mutableGlobals.document = {
    documentElement: installDocument(),
    getElementById(id: string) {
      return id === "visit-title" ? title : null;
    }
  };

  assert.equal(getSpeakableText(section), "방문 정보. 운영시간 09:00-18:00 휴무일 매주 월요일");
});

test("카드 안 aria-hidden 숫자는 제목 끝자리와 붙지 않고, aria-label로 분리돼 읽힌다", () => {
  // 실제 버그 재현: 코스 제목이 "코스 2-1"처럼 숫자로 끝나고 바로 옆에 별점 배지가 있으면,
  // element.textContent를 그대로 읽던 예전 방식은 "코스 2-1" + "4.5"가 붙어
  // "코스2 마이너스 14.5"처럼 읽혔다. aria-hidden 하위 트리를 빼고 aria-label로 대체해야 한다.
  const dom = new JSDOM(
    `<a href="/course/1">
       <h3>코스 2-1</h3>
       <div aria-label="별점 4.5점">
         <svg aria-hidden="true"></svg>
         <span aria-hidden="true">4.5</span>
       </div>
       <div aria-label="좋아요 12개">
         <svg aria-hidden="true"></svg>
         <span aria-hidden="true">12</span>
       </div>
     </a>`
  );
  const link = dom.window.document.querySelector("a");
  if (!link) throw new Error("test fixture missing <a>");

  const text = getSpeakableText(link);

  assert.ok(text?.includes("코스 2-1"));
  assert.ok(text?.includes("별점 4.5점"));
  assert.ok(text?.includes("좋아요 12개"));
  // 숫자 "4.5"와 "12"가 원본 그대로 노출돼 다른 숫자와 붙는 일이 없어야 한다.
  assert.ok(!text?.includes("4.512"));
  assert.ok(!text?.includes("1 4.5"));
});

test("aria-hidden 아이콘/숫자 위에서 호버·클릭해도 부모 배지를 chrome으로 오판하지 않는다", () => {
  // 실제 버그 재현: 별점 배지 안 아이콘·숫자에 aria-hidden="true"를 붙였더니, 이용자가 그
  // 아이콘이나 숫자 위에 마우스를 올리거나 클릭하면 이벤트의 target이 그 aria-hidden 요소가
  // 돼서, isA11yChrome(target)이 true로 오판해 부모 배지(data-speakable)의 읽기 자체가
  // 죽어버렸다. resolveSpeechTarget으로 숨김 조상을 벗어난 지점부터 판단해야 한다.
  const dom = new JSDOM(
    `<div data-speakable aria-label="별점 4.5점">
       <svg aria-hidden="true"></svg>
       <span aria-hidden="true">4.5</span>
     </div>`
  );
  const hiddenNumber = dom.window.document.querySelector("span[aria-hidden]");
  if (!hiddenNumber) throw new Error("test fixture missing hidden span");
  const badge = hiddenNumber.parentElement;
  if (!badge) throw new Error("test fixture missing badge div");

  const resolved = resolveSpeechTarget(hiddenNumber);
  assert.equal(resolved, badge);

  const block = findSpeakableBlock(hiddenNumber);
  assert.equal(block, badge);
  assert.equal(getSpeakableText(block ?? hiddenNumber), "별점 4.5점");
});

test("내용 블록은 고르지만 main과 chrome은 고르지 않는다", () => {
  const main = {
    tagName: "MAIN",
    parentElement: null,
    closest() {
      return null;
    },
    matches() {
      return false;
    },
    getAttribute() {
      return null;
    }
  } as unknown as Element;

  const section = {
    tagName: "SECTION",
    parentElement: main,
    closest(selector: string) {
      if (selector.includes("data-speakable")) return null;
      if (selector.includes("header")) return null;
      return null;
    },
    matches(selector: string) {
      return selector.includes("section");
    },
    getAttribute() {
      return null;
    }
  } as unknown as Element;

  const heading = {
    tagName: "H2",
    parentElement: section,
    closest(selector: string) {
      if (selector.includes("data-speakable")) return null;
      if (selector.includes("header") || selector.includes("data-a11y-chrome")) return null;
      return null;
    },
    matches() {
      return false;
    },
    getAttribute() {
      return null;
    }
  } as unknown as Element;

  const chromeBtn = {
    tagName: "BUTTON",
    parentElement: null,
    closest(selector: string) {
      if (selector.includes("header") || selector.includes("data-a11y-chrome")) {
        return chromeBtn;
      }
      return null;
    },
    matches() {
      return false;
    },
    getAttribute() {
      return null;
    }
  } as unknown as Element;

  assert.equal(findSpeakableBlock(heading), heading);
  assert.equal(findSpeakableBlock(section), section);
  assert.equal(findSpeakableBlock(main), null);
  assert.equal(findSpeakableBlock(chromeBtn), null);
});

test("다음 내용 블록은 문서 순서의 다음 후보를 고른다", () => {
  const second = { id: "second" } as unknown as Element;
  const first = {
    id: "first",
    closest() {
      return {
        querySelectorAll() {
          return [first, second];
        }
      };
    },
    compareDocumentPosition() {
      return 0;
    }
  } as unknown as Element;

  // textContent filter needs truthy text
  Object.defineProperty(first, "textContent", { value: "운영시간 09:00" });
  Object.defineProperty(second, "textContent", { value: "휴무일 월요일" });

  // isA11yChrome uses closest - return null for both
  (first as { closest: (s: string) => Element | null }).closest = (selector: string) => {
    if (
      selector.includes("dialog") ||
      selector.includes("main") ||
      selector.includes("data-place")
    ) {
      return {
        querySelectorAll: () => [first, second]
      } as unknown as Element;
    }
    return null;
  };
  (second as { closest: (s: string) => Element | null }).closest = () => null;

  assert.equal(findNextSpeakableBlock(first), second);
});

test("호버 이탈: 창 밖·빈 영역은 멈추고 버튼·내용 블록 위는 유지한다", () => {
  assert.equal(shouldStopHoverSpeech(null), true);

  const dom = new JSDOM(
    `<main><div id="empty"></div><button id="button">지도</button><section id="section">안내 내용</section></main><nav><button id="chrome">메뉴</button></nav>`
  );
  const doc = dom.window.document;
  assert.equal(shouldStopHoverSpeech(doc.getElementById("empty")), true);
  assert.equal(shouldStopHoverSpeech(doc.getElementById("button")), false);
  assert.equal(shouldStopHoverSpeech(doc.getElementById("section")), false);
  assert.equal(shouldStopHoverSpeech(doc.getElementById("chrome")), true);
});

test("홈의 독립 텍스트와 상세 소제목을 커서 위치에서 읽는다", () => {
  const dom = new JSDOM(
    `<main><div><span id="weather">대전 맑음 24도</span></div><div role="dialog"><h4 id="heading">편의시설</h4><div><span id="detail">경사로 있음</span></div></div></main>`
  );
  for (const [id, expected] of [
    ["weather", "대전 맑음 24도"],
    ["heading", "편의시설"],
    ["detail", "경사로 있음"]
  ]) {
    const target = dom.window.document.getElementById(id)!;
    assert.equal(getSpeakableText(findHoverSpeakableBlock(target)!), expected);
    assert.equal(shouldStopHoverSpeech(target), false);
  }
});

test("중첩 SVG 아이콘 위에서도 부모 버튼을 읽는다", () => {
  const dom = new JSDOM(
    `<main><button aria-label="지도 보기"><svg aria-hidden="true"><g><path id="icon" /></g></svg></button></main>`
  );
  const target = dom.window.document.getElementById("icon")!;
  assert.equal(getSpeakableText(findHoverSpeakableBlock(target)!), "지도 보기");
});

test("호버는 명시적 행 단위와 버튼을 유지하고 빈 영역은 읽지 않는다", () => {
  const dom = new JSDOM(
    `<main><div data-speakable><span id="row">주소</span><span>대전 서구</span></div><div id="empty"></div><div hidden><p id="hidden">숨김 내용</p></div><button><span id="button">지도 보기</span></button></main>`
  );
  const doc = dom.window.document;
  assert.equal(
    getSpeakableText(findHoverSpeakableBlock(doc.getElementById("row")!)!),
    "주소 대전 서구"
  );
  assert.equal(
    getSpeakableText(findHoverSpeakableBlock(doc.getElementById("button")!)!),
    "지도 보기"
  );
  assert.equal(findHoverSpeakableBlock(doc.getElementById("empty")!), null);
  assert.equal(findHoverSpeakableBlock(doc.getElementById("hidden")!), null);
});

test("상세 창의 탭과 하단 버튼도 호버로 읽는다", () => {
  const dom = new JSDOM(
    `<div role="dialog"><nav><button id="tab">방문 정보</button></nav><footer><a id="map">지도에서 보기</a></footer><div data-a11y-chrome><button id="settings">설정</button></div></div>`
  );
  const doc = dom.window.document;
  assert.equal(getSpeakableText(findHoverSpeakableBlock(doc.getElementById("tab")!)!), "방문 정보");
  assert.equal(
    getSpeakableText(findHoverSpeakableBlock(doc.getElementById("map")!)!),
    "지도에서 보기"
  );
  assert.equal(findHoverSpeakableBlock(doc.getElementById("settings")!), null);
});

test("다유 대화창의 제목, 설정, 답변, 스피커 아이콘과 입력창을 읽는다", () => {
  const dom = new JSDOM(
    `<dialog open aria-label="다유 챗봇"><header><span id="title">다유</span></header><details><summary id="settings"><span>음성 부가 설정</span></summary></details><p data-speakable id="answer">휠체어 출입구를 확인해 주세요.</p><button aria-label="답변 음성 재생"><svg aria-hidden="true"><path id="speaker"/></svg></button><input id="question" aria-label="질문 입력" placeholder="질문을 적어 주세요"/></dialog>`
  );
  for (const [id, text] of [
    ["title", "다유"],
    ["settings", "음성 부가 설정"],
    ["answer", "휠체어 출입구를 확인해 주세요."],
    ["speaker", "답변 음성 재생"],
    ["question", "질문 입력, 질문을 적어 주세요"]
  ]) {
    const target = dom.window.document.getElementById(id)!;
    assert.equal(getSpeakableText(findHoverSpeakableBlock(target)!), text);
  }
});
