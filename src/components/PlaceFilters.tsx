"use client";

// 장소 필터(접근성/인원수/테마/위치/일정/별점/즐겨찾기) 상태 훅과 필터 UI 필드 모음.
import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronDown, Plus, Minus, Star, Heart } from "lucide-react";
import { useFilterOptions } from "@/lib/filterOptions";
import { resolveEndAfterStartChange } from "@/lib/date-range";
import { useAuth } from "@/context/AuthContext";
import { useAccessibility } from "@/context/AccessibilityContext";

export const AGE_GROUPS = ["영유아", "어린이", "청소년", "성인", "고령자"];

// 읽어주기용. "2026-08-22"를 "2026년 8월 22일"로 풀어 읽는다 — 0으로 시작하는 월/일을
// 그대로 읽으면 "영팔월"처럼 어색하게 읽히는 걸 피한다.
function formatDateForSpeech(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  if (!y || !m || !d) return dateStr;
  return `${y}년 ${m}월 ${d}일`;
}

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
  const { user } = useAuth();
  const { speak } = useAccessibility();
  const [favoritesLoginNotice, setFavoritesLoginNotice] = useState(false);
  const dateFromId = useId();
  const dateToId = useId();
  const dateFromRef = useRef<HTMLInputElement>(null);
  const dateToRef = useRef<HTMLInputElement>(null);

  // 기기마다 date input의 "박스 어디를 눌러야 피커가 열리는지"가 달라서(어떤 기기는 달력
  // 아이콘만 반응) 브라우저의 자체 클릭 판정에 의존하지 않고, 우리가 직접 그린 버튼을 눌렀을 때
  // 코드로 showPicker()를 호출해 무조건 열리게 한다. showPicker를 지원하지 않는 구형
  // 브라우저에서는 focus + click으로 폴백한다.
  const openDatePicker = (ref: React.RefObject<HTMLInputElement | null>) => {
    const el = ref.current;
    if (!el) return;
    const withPicker = el as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof withPicker.showPicker === "function") {
        withPicker.showPicker();
        return;
      }
    } catch {
      // showPicker가 있어도 상황에 따라 던질 수 있다 — 아래 폴백으로 넘어간다.
    }
    el.focus();
    el.click();
  };

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
              aria-label="인원수 줄이기"
              onClick={() => {
                const next = Math.max(1, filters.headcount - 1);
                set("headcount", next);
                speak(`인원수 ${next}명`);
              }}
              className="hover:bg-surface rounded p-0.5"
            >
              <Minus className="text-steel h-3 w-3" />
            </button>
            <input
              type="number"
              min={1}
              aria-label={`인원수 ${filters.headcount}명`}
              value={filters.headcount}
              onChange={(e) => {
                const n = Math.floor(Number(e.target.value));
                set("headcount", Number.isFinite(n) && n > 0 ? n : 1);
              }}
              className={`${xs} w-10 [appearance:textfield] rounded text-center font-medium focus:outline-none [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
            />
            <span className={`${xs} text-steel`}>명</span>
            <button
              aria-label="인원수 늘리기"
              onClick={() => {
                const next = filters.headcount + 1;
                set("headcount", next);
                speak(`인원수 ${next}명`);
              }}
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
            <div className="relative flex-1">
              <select
                value={filters.gu}
                onChange={(e) => {
                  set("gu", e.target.value);
                  set("dong", "");
                  speak(e.target.value ? `${e.target.value} 선택` : "구 전체 선택");
                }}
                className={`border-hairline h-10 w-full appearance-none rounded-lg border px-2 ${xs} focus:ring-brand-500 bg-white pr-6 focus:ring-2 focus:outline-none`}
              >
                <option value="">구 전체</option>
                {guOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown className="text-stone pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2" />
            </div>
            <div className="relative flex-1">
              <select
                value={filters.dong}
                onChange={(e) => {
                  set("dong", e.target.value);
                  speak(e.target.value ? `${e.target.value} 선택` : "동 전체 선택");
                }}
                disabled={!filters.gu || dongOptions.length === 0}
                className={`border-hairline h-10 w-full appearance-none rounded-lg border px-2 ${xs} focus:ring-brand-500 bg-white pr-6 focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50`}
              >
                <option value="">동 전체</option>
                {dongOptions.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <ChevronDown className="text-stone pointer-events-none absolute top-1/2 right-1.5 h-3 w-3 -translate-y-1/2" />
            </div>
          </div>
        </div>

        {/* 일정 */}
        <div className={compact ? "" : "w-56"}>
          <p className={`${xs} text-steel mb-1.5 font-semibold`}>일정</p>
          <div className="flex items-center gap-1">
            {/* 기기마다 네이티브 date input의 "박스 어디를 눌러야 피커가 열리는지"가 달라서
                (달력 아이콘만 반응하는 기기가 있음) 클릭 판정을 브라우저에 맡기지 않는다.
                진짜 input은 opacity-0 + pointer-events-none으로 완전히 숨기고(레이아웃엔
                남아 있어서 showPicker가 정상 동작함), 그 위에 직접 그린 버튼(텍스트+달력
                아이콘)을 올려서 어디를 눌러도 openDatePicker()가 코드로 피커를 연다. */}
            <div className="relative min-w-0 flex-1">
              <input
                ref={dateFromRef}
                id={dateFromId}
                type="date"
                value={filters.dateFrom}
                max={filters.dateTo || undefined}
                onChange={(e) => {
                  const dateFrom = e.target.value;
                  set("dateFrom", dateFrom);
                  const nextTo = resolveEndAfterStartChange(dateFrom, filters.dateTo, true);
                  if (nextTo !== filters.dateTo) set("dateTo", nextTo);
                  speak(
                    dateFrom ? `시작일 ${formatDateForSpeech(dateFrom)} 선택` : "시작일 선택 해제"
                  );
                }}
                className="pointer-events-none absolute inset-0 h-10 w-full opacity-0"
                tabIndex={-1}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => openDatePicker(dateFromRef)}
                aria-label={
                  filters.dateFrom
                    ? `시작일 ${formatDateForSpeech(filters.dateFrom)}`
                    : "시작일 선택 안 함"
                }
                className={`border-hairline flex h-10 w-full items-center justify-between gap-1 rounded-lg border bg-white px-2 ${xs} focus:ring-brand-500 focus:ring-2 focus:outline-none`}
              >
                <span className={filters.dateFrom ? "text-ink" : "text-stone"}>
                  {filters.dateFrom || "연도-월-일"}
                </span>
                <Calendar className="text-stone h-3.5 w-3.5 shrink-0" />
              </button>
            </div>
            <span className="text-stone shrink-0 text-xs">~</span>
            <div className="relative min-w-0 flex-1">
              <input
                ref={dateToRef}
                id={dateToId}
                type="date"
                value={filters.dateTo}
                min={filters.dateFrom || undefined}
                onChange={(e) => {
                  const dateTo = e.target.value;
                  if (filters.dateFrom && dateTo && dateTo < filters.dateFrom) return;
                  set("dateTo", dateTo);
                  speak(dateTo ? `종료일 ${formatDateForSpeech(dateTo)} 선택` : "종료일 선택 해제");
                }}
                className="pointer-events-none absolute inset-0 h-10 w-full opacity-0"
                tabIndex={-1}
                aria-hidden
              />
              <button
                type="button"
                onClick={() => openDatePicker(dateToRef)}
                aria-label={
                  filters.dateTo
                    ? `종료일 ${formatDateForSpeech(filters.dateTo)}`
                    : "종료일 선택 안 함"
                }
                className={`border-hairline flex h-10 w-full items-center justify-between gap-1 rounded-lg border bg-white px-2 ${xs} focus:ring-brand-500 focus:ring-2 focus:outline-none`}
              >
                <span className={filters.dateTo ? "text-ink" : "text-stone"}>
                  {filters.dateTo || "연도-월-일"}
                </span>
                <Calendar className="text-stone h-3.5 w-3.5 shrink-0" />
              </button>
            </div>
          </div>
        </div>

        {/* 별점 */}
        {!hideRating && (
          <div>
            <p className={`${xs} text-steel mb-1.5 font-semibold`}>별점</p>
            <div className="flex h-10 items-center gap-0.5">
              {[1, 2, 3, 4, 5].map((s) => (
                <button
                  key={s}
                  aria-label={`별점 ${s}점 이상`}
                  onClick={() => {
                    const next = filters.minRating === s ? 0 : s;
                    set("minRating", next);
                    speak(next > 0 ? `별점 ${next}점 선택` : "별점 선택 해제");
                  }}
                >
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
              onClick={() => {
                if (!user) {
                  // 비로그인은 즐겨찾기가 있을 수 없으니 필터를 켜지 않는다(지도는 그대로,
                  // 버튼도 활성화 표시되지 않음) — 안내만 보여준다.
                  setFavoritesLoginNotice(true);
                  setTimeout(() => setFavoritesLoginNotice(false), 2000);
                  return;
                }
                set("favoritesOnly", !filters.favoritesOnly);
              }}
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
            {favoritesLoginNotice &&
              createPortal(
                <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-xs whitespace-nowrap text-white shadow-lg">
                  로그인 후 이용 가능합니다
                </div>,
                document.body
              )}
          </div>
        )}
      </div>
    </div>
  );
}
