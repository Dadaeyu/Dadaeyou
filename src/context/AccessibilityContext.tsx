"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import {
  applyAccessibilityState,
  clampFontScale,
  DEFAULT_A11Y_STATE,
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_STEP,
  findNextSpeakableBlock,
  findSpeakableBlock,
  getSpeakableText,
  HOVER_SPEAK_SELECTOR,
  isA11yChrome,
  loadAccessibilityState,
  mergeAccessibilityPreferences,
  resolveSpeechTarget,
  saveAccessibilityState,
  shouldStopHoverSpeech,
  type AccessibilityState
} from "@/lib/accessibility";
import { useOptionalAuth } from "@/context/AuthContext";
import { updateUserPreferences } from "@/lib/supabase/member";

interface AccessibilityContextValue extends AccessibilityState {
  toggleDarkMode: () => void;
  toggleHighContrast: () => void;
  toggleEasyMode: () => void;
  toggleReadAloud: () => void;
  increaseFontScale: () => void;
  decreaseFontScale: () => void;
  setFontScale: (value: number) => void;
  /** 방금 읽은 블록의 다음 내용을 이어서 읽는다 */
  speakNext: () => void;
  canSpeakNext: boolean;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const [state, setState] = useState<AccessibilityState>(DEFAULT_A11Y_STATE);
  const [canSpeakNext, setCanSpeakNext] = useState(false);
  const stateRef = useRef(state);
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
  const lastBlockRef = useRef<Element | null>(null);
  /** 호버로 시작한 읽기만 마우스 이탈 시 중지한다 */
  const speakSourceRef = useRef<"hover" | "other">("other");
  const loaded = useRef(false);
  const syncedFromDb = useRef(false);
  const syncedUserId = useRef<string | null>(null);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    const saved = loadAccessibilityState();
    loaded.current = true;
    stateRef.current = saved;
    applyAccessibilityState(saved);
    queueMicrotask(() => setState(saved));
  }, []);

  // 로그인 완료 후 DB preferences → 화면 (기기 간 동기화). auth.loading 끝난 뒤에만.
  useEffect(() => {
    if (!auth || auth.loading) return;

    if (!auth.user) {
      syncedFromDb.current = false;
      syncedUserId.current = null;
      return;
    }

    if (!auth.preferences) return;

    // 같은 유저로 이미 동기화했으면 스킵 (토글 직후 preferences 패치로 재적용·깜빡임 방지)
    if (syncedFromDb.current && syncedUserId.current === auth.user.id) return;

    const fromDb = mergeAccessibilityPreferences(auth.preferences, stateRef.current);
    syncedFromDb.current = true;
    syncedUserId.current = auth.user.id;
    stateRef.current = fromDb;
    setState(fromDb);
    applyAccessibilityState(fromDb);
    saveAccessibilityState(fromDb);
  }, [auth, auth?.loading, auth?.user, auth?.preferences]);

  const persistState = useCallback(
    async (next: AccessibilityState) => {
      applyAccessibilityState(next);
      saveAccessibilityState(next);
      if (!auth?.user) return;
      try {
        const updated = await updateUserPreferences(auth.user.id, {
          dark_mode: next.darkMode,
          high_contrast: next.highContrast,
          font_scale: next.fontScale,
          read_aloud: next.readAloud
        });
        auth.patchPreferences({
          dark_mode: updated.dark_mode,
          high_contrast: updated.high_contrast,
          font_scale: updated.font_scale,
          read_aloud: updated.read_aloud,
          updated_at: updated.updated_at
        });
      } catch (err) {
        console.warn("[a11y] DB 동기화 실패 (로컬에는 저장됨)", err);
      }
    },
    [auth]
  );

  const speak = useCallback((text: string, force = false) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (!force && activeUtterance.current?.text === text) return;

    activeUtterance.current = null;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    activeUtterance.current = utterance;
    const release = () => {
      if (activeUtterance.current === utterance) activeUtterance.current = null;
    };
    utterance.onend = release;
    utterance.onerror = release;
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    try {
      window.speechSynthesis.speak(utterance);
    } catch {
      release();
    }
  }, []);

  const speakBlock = useCallback(
    (block: Element, force = false) => {
      const text = getSpeakableText(block);
      if (!text) return false;
      lastBlockRef.current = block;
      setCanSpeakNext(Boolean(findNextSpeakableBlock(block)));
      speak(text, force);
      return true;
    },
    [speak]
  );

  const speakNext = useCallback(() => {
    const current = lastBlockRef.current;
    if (!current || !document.contains(current)) {
      setCanSpeakNext(false);
      return;
    }
    const next = findNextSpeakableBlock(current);
    if (!next) {
      setCanSpeakNext(false);
      speakSourceRef.current = "other";
      speak("다음 읽을 내용이 없습니다.", true);
      return;
    }
    speakSourceRef.current = "other";
    speakBlock(next, true);
  }, [speak, speakBlock]);

  useEffect(() => {
    if (!state.readAloud) {
      activeUtterance.current = null;
      lastBlockRef.current = null;
      speakSourceRef.current = "other";
      setCanSpeakNext(false);
      window.speechSynthesis?.cancel();
      return;
    }

    const cancelHoverSpeech = () => {
      if (speakSourceRef.current !== "hover") return;
      window.speechSynthesis?.cancel();
      activeUtterance.current = null;
      speakSourceRef.current = "other";
    };

    const handleFocusIn = (event: FocusEvent) => {
      const raw = event.target;
      if (!(raw instanceof Element)) return;
      // aria-hidden 아이콘/숫자(예: 별점 배지 안) 위가 실제 이벤트 target일 수 있다 — 그걸
      // 그대로 chrome 판정에 넘기면 정작 부모 배지의 읽기 자체가 죽는다. 숨김 조상을
      // 벗어난 지점부터 판단한다.
      const target = resolveSpeechTarget(raw);
      if (isA11yChrome(target)) return;

      const block = findSpeakableBlock(target) ?? target;
      if (speakBlock(block)) speakSourceRef.current = "other";
    };

    const handleMouseOver = (event: MouseEvent) => {
      const raw = event.target;
      if (!(raw instanceof Element)) return;
      const target = resolveSpeechTarget(raw);
      if (isA11yChrome(target)) return;

      // 버튼·링크가 있으면 그걸 우선하고(목록은 카드 전체가 링크), 없으면 클릭과 같은 기준으로
      // 가장 가까운 내용 블록을 읽는다 — 상세 화면처럼 본문이 일반 텍스트인 곳도 호버로 읽히게.
      const block = target.closest(HOVER_SPEAK_SELECTOR) ?? findSpeakableBlock(target);
      if (!block) return;

      if (speakBlock(block)) speakSourceRef.current = "hover";
    };

    const handleClick = (event: MouseEvent) => {
      const raw = event.target;
      if (!(raw instanceof Element)) return;
      const target = resolveSpeechTarget(raw);
      if (isA11yChrome(target)) return;

      // 접근성 패널의 「다음 내용 읽기」는 클릭 읽기 대상에서 제외
      if (target.closest("[data-a11y-speak-next]")) return;

      const block = findSpeakableBlock(target);
      if (!block) return;
      if (speakBlock(block)) speakSourceRef.current = "other";
    };

    const handleMouseOut = (event: MouseEvent) => {
      if (!shouldStopHoverSpeech(event.relatedTarget)) return;
      cancelHoverSpeech();
    };

    const handleDocumentLeave = () => {
      cancelHoverSpeech();
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseover", handleMouseOver);
    document.addEventListener("mouseout", handleMouseOut);
    document.addEventListener("click", handleClick, true);
    document.documentElement.addEventListener("mouseleave", handleDocumentLeave);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseover", handleMouseOver);
      activeUtterance.current = null;
      document.removeEventListener("mouseout", handleMouseOut);
      document.removeEventListener("click", handleClick, true);
      document.documentElement.removeEventListener("mouseleave", handleDocumentLeave);
      window.speechSynthesis?.cancel();
    };
  }, [state.readAloud, speakBlock]);

  const updateState = useCallback(
    (updater: (prev: AccessibilityState) => AccessibilityState) => {
      if (!loaded.current) return;
      const next = updater(stateRef.current);
      stateRef.current = next;
      setState(next);
      void persistState(next);
    },
    [persistState]
  );

  const toggleDarkMode = useCallback(() => {
    updateState((prev) => ({ ...prev, darkMode: !prev.darkMode }));
  }, [updateState]);

  const toggleHighContrast = useCallback(() => {
    updateState((prev) => ({ ...prev, highContrast: !prev.highContrast }));
  }, [updateState]);

  const toggleEasyMode = useCallback(() => {
    updateState((prev) => ({ ...prev, easyMode: !prev.easyMode }));
  }, [updateState]);

  const toggleReadAloud = useCallback(() => {
    updateState((prev) => ({ ...prev, readAloud: !prev.readAloud }));
  }, [updateState]);

  const setFontScale = useCallback(
    (value: number) => {
      updateState((prev) => ({
        ...prev,
        fontScale: clampFontScale(value)
      }));
    },
    [updateState]
  );

  const increaseFontScale = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      fontScale: clampFontScale(prev.fontScale + FONT_SCALE_STEP)
    }));
  }, [updateState]);

  const decreaseFontScale = useCallback(() => {
    updateState((prev) => ({
      ...prev,
      fontScale: clampFontScale(prev.fontScale - FONT_SCALE_STEP)
    }));
  }, [updateState]);

  const value = useMemo<AccessibilityContextValue>(
    () => ({
      ...state,
      toggleDarkMode,
      toggleHighContrast,
      toggleEasyMode,
      toggleReadAloud,
      increaseFontScale,
      decreaseFontScale,
      setFontScale,
      speakNext,
      canSpeakNext
    }),
    [
      state,
      toggleDarkMode,
      toggleHighContrast,
      toggleEasyMode,
      toggleReadAloud,
      increaseFontScale,
      decreaseFontScale,
      setFontScale,
      speakNext,
      canSpeakNext
    ]
  );

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error("useAccessibility must be used within AccessibilityProvider");
  }
  return context;
}

export { FONT_SCALE_MIN, FONT_SCALE_MAX, FONT_SCALE_STEP };
