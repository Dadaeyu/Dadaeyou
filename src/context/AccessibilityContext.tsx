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
  getSpeakableText,
  normalizeForSpeech,
  loadAccessibilityState,
  mergeAccessibilityPreferences,
  saveAccessibilityState,
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
  /** 읽어주기가 켜져 있을 때만(꺼져 있으면 아무 것도 안 함) 즉시 텍스트를 읽는다.
   *  호버/포커스로는 못 잡는 값 변경(예: 필터 선택 결과)을 알릴 때 쓴다. */
  speak: (text: string) => void;
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const [state, setState] = useState<AccessibilityState>(DEFAULT_A11Y_STATE);
  const stateRef = useRef(state);
  const lastSpoken = useRef<string | null>(null);
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

  const speak = useCallback((rawText: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (!stateRef.current.readAloud) return;

    const text = normalizeForSpeech(rawText);
    if (lastSpoken.current === text) return;

    lastSpoken.current = text;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "ko-KR";
    utterance.rate = 1;
    window.speechSynthesis.speak(utterance);
  }, []);

  useEffect(() => {
    if (!state.readAloud) {
      lastSpoken.current = null;
      window.speechSynthesis?.cancel();
      return;
    }

    // 카드/구역 하나를 통째로 하나의 문장으로 읽어야 하는 영역(검색 결과, 게시글 제목/본문
    // 영역 등)에는 data-speak-group을 붙여둔다. 그 영역 안에서 원래 텍스트 자체로도 읽히는
    // 하위 요소(h1/h3/p — 그룹 라벨에 이미 포함된 중복 텍스트)는 aria-hidden="true"로 표시해
    // 걸러내고, 파일 링크·이미지 버튼처럼 그룹과 무관하게 자기 고유의 의미가 있는 진짜 상호작용
    // 요소는 건너뛰지 않고 그대로 읽는다.
    const SPEAK_SELECTOR =
      "button, a, [role='button'], [role='link'], input, textarea, select, p, h1, h2, h3, [data-speakable], [data-speak-group]";

    const resolveSpeakTarget = (start: Element): Element | null => {
      let node: Element | null = start;
      while (node) {
        const match: Element | null = node.closest(SPEAK_SELECTOR);
        if (!match) return null;
        if (match.getAttribute("aria-hidden") !== "true") return match;
        node = match.parentElement;
      }
      return null;
    };

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const speakTarget = resolveSpeakTarget(target);
      if (!speakTarget) return;

      const text = getSpeakableText(speakTarget);
      if (text) speak(text);
    };

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const speakTarget = resolveSpeakTarget(target);
      if (!speakTarget) return;

      const text = getSpeakableText(speakTarget);
      if (text) speak(text);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseover", handleMouseOver);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseover", handleMouseOver);
      window.speechSynthesis?.cancel();
    };
  }, [state.readAloud, speak]);

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
      speak
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
      speak
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
