"use client";

import { useAccessibility, FONT_SCALE_MIN, FONT_SCALE_MAX } from "@/context/AccessibilityContext";

const TOGGLES = [
  {
    key: "readAloud" as const,
    label: "음성 읽어주기",
    description: "화면의 글·카드를 누르면 그 내용을 읽고, 다음 내용 읽기로 이어서 들을 수 있습니다",
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
    description: "어두운 테마로 표시합니다",
    toggle: "toggleDarkMode" as const
  }
];

export function DisplaySettingsSection() {
  const {
    readAloud,
    highContrast,
    darkMode,
    fontScale,
    toggleReadAloud,
    toggleHighContrast,
    toggleDarkMode,
    increaseFontScale,
    decreaseFontScale
  } = useAccessibility();

  const values = { readAloud, highContrast, darkMode };
  const toggles = {
    toggleReadAloud,
    toggleHighContrast,
    toggleDarkMode
  };

  return (
    <div className="max-w-xl space-y-2">
      <p className="text-stone mb-3 text-xs">변경 내용은 바로 적용되며 계정에 저장됩니다.</p>

      {TOGGLES.map(({ key, label, description, toggle }) => (
        <button
          key={key}
          type="button"
          onClick={toggles[toggle]}
          className="hover:bg-surface-soft border-hairline flex w-full items-center justify-between rounded-xl border px-4 py-3 transition-colors"
          aria-pressed={values[key]}
        >
          <div className="text-left">
            <p className="text-ink text-sm font-semibold">{label}</p>
            <p className="text-stone text-xs">{description}</p>
          </div>
          <div
            className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${
              values[key] ? "bg-brand-500" : "bg-gray-200"
            }`}
            aria-hidden
          >
            <span
              className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${
                values[key] ? "left-5" : "left-1"
              }`}
            />
          </div>
        </button>
      ))}

      <div className="border-hairline flex w-full items-center justify-between rounded-xl border px-4 py-3">
        <div className="text-left">
          <p className="text-ink text-sm font-semibold">화면 확대</p>
          <p className="text-stone text-xs">텍스트 크기를 조절합니다</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={decreaseFontScale}
            disabled={fontScale <= FONT_SCALE_MIN}
            className="border-hairline flex h-8 w-8 items-center justify-center rounded-md border bg-gray-100 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="화면 축소"
          >
            −
          </button>
          <span
            className="w-12 text-center text-sm font-semibold text-gray-800 tabular-nums"
            aria-live="polite"
          >
            {fontScale}%
          </span>
          <button
            type="button"
            onClick={increaseFontScale}
            disabled={fontScale >= FONT_SCALE_MAX}
            className="border-hairline flex h-8 w-8 items-center justify-center rounded-md border bg-gray-100 text-sm font-bold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-not-allowed disabled:opacity-40"
            aria-label="화면 확대"
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
