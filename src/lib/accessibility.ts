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

// 브라우저 음성엔진마다 숫자 "0"을 "영"/"공" 중 무엇으로 읽을지가 갈려서(같은 화면 안에서도
// 문맥에 따라 다르게 읽히는 경우가 있음) 항상 "영"으로 통일해 읽도록 텍스트 단계에서 치환한다.
// - 여러 자리 숫자 중간의 0(예: "10", "2026")은 숫자가 앞뒤에 붙어 있으니 건드리지 않는다.
// - 소수점의 0(예: "0.0")도 건드리지 않는다 — 엔진이 "X.Y"를 이미 "엑스쩜와이"로 자연스럽게
//   읽는데, "0"을 "영"으로 글자 치환해버리면 더 이상 숫자로 안 보여서 오히려 이상하게 읽힌다.
// - 그 외 독립된 "0"(예: "즐겨찾기 0개")만 "영"으로 바꾼다.
export function normalizeForSpeech(text: string): string {
  return text.replace(/(?<![.\d])0(?![.\d])/g, "영");
}

export function getSpeakableText(element: Element): string | null {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent?.trim()) return labelEl.textContent.trim();
  }

  const ariaLabel = element.getAttribute("aria-label")?.trim();
  if (ariaLabel) return ariaLabel;

  const role = element.getAttribute("role");
  const tag = element.tagName.toLowerCase();
  const interactive =
    role === "button" ||
    role === "link" ||
    tag === "button" ||
    tag === "a" ||
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    // span/div처럼 원래 안 읽던 태그를 개별적으로 읽기 대상에 넣는 opt-in 표시.
    element.hasAttribute("data-speakable");

  if (!interactive && tag !== "h1" && tag !== "h2" && tag !== "h3" && tag !== "p") {
    return null;
  }

  const text = element.textContent?.replace(/\s+/g, " ").trim();
  if (!text) return null;

  return text.slice(0, 200);
}
