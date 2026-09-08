"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

import { cn } from "./utils";
import { usePopoverPosition } from "./usePopoverPosition";

interface DateFieldProps {
  value: string; // yyyy-mm-dd, 없으면 ""
  onChange?: (value: string) => void;
  ariaLabel?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** 값만 보여주고 클릭해도 달력이 열리지 않는다(입력은 막되 아이콘·스타일은 그대로 유지). */
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
}

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

function parseISODate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

// 네이티브 <input type="date">는 입력창 자체는 읽혀도, 열린 달력 팝업이 OS/브라우저 렌더링이라
// 다대유 자체 화면 읽기가 날짜 하나하나에 닿지 못한다. 시각적으로는 기존 date input과 같은
// 모양의 트리거를 두고, 달력은 직접 그려서 날짜 버튼 각각이 호버·클릭 읽기 대상이 되게 한다.
export function DateField({
  value,
  onChange,
  ariaLabel,
  min,
  max,
  disabled,
  readOnly,
  placeholder = "연도-월-일",
  className
}: DateFieldProps) {
  const canOpen = !disabled && !readOnly;
  const [open, setOpen] = useState(false);
  const selectedDate = useMemo(() => parseISODate(value), [value]);
  const minDate = useMemo(() => (min ? parseISODate(min) : null), [min]);
  const maxDate = useMemo(() => (max ? parseISODate(max) : null), [max]);
  const [viewMonth, setViewMonth] = useState(() => startOfMonth(selectedDate ?? new Date()));
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const pos = usePopoverPosition(open, triggerRef, popoverRef);

  useEffect(() => {
    if (open) setViewMonth(startOfMonth(selectedDate ?? new Date()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !popoverRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const days = useMemo(() => {
    const startWeekday = viewMonth.getDay();
    const daysInMonth = new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 0).getDate();
    const cells: Array<Date | null> = [];
    for (let i = 0; i < startWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push(new Date(viewMonth.getFullYear(), viewMonth.getMonth(), d));
    }
    return cells;
  }, [viewMonth]);

  const isDisabled = (date: Date) => {
    if (minDate && date < minDate) return true;
    if (maxDate && date > maxDate) return true;
    return false;
  };

  const today = new Date();

  const pick = (date: Date) => {
    if (isDisabled(date)) return;
    onChange?.(toISODate(date));
    setOpen(false);
    triggerRef.current?.focus();
  };

  const displayText = selectedDate ? value : placeholder;
  const triggerAriaLabel = ariaLabel
    ? `${ariaLabel}, ${selectedDate ? displayText : "선택 안 함"}`
    : undefined;

  return (
    <div ref={containerRef} className="relative min-w-0 flex-1">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup={canOpen ? "dialog" : undefined}
        aria-expanded={canOpen ? open : undefined}
        aria-controls={canOpen ? dialogId : undefined}
        aria-readonly={readOnly || undefined}
        aria-label={triggerAriaLabel}
        disabled={disabled}
        onClick={() => canOpen && setOpen((v) => !v)}
        className={cn(
          "border-hairline flex h-10 w-full items-center justify-between gap-1 rounded-lg border bg-white px-2 text-xs focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          canOpen ? "focus:ring-brand-500 focus:ring-2" : "cursor-default",
          className
        )}
      >
        <span className={cn("truncate", selectedDate ? "text-ink" : "text-stone")}>
          {displayText}
        </span>
        <Calendar aria-hidden="true" className="text-stone h-3.5 w-3.5 shrink-0" />
      </button>

      {open &&
        createPortal(
          <div
            ref={popoverRef}
            id={dialogId}
            role="dialog"
            aria-label={ariaLabel ? `${ariaLabel} 달력` : "날짜 선택"}
            data-speakable
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              visibility: pos ? "visible" : "hidden"
            }}
            className="border-hairline z-50 w-64 rounded-lg border bg-white p-3 shadow-lg"
          >
            <div className="mb-2 flex items-center justify-between">
              <button
                type="button"
                aria-label="이전 달"
                onClick={() =>
                  setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() - 1, 1))
                }
                className="hover:bg-surface rounded p-1"
              >
                <ChevronLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <p
                className="text-ink text-xs font-semibold"
                data-speakable
                aria-label={`${viewMonth.getFullYear()}년 ${viewMonth.getMonth() + 1}월`}
              >
                {viewMonth.getFullYear()}년 {viewMonth.getMonth() + 1}월
              </p>
              <button
                type="button"
                aria-label="다음 달"
                onClick={() =>
                  setViewMonth(new Date(viewMonth.getFullYear(), viewMonth.getMonth() + 1, 1))
                }
                className="hover:bg-surface rounded p-1"
              >
                <ChevronRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-y-1 text-center">
              {WEEKDAYS.map((w) => (
                <span key={w} aria-hidden="true" className="text-stone text-[10px] font-medium">
                  {w}
                </span>
              ))}
              {days.map((date, i) =>
                date ? (
                  <button
                    key={i}
                    type="button"
                    disabled={isDisabled(date)}
                    aria-label={`${date.getFullYear()}년 ${date.getMonth() + 1}월 ${date.getDate()}일`}
                    aria-current={isSameDay(date, today) ? "date" : undefined}
                    aria-selected={selectedDate ? isSameDay(date, selectedDate) : undefined}
                    onClick={() => pick(date)}
                    className={cn(
                      "mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-30",
                      selectedDate && isSameDay(date, selectedDate)
                        ? "bg-brand-500 text-ink font-semibold"
                        : isSameDay(date, today)
                          ? "text-brand-600 font-semibold"
                          : "text-slate hover:bg-surface"
                    )}
                  >
                    {date.getDate()}
                  </button>
                ) : (
                  <span key={i} aria-hidden="true" />
                )
              )}
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
