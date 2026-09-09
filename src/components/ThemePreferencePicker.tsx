"use client";

import { useEffect, useState } from "react";
import { fetchThemePreferenceOptions } from "@/lib/supabase/codes";

type ThemePreferencePickerProps = {
  value: string[];
  onChange: (themes: string[]) => void;
  disabled?: boolean;
  /** 마이페이지 pill 스타일 vs 온보딩/가입 기본 */
  variant?: "pill" | "chip";
  label?: string;
  hint?: string;
  /** 옵션 목록에 없는 기존 저장값도 선택 상태로 표시 */
  showLegacyValues?: boolean;
  /** 선택되지 않은 항목은 새로 선택 불가 (해제만 허용) */
  lockUnselected?: boolean;
};

export default function ThemePreferencePicker({
  value,
  onChange,
  disabled = false,
  variant = "chip",
  label = "선호 테마",
  hint = "관심 있는 테마를 모두 선택해 주세요 (선택 사항)",
  showLegacyValues = false,
  lockUnselected = false
}: ThemePreferencePickerProps) {
  const [options, setOptions] = useState<{ code_id: string; code_nm: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchThemePreferenceOptions()
      .then((themes) => {
        if (!cancelled) {
          setOptions(themes);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("테마 목록을 불러오지 못했습니다.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const optionNames = new Set(options.map((o) => o.code_nm));
  const legacySelected = showLegacyValues ? value.filter((v) => !optionNames.has(v)) : [];

  const toggle = (name: string) => {
    if (disabled) return;
    if (lockUnselected && !value.includes(name)) return;
    onChange(value.includes(name) ? value.filter((x) => x !== name) : [...value, name]);
  };

  const activeClass =
    variant === "pill"
      ? "bg-brand-600 text-white"
      : "bg-brand-50 text-brand-700 ring-1 ring-brand-300";
  const inactiveClass =
    variant === "pill"
      ? "border-hairline border bg-gray-100 text-gray-600 hover:bg-gray-200"
      : "border-hairline border bg-gray-100 text-gray-600 hover:bg-gray-200";

  return (
    <div>
      {label && <p className="mb-1 text-xs font-semibold text-gray-500">{label}</p>}
      {hint && <p className="mb-2 text-xs text-gray-400">{hint}</p>}

      {loading && <p className="text-xs text-gray-400">테마 목록 불러오는 중...</p>}
      {loadError && (
        <p className="text-xs text-red-600" role="alert">
          {loadError}
        </p>
      )}

      {!loading && !loadError && (
        <div className="flex flex-wrap gap-2">
          {options.map(({ code_id, code_nm }) => {
            const on = value.includes(code_nm);
            const isLocked = lockUnselected && !on;
            return (
              <button
                key={code_id}
                type="button"
                disabled={disabled || isLocked}
                onClick={() => toggle(code_nm)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  on ? activeClass : inactiveClass
                }`}
              >
                {code_nm}
              </button>
            );
          })}
          {legacySelected.map((name) => (
            // legacySelected는 항상 이미 선택된 값만 포함
            <button
              key={`legacy-${name}`}
              type="button"
              disabled={disabled}
              onClick={() => toggle(name)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                value.includes(name) ? activeClass : inactiveClass
              }`}
            >
              {name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
