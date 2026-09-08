"use client";

import { BookOpenCheck } from "lucide-react";
import { useAccessibility, FONT_SCALE_MIN, FONT_SCALE_MAX } from "@/context/AccessibilityContext";

const settingsConfig = [
  {
    key: "readAloud" as const,
    label: "음성 읽어주기",
    description: "화면의 글·카드를 누르면 그 내용을 읽습니다",
    toggle: "toggleReadAloud" as const
  },
  {
    key: "highContrast" as const,
    label: "고대비",
    description: "글자·테두리·면 구분을 더 또렷하게",
    toggle: "toggleHighContrast" as const
  },
  {
    key: "darkMode" as const,
    label: "다크모드",
    description: "어두운 테마",
    toggle: "toggleDarkMode" as const
  }
];

interface Props {
  onClose: () => void;
}

export default function AccessibilitySettings({ onClose }: Props) {
  const {
    readAloud,
    highContrast,
    darkMode,
    easyMode,
    fontScale,
    toggleReadAloud,
    toggleHighContrast,
    toggleDarkMode,
    toggleEasyMode,
    increaseFontScale,
    decreaseFontScale,
    speakNext,
    canSpeakNext
  } = useAccessibility();

  const values = { readAloud, highContrast, darkMode };
  const toggles = {
    toggleReadAloud,
    toggleHighContrast,
    toggleDarkMode
  };

  return (
    <>
      <div className="fixed inset-0 z-40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-label="접근성 설정"
        data-a11y-chrome
        className="border-hairline absolute top-full right-4 z-50 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-xl border bg-white p-3 shadow-lg"
      >
        <p className="text-stone mb-2 px-1 text-xs font-semibold">접근성 설정</p>
        <div className="space-y-1">
          {settingsConfig.map(({ key, label, description, toggle }) => (
            <button
              key={key}
              type="button"
              onClick={toggles[toggle]}
              className="hover:bg-surface flex w-full items-center justify-between rounded-lg px-2 py-2 transition-colors"
              aria-pressed={values[key]}
            >
              <div className="text-left">
                <p className="text-ink text-sm font-medium">{label}</p>
                <p className="text-stone text-xs">{description}</p>
              </div>
              <div
                className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
                  values[key] ? "bg-brand-500" : "bg-gray-200"
                }`}
                aria-hidden="true"
              >
                <span
                  className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                    values[key] ? "left-5" : "left-1"
                  }`}
                />
              </div>
            </button>
          ))}

          {readAloud ? (
            <button
              type="button"
              data-a11y-speak-next
              onClick={speakNext}
              disabled={!canSpeakNext}
              className="border-hairline text-ink hover:bg-surface disabled:text-stone mt-1 w-full rounded-lg border px-2 py-2 text-left text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            >
              다음 내용 읽기
              <span className="text-stone mt-0.5 block text-xs font-normal">
                방금 읽은 칸의 다음 글을 이어서 듣습니다
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={toggleEasyMode}
            className={`focus-visible:outline-brand-600 flex min-h-16 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ${
              easyMode
                ? "border-brand-800 bg-brand-50 text-brand-900"
                : "border-hairline text-ink hover:border-brand-300 hover:bg-brand-50 bg-white"
            }`}
            aria-pressed={easyMode}
            aria-label={easyMode ? "쉬운 화면 끄기" : "쉬운 화면 켜기"}
          >
            <span
              className={`grid size-11 shrink-0 place-items-center rounded-xl ${
                easyMode ? "bg-brand-700 text-white" : "text-brand-800 bg-gray-100"
              }`}
              aria-hidden="true"
            >
              <BookOpenCheck className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-semibold">
                {easyMode ? "쉬운 화면 사용 중" : "쉬운 화면"}
              </span>
              <span className="text-steel block text-sm leading-5">
                {easyMode ? "누르면 기본 화면으로 돌아가요" : "글자와 버튼을 크게 보여줘요"}
              </span>
            </span>
            <span
              className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
                easyMode ? "bg-brand-700" : "bg-gray-200"
              }`}
              aria-hidden="true"
            >
              <span
                className={`absolute top-1 size-5 rounded-full bg-white shadow transition-transform duration-200 ${
                  easyMode ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </span>
          </button>

          <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg px-2 py-2">
            <div className="text-left">
              <p className="text-ink text-sm font-medium">화면 확대</p>
              <p className="text-stone text-xs">텍스트 크기 조절</p>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <button
                type="button"
                onClick={decreaseFontScale}
                disabled={fontScale <= FONT_SCALE_MIN}
                className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="화면 축소"
              >
                −
              </button>
              <span
                className="w-10 text-center text-sm font-semibold text-gray-800 tabular-nums"
                aria-live="polite"
              >
                {fontScale}%
              </span>
              <button
                type="button"
                onClick={increaseFontScale}
                disabled={fontScale >= FONT_SCALE_MAX}
                className="flex h-12 w-12 items-center justify-center rounded-md bg-gray-100 text-lg font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
                aria-label="화면 확대"
              >
                +
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
