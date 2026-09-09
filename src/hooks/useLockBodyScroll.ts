"use client";

import { useEffect } from "react";

// 지도/코스 화면처럼 자체적으로 완결된 고정 높이 레이아웃(내부 overflow-hidden 컨테이너가
// 스크롤을 전담)을 쓰는 화면에서, 헤더/시트 여백 계산이 픽셀 단위로 아주 살짝만 어긋나도
// <body>가 그만큼 미세하게 스크롤 가능해져 버린다(스크롤바가 살짝 생기고 몇 px만 움직이는
// 현상). 이 화면이 떠 있는 동안은 body 스크롤 자체를 잠가서, 그 미세한 오차가 있어도 페이지가
// 넘치지 않고 잘리도록 한다.
export function useLockBodyScroll(enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const { style } = document.body;
    const prevOverflow = style.overflow;
    style.overflow = "hidden";
    return () => {
      style.overflow = prevOverflow;
    };
  }, [enabled]);
}
