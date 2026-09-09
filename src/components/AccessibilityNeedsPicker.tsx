"use client";

import { useEffect, useState } from "react";
import { fetchAccessibilityNeedOptions } from "@/lib/supabase/codes";

type AccessibilityNeedsPickerProps = {
  value: string[];
  onChange: (needs: string[]) => void;
  disabled?: boolean;
  variant?: "pill" | "chip";
  label?: string;
  hint?: string;
  /** 옵션 목록에 없는 기존 저장값도 선택 상태로 표시 */
  showLegacyValues?: boolean;
  lockUnselected?: boolean;
};

export default function AccessibilityNeedsPicker({
  value,
  onChange,
  disabled = false,
  variant = "chip",
  label = "여행 접근성",
  hint = "필요한 접근성 항목을 모두 선택해 주세요 (선택 사항)",
  showLegacyValues = false,
  lockUnselected = false
}: AccessibilityNeedsPickerProps) {
  const [options, setOptions] = useState<{ code_id: string; code_nm: string }[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setLoading(true);
    });
    fetchAccessibilityNeedOptions()
      .then((items) => {
        if (!cancelled) {
          setOptions(items);
          setLoadError(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLoadError("접근성 목록을 불러오지 못했습니다.");
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

      {loading && <p className="text-xs text-gray-400">접근성 목록 불러오는 중...</p>}
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
