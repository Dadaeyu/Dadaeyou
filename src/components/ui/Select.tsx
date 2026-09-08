"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

import { cn } from "./utils";
import { usePopoverPosition } from "./usePopoverPosition";

export interface SelectOption {
  value: string;
  label: React.ReactNode;
  /** 목록에서 읽을 텍스트가 label(JSX 등)과 다를 때만 지정한다. 없으면 텍스트 내용을 그대로 읽는다. */
  ariaLabel?: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  /** 트리거를 호버·클릭했을 때 앞에 붙는 라벨(예: "시작 시각"). 선택값은 자동으로 뒤에 붙는다. */
  ariaLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  listClassName?: string;
  hideChevron?: boolean;
}

// 네이티브 <select>는 열린 옵션 목록이 OS/브라우저가 그리는 팝업이라 다대유 자체 화면 읽기가
// 닿지 못한다(닫혀 있을 때 선택값만 읽을 수 있음). 시각/동작은 기존 select와 동일하게 두고
// 목록을 직접 그려서, 목록이 열렸을 때 마우스가 올라간 옵션 하나하나까지 호버 읽기가 닿게 한다.
export function Select({
  value,
  onChange,
  options,
  ariaLabel,
  placeholder,
  disabled,
  className,
  listClassName,
  hideChevron
}: SelectProps) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listboxId = useId();

  const selected = options.find((o) => o.value === value);
  const pos = usePopoverPosition(open, triggerRef, listRef);

  useEffect(() => {
    if (!open) return;
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (!containerRef.current?.contains(target) && !listRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === value)
    );
    setHighlighted(idx);
    listRef.current?.focus();
  }, [open, options, value]);

  const commit = (option: SelectOption) => {
    onChange(option.value);
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onTriggerKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen(true);
    }
  };

  const onListKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => Math.min(options.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => Math.max(0, i - 1));
    } else if (e.key === "Home") {
      e.preventDefault();
      setHighlighted(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setHighlighted(options.length - 1);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const option = options[highlighted];
      if (option) commit(option);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (e.key === "Tab") {
      setOpen(false);
    }
  };

  const selectedText =
    selected?.ariaLabel ?? (typeof selected?.label === "string" ? selected.label : undefined);
  const triggerAriaLabel = ariaLabel
    ? [ariaLabel, selectedText].filter(Boolean).join(", ")
    : selectedText;

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-label={triggerAriaLabel || undefined}
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        onKeyDown={onTriggerKeyDown}
        className={cn(
          "border-hairline focus:ring-brand-500 flex h-10 w-full items-center justify-between gap-1 rounded-lg border bg-white px-2 text-xs focus:ring-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <span className={cn("truncate text-left", !selected && "text-stone")}>
          {selected?.label ?? placeholder}
        </span>
        {!hideChevron && (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "text-stone h-3.5 w-3.5 shrink-0 transition-transform",
              open && "rotate-180"
            )}
          />
        )}
      </button>

      {open &&
        createPortal(
          <ul
            ref={listRef}
            id={listboxId}
            role="listbox"
            tabIndex={-1}
            aria-label={ariaLabel}
            onKeyDown={onListKeyDown}
            style={{
              position: "fixed",
              top: pos?.top ?? -9999,
              left: pos?.left ?? -9999,
              width: pos?.width,
              visibility: pos ? "visible" : "hidden"
            }}
            className={cn(
              "border-hairline z-50 max-h-56 overflow-auto rounded-lg border bg-white py-1 shadow-lg focus:outline-none",
              listClassName
            )}
          >
            {options.map((option, index) => (
              <li
                key={option.value}
                role="option"
                aria-selected={option.value === value}
                data-speakable
                aria-label={option.ariaLabel}
                onMouseEnter={() => setHighlighted(index)}
                onClick={() => commit(option)}
                className={cn(
                  "cursor-pointer px-3 py-2 text-xs",
                  index === highlighted && "bg-surface",
                  option.value === value ? "text-ink font-semibold" : "text-slate"
                )}
              >
                {option.label}
              </li>
            ))}
          </ul>,
          document.body
        )}
    </div>
  );
}
