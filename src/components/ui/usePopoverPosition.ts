"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

export interface PopoverPosition {
  top: number;
  left: number;
  width: number;
}

/**
 * 필터 사이드바처럼 좁고 overflow가 걸린 컨테이너 안에서 뜨는 드롭다운/달력이 잘리지 않도록,
 * 트리거 기준 화면 좌표(position: fixed)로 위치를 계산한다. document.body에 포탈로 그리면
 * 부모의 overflow/좁은 너비에 더 이상 잘리지 않는다. 뷰포트 밖으로 나가면 반대 방향으로 뒤집는다.
 */
export function usePopoverPosition(
  open: boolean,
  triggerRef: RefObject<HTMLElement | null>,
  popoverRef: RefObject<HTMLElement | null>
): PopoverPosition | null {
  const [pos, setPos] = useState<PopoverPosition | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setPos(null);
      return;
    }

    const reposition = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const triggerRect = trigger.getBoundingClientRect();
      const popover = popoverRef.current;
      const margin = 8;
      const popWidth = popover?.offsetWidth ?? triggerRect.width;
      const popHeight = popover?.offsetHeight ?? 0;

      let left = triggerRect.left;
      if (left + popWidth > window.innerWidth - margin) {
        left = Math.max(margin, triggerRect.right - popWidth);
      }
      let top = triggerRect.bottom + 4;
      if (top + popHeight > window.innerHeight - margin) {
        top = Math.max(margin, triggerRect.top - popHeight - 4);
      }

      setPos((prev) =>
        prev && prev.top === top && prev.left === left && prev.width === triggerRect.width
          ? prev
          : { top, left, width: triggerRect.width }
      );
    };

    reposition();
    // 첫 계산은 팝오버 실제 크기를 모른 채(렌더 전) 트리거 위치만으로 어림한 값이라,
    // 렌더된 뒤 실제 크기로 한 번 더 보정한다.
    const raf = requestAnimationFrame(reposition);

    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
    };
  }, [open, triggerRef, popoverRef]);

  return pos;
}
