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
}

const AccessibilityContext = createContext<AccessibilityContextValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const auth = useOptionalAuth();
  const [state, setState] = useState<AccessibilityState>(DEFAULT_A11Y_STATE);
  const stateRef = useRef(state);
  const activeUtterance = useRef<SpeechSynthesisUtterance | null>(null);
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

  const speak = useCallback((text: string) => {
    if (typeof window === "undefined" || !window.speechSynthesis) return;
    if (activeUtterance.current?.text === text) return;

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

  useEffect(() => {
    if (!state.readAloud) {
      activeUtterance.current = null;
      window.speechSynthesis?.cancel();
      return;
    }

    const handleFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const text = getSpeakableText(target);
      if (text) speak(text);
    };

    const handleMouseOver = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;

      const interactive = target.closest(
        "button, a, [role='button'], [role='link'], input, textarea, select"
      );
      if (!interactive || interactive !== target) return;

      const text = getSpeakableText(interactive);
      if (text) speak(text);
    };

    document.addEventListener("focusin", handleFocusIn);
    document.addEventListener("mouseover", handleMouseOver);

    return () => {
      document.removeEventListener("focusin", handleFocusIn);
      document.removeEventListener("mouseover", handleMouseOver);
      activeUtterance.current = null;
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
      setFontScale
    }),
    [
      state,
      toggleDarkMode,
      toggleHighContrast,
      toggleEasyMode,
      toggleReadAloud,
      increaseFontScale,
      decreaseFontScale,
      setFontScale
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
