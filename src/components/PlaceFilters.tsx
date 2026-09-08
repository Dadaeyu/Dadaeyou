"use client";

// 장소 필터(접근성/인원수/테마/위치/일정/별점/즐겨찾기) 상태 훅과 필터 UI 필드 모음.
import { useState } from "react";
import { Plus, Minus, Star, Heart } from "lucide-react";
import { useFilterOptions } from "@/lib/filterOptions";
import { resolveEndAfterStartChange } from "@/lib/date-range";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";

export const AGE_GROUPS = ["영유아", "어린이", "청소년", "성인", "고령자"];

export interface Filters {
  accessibility: string[];
  gu: string;
  dong: string;
  themes: string[];
  headcount: number;
  dateFrom: string;
  dateTo: string;
  minRating: number;
  favoritesOnly: boolean;
}

export const DEFAULT_FILTERS: Filters = {
  accessibility: [],
  gu: "",
  dong: "",
  themes: [],
  headcount: 1,
  dateFrom: "",
  dateTo: "",
  minRating: 0,
  favoritesOnly: false
};

// 필터 상태 관리 훅. hotFilter처럼 화면 고유의 필터는 activeCount에 포함하지 않으므로,
// 소비하는 쪽에서 필요 시 더해서 써야 한다.
export function useFilters(initial?: Partial<Filters>) {
  const [filters, setFilters] = useState<Filters>({ ...DEFAULT_FILTERS, ...initial });

  const set = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setFilters((prev) => ({ ...prev, [key]: val }));

  const toggleList = (key: "themes" | "accessibility", item: string) =>
    setFilters((prev) => {
      const list = prev[key] as string[];
      return {
        ...prev,
        [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
      };
    });

  const reset = () => setFilters(DEFAULT_FILTERS);

  const activeCount = [
    filters.accessibility.length > 0,
    filters.gu || filters.dong, // 위치(구/동)는 하나로 카운트
    filters.themes.length > 0,
    filters.headcount > 1,
    filters.dateFrom || filters.dateTo,
    filters.minRating > 0,
    filters.favoritesOnly
  ].filter(Boolean).length;

  return { filters, setFilters, set, toggleList, reset, activeCount };
}

export function FilterFields({
  filters,
  set,
  toggleList,
  guOptions = [],
  dongOptions = [],
  compact = false,
  hideRating = false,
  hideFavorites = false
}: {
  filters: Filters;
  set: <K extends keyof Filters>(key: K, val: Filters[K]) => void;
  toggleList: (key: "themes" | "accessibility", item: string) => void;
  guOptions?: string[];
  dongOptions?: string[];
  compact?: boolean;
  hideRating?: boolean; // 별점 필터를 지원하지 않는 화면(예: AI 추천 코스)에서 숨긴다.
  hideFavorites?: boolean; // 즐겨찾기 필터를 지원하지 않는 화면에서 숨긴다.
}) {
  // 접근성 · 테마 옵션은 전역 캐시에서 가져온다 (브라우저 첫 진입 시 1회 조회).
  const { accessibility: accessOptions, themes: themeOptions } = useFilterOptions();

  const xs = compact ? "text-xs" : "text-sm";
  const chip = (active: boolean) =>
    `px-2 py-1 ${compact ? "text-xs" : "text-sm"} rounded-full border transition-colors ${
      active
        ? "bg-brand-500 text-ink border-brand-500"
        : "bg-white text-steel border-hairline hover:border-brand-400 hover:text-brand-600"
    }`;

  // wide(non-compact): 접근성·테마는 칩이 줄바꿈돼야 하니 각각 전체 너비 한 줄씩 쓰고,
  // 나머지(인원수/위치/일정/별점/즐겨찾기)는 짧은 컨트롤들이라 하나의 flex-wrap 줄에 몰아넣어
  // 너비가 넉넉하면 한 줄에, 좁으면 자동으로 다음 줄로 넘어가게 한다(빈 공백·불필요한 줄바꿈 방지).
  const rowsWrap = compact ? "space-y-3" : "space-y-4";
  const row = compact ? "space-y-3" : "flex flex-wrap items-start gap-x-8 gap-y-3";

  return (
    <div className={rowsWrap}>
      {/* 접근성 */}
      <div>
        <p className={`${xs} text-steel mb-1.5 font-semibold`}>접근성</p>
        <div className="flex flex-wrap gap-1">
          {accessOptions.map((a) => (
            <button
              key={a.code}
              onClick={() => toggleList("accessibility", a.code)}
              className={chip(filters.accessibility.includes(a.code))}
            >
              {a.name}
            </button>
          ))}
        </div>
      </div>

      {/* 테마 */}
      <div>
        <p className={`${xs} text-steel mb-1.5 font-semibold`}>테마</p>
        <div className="flex flex-wrap gap-1">
          {themeOptions.map((t) => (
            <button
              key={t.code}
              onClick={() => toggleList("themes", t.code)}
              className={chip(filters.themes.includes(t.code))}
            >
              {t.name}
            </button>
          ))}
        </div>
      </div>

      <div className={row}>
        {/* 인원수 */}
        <div>
          <p className={`${xs} text-steel mb-1.5 font-semibold`}>인원수</p>
          <div className="border-hairline flex h-10 w-fit items-center gap-1 rounded-lg border px-1.5">
            <button
              onClick={() => set("headcount", Math.max(1, filters.headcount - 1))}
              className="hover:bg-surface rounded p-0.5"
            >
              <Minus className="text-steel h-3 w-3" />
            </button>
            <input
              type="number"
              min={1}
              value={filters.headcount}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                set("headcount", Number.isFinite(n) && n > 0 ? n : 1);
              }}
              className={`${xs} w-10 [appearance:textfield] rounded text-center font-medium focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            />
            <span className={`${xs} text-steel`}>명</span>
            <button
              onClick={() => set("headcount", filters.headcount + 1)}
              className="hover:bg-surface rounded p-0.5"
            >
              <Plus className="text-steel h-3 w-3" />
            </button>
          </div>
        </div>

        {/* 위치 */}
        <div className={compact ? "" : "w-56"}>
          <p className={`${xs} text-steel mb-1.5 font-semibold`}>위치</p>
          <div className="flex gap-1.5">
            <div className="flex-1">
              <Select
                ariaLabel="구"
                value={filters.gu}
                onChange={(v) => {
                  set("gu", v);
                  set("dong", "");
                }}
                className={xs}
                options={[
                  { value: "", label: "구 전체" },
                  ...guOptions.map((d) => ({ value: d, label: d }))
                ]}
              />
            </div>
            <div className="flex-1">
              <Select
                ariaLabel="동"
                value={filters.dong}
                onChange={(v) => set("dong", v)}
                disabled={!filters.gu || dongOptions.length === 0}
                className={xs}
                options={[
                  { value: "", label: "동 전체" },
                  ...dongOptions.map((d) => ({ value: d, label: d }))
                ]}
              />
            </div>
          </div>
        </div>

        {/* 일정 */}
        <div className={compact ? "" : "w-56"}>
          <p className={`${xs} text-steel mb-1.5 font-semibold`}>날짜</p>
          <div className="flex items-center gap-1">
            <DateField
              ariaLabel="시작일"
              value={filters.dateFrom}
              max={filters.dateTo || undefined}
              onChange={(dateFrom) => {
                set("dateFrom", dateFrom);
                const nextTo = resolveEndAfterStartChange(dateFrom, filters.dateTo, true);
                if (nextTo !== filters.dateTo) set("dateTo", nextTo);
              }}
              className={xs}
            />
            <span className="text-stone shrink-0 text-xs">~</span>
            <DateField
              ariaLabel="종료일"
              value={filters.dateTo}
              min={filters.dateFrom || undefined}
              onChange={(dateTo) => {
                if (filters.dateFrom && dateTo && dateTo < filters.dateFrom) return;
                set("dateTo", dateTo);
              }}
              className={xs}
            />
          </div>
        </div>

        {/* 별점 */}
        {!hideRating && (
          <div>
            <p className={`${xs} text-steel mb-1.5 font-semibold`}>별점</p>
            <div className="flex h-10 items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button key={s} onClick={() => set("minRating", filters.minRating === s ? 0 : s)}>
                  <Star
                    className={`h-5 w-5 transition-colors ${s <= filters.minRating ? "fill-yellow-400 text-yellow-500" : "text-hairline"}`}
                  />
                </button>
              ))}
              {filters.minRating > 0 && (
                <span className="text-steel ml-1 text-xs">{filters.minRating}점↑</span>
              )}
            </div>
          </div>
        )}

        {/* 즐겨찾기 */}
        {!hideFavorites && (
          <div>
            <p className={`${xs} text-steel mb-1.5 font-semibold`}>즐겨찾기</p>
            <button
              onClick={() => set("favoritesOnly", !filters.favoritesOnly)}
              className={`flex h-10 items-center gap-1 rounded-full border px-2 text-xs transition-colors ${
                filters.favoritesOnly
                  ? "border-red-400 bg-red-50 text-red-600"
                  : "border-hairline text-steel bg-white hover:border-red-300 hover:text-red-500"
              }`}
            >
              <Heart
                className={`h-3.5 w-3.5 ${filters.favoritesOnly ? "fill-red-500 text-red-500" : ""}`}
              />
              즐겨찾기
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
