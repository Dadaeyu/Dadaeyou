"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { totalPages as calcTotalPages } from "@/lib/pagination";

type ListPaginationProps = {
  page: number;
  total: number;
  pageSize: number;
  disabled?: boolean;
  onChange: (page: number) => void;
  // 좁은 사이드바(지도 검색 결과 하단 등)용 — 버튼/여백을 줄여 영역 높이를 낮춘다.
  compact?: boolean;
};

export function ListPagination({
  page,
  total,
  pageSize,
  disabled = false,
  onChange,
  compact = false
}: ListPaginationProps) {
  const pages = calcTotalPages(total, pageSize);
  if (total <= pageSize) return null;

  return (
    <div className={`flex items-center justify-center gap-2 ${compact ? "py-1" : "pt-2"}`}>
      <Button
        variant="outline"
        size={compact ? "iconSm" : "sm"}
        disabled={disabled || page <= 0}
        onClick={() => onChange(page - 1)}
        aria-label="이전 페이지"
      >
        <ChevronLeft className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </Button>
      <span
        className={`text-stone ${compact ? "text-xs" : "text-sm"}`}
        data-speakable="true"
        tabIndex={0}
        aria-label={`현재 ${page + 1}페이지, 총 ${pages}페이지`}
      >
        {page + 1} / {pages}
      </span>
      <Button
        variant="outline"
        size={compact ? "iconSm" : "sm"}
        disabled={disabled || page >= pages - 1}
        onClick={() => onChange(page + 1)}
        aria-label="다음 페이지"
      >
        <ChevronRight className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
      </Button>
    </div>
  );
}
