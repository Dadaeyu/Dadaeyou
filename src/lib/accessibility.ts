/**
 * 팀원 협업 규칙 (접근성 자동 적용 유지):
 * 1. 색상은 Tailwind 클래스(bg-white, text-gray-800 등) 사용 — 인라인 hex/bg-[#fff] 금지
 * 2. 아이콘만 있는 버튼에는 aria-label 필수
 * 3. 이미지 alt, 클릭 요소는 button/a 등 시맨틱 태그 사용
 */

export const A11Y_STORAGE_KEY = "dadaeyu-a11y";

export const FONT_SCALE_MIN = 100;
export const FONT_SCALE_MAX = 200;
export const FONT_SCALE_STEP = 10;

export interface AccessibilityState {
  darkMode: boolean;
  highContrast: boolean;
  fontScale: number;
  readAloud: boolean;
  easyMode: boolean;
}

export const DEFAULT_A11Y_STATE: AccessibilityState = {
  darkMode: false,
  highContrast: false,
  fontScale: 100,
  readAloud: false,
  easyMode: false
};

export type AccessibilityPreferences = {
  dark_mode: boolean;
  high_contrast: boolean;
  font_scale: number;
  read_aloud: boolean;
};

export function loadAccessibilityState(): AccessibilityState {
  if (typeof window === "undefined") return DEFAULT_A11Y_STATE;

  try {
    const raw = localStorage.getItem(A11Y_STORAGE_KEY);
    if (!raw) return DEFAULT_A11Y_STATE;

    const parsed = JSON.parse(raw) as Partial<AccessibilityState>;
    return {
      darkMode: Boolean(parsed.darkMode),
      highContrast: Boolean(parsed.highContrast),
      fontScale: clampFontScale(parsed.fontScale ?? DEFAULT_A11Y_STATE.fontScale),
      readAloud: Boolean(parsed.readAloud),
      easyMode: Boolean(parsed.easyMode)
    };
  } catch {
    return DEFAULT_A11Y_STATE;
  }
}

export function saveAccessibilityState(state: AccessibilityState): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(state));
}

export function clampFontScale(value: number): number {
  const stepped = Math.round(value / FONT_SCALE_STEP) * FONT_SCALE_STEP;
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, stepped));
}

export function applyAccessibilityState(state: AccessibilityState): void {
  if (typeof document === "undefined") return;

  const root = document.documentElement;
  root.classList.toggle("dark", state.darkMode);
  root.classList.toggle("high-contrast", state.highContrast);
  root.classList.toggle("easy-mode", state.easyMode);
  root.classList.toggle("font-scale-large", state.fontScale >= 150);
  root.style.setProperty("--a11y-scale", String(state.fontScale / 100));
}

export function mergeAccessibilityPreferences(
  prefs: AccessibilityPreferences,
  current: AccessibilityState
): AccessibilityState {
  return {
    darkMode: prefs.dark_mode,
    highContrast: prefs.high_contrast,
    fontScale: prefs.font_scale,
    readAloud: prefs.read_aloud,
    easyMode: current.easyMode
  };
}

const ROW_SPEAK_LIMIT = 400;
const SECTION_SPEAK_LIMIT = 800;

const CHROME_SELECTOR = "header, nav, footer, [data-a11y-chrome], [aria-hidden='true']";

const CONTENT_BLOCK_SELECTOR = [
  "[data-speakable]",
  "article",
  "section",
  "li",
  "[role='listitem']",
  "[role='dialog']",
  "dl > div",
  "dialog"
].join(", ");

/** 호버 시 우선해서 읽는 인터랙티브 요소. 여기에 안 걸리는 일반 본문은 findSpeakableBlock으로
 * 가장 가까운 내용 블록을 찾아 읽는다(클릭과 같은 기준) — 카드가 통째로 링크인 목록 화면만
 * 호버로 읽히고 상세 화면 본문은 안 읽히던 문제를 없애기 위해서다. */
export const HOVER_SPEAK_SELECTOR =
  "button, a, [role='button'], [role='link'], input, textarea, select, summary";

function normalizeSpeakText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * 호버 발화 중 마우스가 relatedTarget으로 이동했을 때 중지할지.
 * 창 밖·비 Element·chrome·읽을 곳 없으면 true.
 */
export function shouldStopHoverSpeech(relatedTarget: EventTarget | null): boolean {
  if (relatedTarget == null || typeof relatedTarget !== "object") return true;
  if (!("closest" in relatedTarget) || typeof (relatedTarget as Element).closest !== "function") {
    return true;
  }

  const el = resolveSpeechTarget(relatedTarget as Element);
  if (isA11yChrome(el)) return true;
  if (findHoverSpeakableBlock(el)) return false;
  return true;
}

function speakLimitFor(element: Element): number {
  const tag = element.tagName.toLowerCase();
  if (
    tag === "section" ||
    tag === "article" ||
    tag === "dialog" ||
    element.getAttribute("role") === "dialog"
  ) {
    return SECTION_SPEAK_LIMIT;
  }
  return ROW_SPEAK_LIMIT;
}

export function isA11yChrome(element: Element): boolean {
  const chrome = element.closest(CHROME_SELECTOR);
  if (!chrome) return false;
  // 상세 창 안의 탭과 하단 동작은 본문 기능이다.
  const dialog = element.closest("dialog, [role='dialog']");
  if (dialog?.contains(chrome) && chrome.matches("header, nav, footer")) return false;
  return true;
}

/**
 * 마우스/클릭 이벤트의 실제 target이 aria-hidden 요소 자체(또는 그 안)일 수 있다 — 예:
 * "별점 4.5점" 배지처럼 아이콘·숫자는 읽기 중복을 막으려고 aria-hidden 처리했는데, 이용자는
 * 보통 그 아이콘이나 숫자 위에 마우스를 올리거나 클릭한다. 그 target을 그대로 isA11yChrome에
 * 넘기면 "무시해야 할 chrome 요소"로 오판해 부모의 호버/클릭 읽기 자체가 죽어버린다. aria-hidden
 * 조상을 벗어난 첫 요소까지 거슬러 올라가 그걸 기준으로 판단하도록 보정한다.
 */
export function resolveSpeechTarget(target: Element): Element {
  let current = target;
  let hidden = current.closest("[aria-hidden='true']");
  while (hidden?.parentElement) {
    current = hidden.parentElement;
    hidden = current.closest("[aria-hidden='true']");
  }
  return current;
}

/** 커서 아래 컨트롤/명시적 행을 우선하고, 일반 텍스트는 해당 조각만 읽는다. */
export function findHoverSpeakableBlock(raw: Element): Element | null {
  const target = resolveSpeechTarget(raw);
  if (isA11yChrome(target) || target.closest("[hidden], [inert]")) return null;
  const control = target.closest(HOVER_SPEAK_SELECTOR);
  if (control) return control;
  const explicit = target.closest("[data-speakable]");
  if (explicit) return explicit;
  const row = target.closest("dt, dd");
  if (row) return findSpeakableBlock(row);

  // div/span만으로 만든 날씨·상세 정보도 포함하되, 빈 레이아웃에서
  // 상위 섹션 전체를 읽지 않는다. SVG는 텍스트가 있는 부모를 찾는다.
  let current: Element | null = target;
  while (current && !current.matches("main, body, html")) {
    if (
      Array.from(current.childNodes ?? []).some(
        (node) => node.nodeType === 3 && normalizeSpeakText(node.textContent)
      ) ||
      current.hasAttribute("aria-label")
    )
      return current;
    if (!current.matches("svg, path, g, circle, rect, use")) break;
    current = current.parentElement;
  }
  return null;
}

/** 눌러서 읽을 가장 가까운 내용 블록. main/body처럼 너무 큰 컨테이너는 고르지 않는다. */
export function findSpeakableBlock(rawStart: Element): Element | null {
  const start = resolveSpeechTarget(rawStart);
  if (isA11yChrome(start)) return null;

  const explicit = start.closest("[data-speakable]");
  if (explicit && !isA11yChrome(explicit)) return explicit;

  // dt/dd 묶음: 같은 행(div) 또는 dl 바로 아래 형제 쌍
  const dtOrDd = start.closest("dt, dd");
  if (dtOrDd?.parentElement) {
    const parent = dtOrDd.parentElement;
    if (
      parent.tagName.toLowerCase() === "div" &&
      parent.parentElement?.tagName.toLowerCase() === "dl"
    ) {
      return parent;
    }
    return dtOrDd;
  }

  let current: Element | null = start;
  while (current) {
    if (isA11yChrome(current)) return null;
    const tag = current.tagName.toLowerCase();
    if (tag === "main" || tag === "body" || tag === "html") return null;

    if (current.matches(CONTENT_BLOCK_SELECTOR)) {
      return current;
    }

    const role = current.getAttribute("role");
    if (
      role === "button" ||
      role === "link" ||
      tag === "button" ||
      tag === "a" ||
      tag === "h1" ||
      tag === "h2" ||
      tag === "h3" ||
      tag === "p"
    ) {
      return current;
    }

    current = current.parentElement;
  }

  return null;
}

/** 방금 읽은 블록의 다음 형제(문서 순서)를 찾는다. */
export function findNextSpeakableBlock(from: Element): Element | null {
  const root =
    from.closest("dialog, [role='dialog'], main, [data-place-section]") ?? from.parentElement;
  if (!root) return null;

  const candidates = Array.from(
    root.querySelectorAll(
      "[data-speakable], article, section, li, [role='listitem'], dl > div, h1, h2, h3, p, button, a"
    )
  ).filter((el) => !isA11yChrome(el) && normalizeSpeakText(el.textContent));

  const index = candidates.indexOf(from);
  if (index >= 0 && index < candidates.length - 1) {
    return candidates[index + 1] ?? null;
  }

  // from이 후보 목록에 없으면, 문서 순서상 from 다음에 오는 첫 후보
  for (const candidate of candidates) {
    const position = from.compareDocumentPosition(candidate);
    if (position & Node.DOCUMENT_POSITION_FOLLOWING) {
      return candidate;
    }
  }

  return null;
}

// 카드/섹션은 본문 전체를 읽는데, element.textContent를 그대로 쓰면 두 가지 문제가 있다.
//  1) aria-hidden/aria-label을 전혀 모른다 — 화면에만 보이라고 숨겨둔 값까지 그대로 읽는다.
//  2) 인접한 요소의 텍스트를 구분자 없이 이어붙인다 — 그래서 제목 "코스 2-1" 바로 뒤에 별점
//     "4.5"가 오면 "2-14.5"가 되어 "코스2 마이너스 14.5"처럼 하나의 수로 읽혔다.
// 그래서 직접 트리를 훑으면서, aria-hidden 하위 트리는 건너뛰고 aria-label이 있는 요소는 그
// 라벨로 대체하며, 조각 사이에 구분자를 넣어 문장을 만든다(표준 접근성 트리와 같은 원리).
// 제목·라벨처럼 그 자체로 완결된 조각 뒤에는 쉼표를 넣어 TTS가 끊어 읽게 한다.
type SpeakPart = { text: string; standalone: boolean };

const STANDALONE_TAGS = new Set(["h1", "h2", "h3", "h4", "h5", "h6"]);

function collectSpeakParts(element: Element, parts: SpeakPart[]): void {
  // 붙어 있는 텍스트 노드는 원문 그대로 이어 붙였다가 한 조각으로 만든다 — React가
  // `{count}곳`을 텍스트 노드 둘로 쪼개도 "1 곳"이 아니라 "1곳"으로 읽히게 하기 위해서다.
  let textBuffer = "";
  const flushText = () => {
    const text = normalizeSpeakText(textBuffer);
    textBuffer = "";
    if (text) parts.push({ text, standalone: false });
  };

  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === 3) {
      textBuffer += child.textContent ?? "";
      continue;
    }
    if (child.nodeType !== 1) continue;

    flushText();
    const childElement = child as Element;
    if (childElement.getAttribute("aria-hidden") === "true") continue;

    const label = childElement.getAttribute("aria-label")?.trim();
    if (label) {
      parts.push({ text: label, standalone: true });
      continue;
    }

    const before = parts.length;
    collectSpeakParts(childElement, parts);

    // 제목 태그는 뒤에 오는 내용과 붙지 않도록 하나의 완결된 조각으로 표시한다.
    if (STANDALONE_TAGS.has(childElement.tagName.toLowerCase()) && parts.length > before) {
      parts[parts.length - 1] = { text: parts[parts.length - 1].text, standalone: true };
    }
  }
  flushText();
}

function extractSpeakableBody(element: Element): string {
  // 테스트 목 객체처럼 childNodes가 없는 환경에서는 textContent로 폴백한다.
  if (!element.childNodes) return element.textContent ?? "";

  const parts: SpeakPart[] = [];
  collectSpeakParts(element, parts);
  if (!parts.length) return element.textContent ?? "";

  return parts.reduce((sentence, part, index) => {
    if (index === 0) return part.text;
    const separator = part.standalone || parts[index - 1].standalone ? ", " : " ";
    return sentence + separator + part.text;
  }, "");
}

function labelledByText(element: Element): string {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (!labelledBy) return "";
  return labelledBy
    .split(/\s+/)
    .map((id) => normalizeSpeakText(document.getElementById(id)?.textContent))
    .filter(Boolean)
    .join(" ");
}

export function getSpeakableText(element: Element): string | null {
  const dataSpeak = element.getAttribute("data-speak-text")?.trim();
  if (dataSpeak) return dataSpeak.slice(0, speakLimitFor(element));

  const ariaLabel = element.getAttribute("aria-label")?.trim();
  const role = element.getAttribute("role");
  const tag = element.tagName.toLowerCase();
  const isTextarea = tag === "textarea";
  const inputType =
    tag === "input"
      ? ((element as HTMLInputElement).type || element.getAttribute("type") || "text").toLowerCase()
      : "";
  const isTextInput =
    tag === "input" &&
    ["text", "search", "email", "tel", "url", "number", "date", "time", "month", "week"].includes(
      inputType
    );

  if (isTextarea || isTextInput || inputType === "password") {
    const input = element as HTMLInputElement | HTMLTextAreaElement;
    const readableValue = inputType === "password" ? "" : input.value;
    const inputText = (readableValue || input.placeholder || "").replace(/\s+/g, " ").trim();
    const parts = [ariaLabel, inputText].filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ").slice(0, 200) : null;
  }

  if (tag === "input" && ariaLabel) return ariaLabel;

  // <select>는 옵션 전체(예: 0시~23시 24개)가 자식 텍스트라, 그대로 body를 뽑으면 목록 전체를
  // 처음부터 다 읽어버린다. 실제로 의미 있는 건 "지금 선택된 값" 하나뿐이다.
  if (tag === "select") {
    const select = element as HTMLSelectElement;
    const selected = select.selectedOptions?.[0] ?? select.options?.[select.selectedIndex];
    const selectedText = normalizeSpeakText(selected?.textContent);
    const parts = [ariaLabel, selectedText].filter((part): part is string => Boolean(part));
    return parts.length ? parts.join(", ").slice(0, 200) : null;
  }

  // 짧은 컨트롤은 aria-label만. 섹션/카드는 본문까지.
  const isCompactControl =
    role === "button" ||
    role === "link" ||
    tag === "button" ||
    tag === "a" ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "summary";

  if (ariaLabel && isCompactControl) return ariaLabel;

  const label = labelledByText(element);
  const body = normalizeSpeakText(extractSpeakableBody(element));
  if (label) {
    const withoutRepeatedLabel = body.startsWith(label) ? body.slice(label.length).trim() : body;
    const combined = withoutRepeatedLabel ? `${label}. ${withoutRepeatedLabel}` : label;
    return combined.slice(0, speakLimitFor(element)) || null;
  }

  if (ariaLabel) return ariaLabel.slice(0, speakLimitFor(element));

  const interactive = isCompactControl;
  const isContentBlock =
    element.hasAttribute("data-speakable") ||
    tag === "section" ||
    tag === "article" ||
    tag === "li" ||
    tag === "dialog" ||
    tag === "div" ||
    tag === "dl" ||
    tag === "dt" ||
    tag === "dd" ||
    role === "dialog" ||
    role === "listitem";

  if (
    !interactive &&
    !isContentBlock &&
    tag !== "h1" &&
    tag !== "h2" &&
    tag !== "h3" &&
    tag !== "h4" &&
    tag !== "h5" &&
    tag !== "h6" &&
    tag !== "span" &&
    tag !== "label" &&
    tag !== "strong" &&
    tag !== "small" &&
    tag !== "p"
  ) {
    return null;
  }

  if (!body) return null;
  return body.slice(0, speakLimitFor(element));
}
