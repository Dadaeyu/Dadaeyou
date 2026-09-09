"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";

const PAGE_WINDOW_DESKTOP = 10;
const PAGE_WINDOW_MOBILE = 5;

// 모바일 폭(Tailwind sm 미만)에서는 페이지 버튼 10개 + 이동 버튼 4개가 한 줄에 안 들어가
// 잘리거나 어색하게 줄바꿈됐다. 화면 폭에 맞춰 한 번에 보여줄 페이지 번호 개수를 줄인다.
function usePageWindow(): number {
  const [pageWindow, setPageWindow] = useState(PAGE_WINDOW_DESKTOP);

  useEffect(() => {
    const mql = window.matchMedia("(max-width: 639px)");
    const update = () => setPageWindow(mql.matches ? PAGE_WINDOW_MOBILE : PAGE_WINDOW_DESKTOP);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return pageWindow;
}

type TablePaginationProps = {
  page: number;
  totalPages: number;
  total: number;
  pageSize: number;
  disabled?: boolean;
  onChange: (targetPage: number) => void;
};

export function TablePagination({
  page,
  totalPages: totalPagesCount,
  total,
  pageSize,
  disabled = false,
  onChange
}: TablePaginationProps) {
  const pageWindow = usePageWindow();
  const windowStart = Math.floor(page / pageWindow) * pageWindow;
  const windowEnd = Math.min(windowStart + pageWindow, totalPagesCount);
  const pages: number[] = [];
  for (let i = windowStart; i < windowEnd; i += 1) pages.push(i);

  const from = total === 0 ? 0 : page * pageSize + 1;
  const to = Math.min((page + 1) * pageSize, total);

  const navBtn =
    "border-hairline text-steel hover:bg-surface-soft flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors disabled:opacity-40 disabled:hover:bg-transparent";

  return (
    <div className="border-hairline-soft flex items-center justify-between gap-3 border-t px-4 py-3">
      <span className="text-stone text-xs">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => onChange(0)}
          disabled={disabled || page <= 0}
          aria-label="맨 앞"
          className={navBtn}
        >
          <ChevronsLeft className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(Math.max(0, windowStart - pageWindow))}
          disabled={disabled || windowStart <= 0}
          aria-label="이전 페이지들"
          className={navBtn}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onChange(p)}
            disabled={disabled}
            aria-current={p === page ? "page" : undefined}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full px-2 text-xs font-semibold transition-colors disabled:opacity-40 ${
              p === page
                ? "bg-navy-600 text-fixed-white"
                : "border-hairline text-steel hover:bg-surface-soft bg-background border"
            }`}
          >
            {p + 1}
          </button>
        ))}
        <button
          type="button"
          onClick={() => onChange(windowStart + pageWindow)}
          disabled={disabled || windowEnd >= totalPagesCount}
          aria-label="다음 페이지들"
          className={navBtn}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onChange(totalPagesCount - 1)}
          disabled={disabled || page >= totalPagesCount - 1}
          aria-label="맨 뒤"
          className={navBtn}
        >
          <ChevronsRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
