"use client";

// 카카오맵 SDK 래퍼: 마커/경로선/내 위치 표시를 관리하는 지도 컴포넌트.
import { useEffect, useRef, useState } from "react";
import { loadKakaoMap } from "@/lib/kakao/loadKakaoMap";
import {
  formatRouteDistance,
  formatRouteDuration,
  formatRouteTollFare,
  trafficStateToColor
} from "@/lib/kakao/directions";

export interface KakaoPlaceResult {
  id: string;
  place_name: string;
  category_name: string;
  phone: string;
  address_name: string;
  road_address_name: string;
  x: string;
  y: string;
}

// ── 공개 상수 ──────────────────────────────────────────────
// 대전광역시청 (대전 서구 둔산로 100)
export const MAP_CENTER = { lat: 36.3505389, lng: 127.384834846753 };
export const MAP_LEVEL = 8;

// ── 범용 마커 타입 ─────────────────────────────────────────
export interface MapMarker {
  id: string;
  lat: number;
  lng: number;
  color: string;
  shape?: "pin" | "dot" | "heart" | "teardrop";
  // pin: 원 테두리/중앙 점 색. teardrop: 중앙 점 색.
  borderColor?: string;
  /** 마커 안에 표시할 짧은 텍스트(예: 코스 방문 순서 번호). pin/dot에서만 그려진다. */
  label?: string;
  /** "sm"이면 살짝 작게 그린다(예: 선택되지 않은 Day를 옅게 보여줄 때). 기본 "md". */
  size?: "sm" | "md";
  /** 겹칠 때 위/아래 순서(클수록 위). 기본 3, 선택된 마커는 항상 이 값과 무관하게 맨 위. */
  zIndex?: number;
}

// 경로선 한 구간(코스 일정용). points 가 2개 미만이면 그리지 않는다.
export interface MapPathSegment {
  points: { lat: number; lng: number }[];
  color?: string; // 기본 초록
  dashed?: boolean; // true 면 점선(Day 간 연결 구간 표시용)
  /** 자동차 안내 — 도로별 교통 혼잡도 (있으면 color 대신 구간별 색) */
  trafficChunks?: { points: { lat: number; lng: number }[]; trafficState: number }[];
  /** 이 구간에 마우스를 올렸을 때 커서 위치에 보여줄 라벨(예: "Day 1"). 없으면 호버해도 안 뜬다. */
  label?: string;
  /** 이 구간을 클릭했을 때 onPathClick 으로 전달할 값(예: Day 번호). label 이 있어야 클릭도 반응한다. */
  day?: number;
  /** 겹칠 때 위/아래 순서(클수록 위). 기본 점선=1, 실선=2. */
  zIndex?: number;
}

// ── Props ──────────────────────────────────────────────────
interface Props {
  markers?: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  onDeselect?: () => void;
  center?: { lat: number; lng: number };
  level?: number;
  myLocation?: { lat: number; lng: number } | null;
  focusMyLocationTrigger?: number;
  // 값이 바뀔 때마다(0 제외) 무조건 지도를 초기 중심·줌으로 되돌린다("초기화" 버튼 등 사용자가 직접 요청한 경우).
  resetViewTrigger?: number;
  // 값이 바뀔 때마다(0 제외) "지금 안 가려진 화면에 보여줄 장소가 하나도 없을 때만" 초기 화면으로
  // 되돌린다(검색/필터가 자동으로 트리거하는 리셋용) — 이미 보이는 장소가 있으면 사용자가 보던
  // 확대/위치를 그대로 유지한다.
  autoResetViewTrigger?: number;
  // 여러 구간의 경로선(코스 일정용). 구간별로 색상·점선 여부를 다르게 줄 수 있다.
  path?: MapPathSegment[];
  /** 경로선 구간(day 있는 것) 클릭 시 그 구간의 day 값을 전달한다. */
  onPathClick?: (day: number) => void;
  /** 값이 바뀌면 path 전체가 화면에 들어오도록 panTo(bounds). 안내 경로 전용 */
  fitPathKey?: string | number | null;
  /** 하단 시트 등 UI가 가리는 높이(px). 경로 맞춤 시 bottom padding으로 사용 */
  bottomOverlayPx?: number;
  /** 확대/축소 컨트롤(데스크탑 전용) 표시 여부. 기본 true — false면 데스크탑에서도 숨긴다. */
  showZoomControl?: boolean;
  /** 경로 중간점에 고정 표시할 거리·시간 요약 (네이버 지도 스타일 칩) */
  pathSummary?: { distanceM: number; durationSec: number; tollFare?: number } | null;
}

// ── 핀 렌더러 ──────────────────────────────────────────────
function renderDot(
  el: HTMLDivElement,
  color: string,
  selected: boolean,
  _borderColor?: string,
  label?: string,
  markerSize?: "sm" | "md"
) {
  const size = selected ? 20 : markerSize === "sm" ? 10 : 14;
  const labelEl = label
    ? `<div style="font-size:${Math.round(size / 1.9)}px;line-height:1;font-weight:700;color:white;">${label}</div>`
    : "";
  el.innerHTML = `
    <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:2.5px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.28);${selected ? `outline:3px solid ${color}55;outline-offset:1px;` : ""}cursor:pointer;transition:all 0.15s;display:flex;align-items:center;justify-content:center;">${labelEl}</div>`;
}

function renderHeart(
  el: HTMLDivElement,
  color: string,
  selected: boolean,
  _borderColor?: string,
  _label?: string,
  _markerSize?: "sm" | "md"
) {
  const size = selected ? 26 : 20;
  el.innerHTML = `
    <div style="cursor:pointer;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));${selected ? "transform:scale(1.15);" : ""}transition:transform 0.15s;">
      <svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="${color}" stroke="white" stroke-width="1.5">
        <path d="M12 21s-6.7-4.35-9.3-8.3C1.1 10.2 1.5 6.6 4.4 4.9c2.2-1.3 4.9-.7 6.4 1.2l1.2 1.5 1.2-1.5c1.5-1.9 4.2-2.5 6.4-1.2 2.9 1.7 3.3 5.3 1.7 7.8C18.7 16.65 12 21 12 21z"/>
      </svg>
    </div>`;
}

function getRenderer(shape?: "pin" | "dot" | "heart" | "teardrop") {
  if (shape === "dot") return renderDot;
  if (shape === "heart") return renderHeart;
  if (shape === "teardrop") return renderTeardrop;
  return renderPin;
}

// 카카오맵 스타일의 눈물방울 핀 — 단색 플랫 디자인, 중앙에 작은 원 하나만.
function renderTeardrop(
  el: HTMLDivElement,
  color: string,
  selected: boolean,
  dotColor = "#191919",
  _label?: string,
  _markerSize?: "sm" | "md"
) {
  const w = selected ? 34 : 28;
  const h = Math.round(w * 1.25);
  el.innerHTML = `
    <div style="cursor:pointer;filter:drop-shadow(0 3px 5px rgba(0,0,0,0.25));${selected ? "transform:scale(1.12);" : ""}transition:transform 0.15s;">
      <svg width="${w}" height="${h}" viewBox="0 0 24 24" fill="none">
        <path d="M12 2C7.58 2 4 5.58 4 10c0 6 8 12 8 12s8-6 8-12c0-4.42-3.58-8-8-8Z" fill="${color}"/>
        <circle cx="12" cy="10" r="3.2" fill="${dotColor}"/>
      </svg>
    </div>`;
}

function renderPin(
  el: HTMLDivElement,
  color: string,
  selected: boolean,
  borderColor = "white",
  label?: string,
  markerSize?: "sm" | "md"
) {
  const size = selected ? 36 : markerSize === "sm" ? 22 : 28;
  const tri = Math.round(size / 3);
  const sw = 1.5; // 삼각형 테두리 두께
  const dot = Math.round(size / 3.5);
  const ring = selected
    ? `box-shadow:0 0 0 6px ${color}30,0 2px 8px rgba(0,0,0,0.35);`
    : "box-shadow:0 2px 6px rgba(0,0,0,0.28);";
  // 라벨(순서 번호)의 글자색은 borderColor 를 그대로 쓰면 기본값(white)일 때 흰 배경 위에
  // 흰 글씨가 돼서 안 보인다 — 항상 보이도록 마커 자체 색(color)을 쓴다.
  // 박스/글자 크기는 dot(size/3.5)에 "+4"를 더해서 구했었는데, 그 고정 오프셋 때문에 선택 시
  // 바깥 원(size)은 28→36으로 커져도 안쪽 숫자는 거의 안 커 보였다 — 바깥 원과 같은 비율로
  // 커지도록 size에서 직접 비례식으로 계산한다.
  const labelBoxSize = Math.round(size * 0.42);
  const centerDot = label
    ? `<div style="width:${labelBoxSize}px;height:${labelBoxSize}px;background:white;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:${Math.round(labelBoxSize * 0.65)}px;font-weight:800;color:${color};line-height:1;">${label}</div>`
    : `<div style="width:${dot}px;height:${dot}px;background:${borderColor};border-radius:50%;"></div>`;
  const triW = tri * 2;
  const triH = tri;
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;${selected ? "transform:scale(1.15);" : ""}transition:transform 0.15s;">
      <div style="width:${size}px;height:${size}px;border-radius:50%;background:${color};border:3px solid ${borderColor};${ring}display:flex;align-items:center;justify-content:center;">
        ${centerDot}
      </div>
      <svg width="${triW + sw * 2}" height="${triH + sw * 2}" viewBox="-${sw} -${sw} ${triW + sw * 2} ${triH + sw * 2}" style="margin-top:-3px;display:block;">
        <polygon points="0,0 ${triW},0 ${triW / 2},${triH}" fill="${color}" stroke="${borderColor}" stroke-width="${sw}" stroke-linejoin="round"/>
      </svg>
    </div>`;
}

function createMyLocationEl(): HTMLDivElement {
  const el = document.createElement("div");
  el.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;">
      <div style="position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;inset:0;border-radius:50%;background:#3b82f6;opacity:0.18;"></div>
        <div style="position:absolute;inset:4px;border-radius:50%;background:#3b82f6;opacity:0.28;"></div>
        <div style="width:12px;height:12px;border-radius:50%;background:#2563eb;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);position:relative;z-index:1;"></div>
      </div>
      <div style="font-size:10px;color:#1d4ed8;font-weight:600;margin-top:1px;white-space:nowrap;background:rgba(255,255,255,0.85);padding:1px 4px;border-radius:3px;">현재 위치</div>
    </div>`;
  return el;
}

// ── 컴포넌트 ───────────────────────────────────────────────
export default function KakaoMap({
  markers = [],
  selectedId = null,
  onSelect,
  onDeselect,
  center = MAP_CENTER,
  level = MAP_LEVEL,
  myLocation = null,
  focusMyLocationTrigger = 0,
  resetViewTrigger = 0,
  autoResetViewTrigger = 0,
  path = [],
  onPathClick,
  fitPathKey = null,
  bottomOverlayPx = 0,
  showZoomControl = true,
  pathSummary = null
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<kakao.maps.Map | null>(null);
  const onDeselectRef = useRef(onDeselect);
  const overlaysRef = useRef<kakao.maps.CustomOverlay[]>([]);
  const markerElemsRef = useRef(new Map<string, HTMLDivElement>());
  const pathPolylinesRef = useRef<kakao.maps.Polyline[]>([]);
  // 경로선 호버 시 커서 위치에 뜨는 라벨 — 한 번에 하나만 필요해서 배열이 아니라 단일 참조.
  const pathHoverOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const pathHoverElRef = useRef<HTMLDivElement | null>(null);
  const pathSummaryOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const myLocationOverlayRef = useRef<kakao.maps.CustomOverlay | null>(null);
  const zoomControlRef = useRef<kakao.maps.ZoomControl | null>(null);
  const [mapInitCount, setMapInitCount] = useState(0);
  const [mapLoadFailed, setMapLoadFailed] = useState(false);

  useEffect(() => {
    onDeselectRef.current = onDeselect;
  }, [onDeselect]);

  useEffect(() => {
    let cancelled = false;

    loadKakaoMap()
      .then((kakaoSdk) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        setMapLoadFailed(false);
        const K = kakaoSdk.maps;
        const map = new K.Map(containerRef.current, {
          center: new K.LatLng(center.lat, center.lng),
          level
        });
        mapRef.current = map;
        K.event.addListener(map, "click", () => onDeselectRef.current?.());
        setMapInitCount((count) => count + 1);
      })
      .catch(() => {
        if (!cancelled) setMapLoadFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [center.lat, center.lng, level]);

  // 컨테이너 크기 변경 시(상단 50% 분할 등) 지도 재배치 후 선택 마커를 보이는 영역 중앙에 맞춤
  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    let timer = 0;
    const ro = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const map = mapRef.current;
        if (!map || !window.kakao?.maps) return;
        map.relayout();
        if (fitPathKey != null && fitPathKey !== "") return;
        if (!selectedId) return;
        const marker = markers.find((m) => m.id === selectedId);
        if (!marker) return;
        const K = window.kakao.maps;
        centerLatLngInVisibleMap(
          map,
          new K.LatLng(marker.lat, marker.lng),
          initialBottomOverlayPxRef.current ?? bottomOverlayPxRef.current
        );
      }, 50);
    });
    ro.observe(el);
    return () => {
      window.clearTimeout(timer);
      ro.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInitCount, selectedId, fitPathKey]);

  // 확대/축소 +/- 컨트롤 표시 여부 — 지도 기능 드롭다운의 "확대/축소" 토글로 켜고 끈다.
  // (예전엔 모바일에서 핀치 줌으로 충분하다고 데스크탑에서만 보이게 막아뒀는데, 이제 그 토글
  // 자체가 모바일에서도 선택적으로 켤 수 있는 기능이라 화면 크기로 다시 막지 않는다.)
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;
    const map = mapRef.current;

    if (showZoomControl) {
      if (!zoomControlRef.current) {
        zoomControlRef.current = new K.ZoomControl();
        map.addControl(zoomControlRef.current, K.ControlPosition.TOPRIGHT);
      }
    } else if (zoomControlRef.current) {
      map.removeControl(zoomControlRef.current);
      zoomControlRef.current = null;
    }
  }, [mapInitCount, showZoomControl]);

  // 마커 동기화
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;

    overlaysRef.current.forEach((o) => o.setMap(null));
    overlaysRef.current = [];
    markerElemsRef.current.clear();

    markers.forEach((marker) => {
      const el = document.createElement("div");
      markerElemsRef.current.set(marker.id, el);
      const render = getRenderer(marker.shape);
      render(
        el,
        marker.color,
        marker.id === selectedId,
        marker.borderColor,
        marker.label,
        marker.size
      );

      const overlay = new K.CustomOverlay({
        position: new K.LatLng(marker.lat, marker.lng),
        content: el,
        yAnchor: marker.shape === "dot" || marker.shape === "heart" ? 0.5 : 1,
        xAnchor: 0.5,
        zIndex: marker.id === selectedId ? 6 : (marker.zIndex ?? 3),
        // 마커 클릭이 지도 클릭(onDeselect)으로 이어지지 않게 함 → 다른 마커 클릭 시 바로 그 상세로 전환.
        clickable: true
      });
      overlay.setMap(mapRef.current!);
      overlaysRef.current.push(overlay);

      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelect?.(marker.id);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInitCount, markers, selectedId]);

  // 선택 상태 시각 업데이트
  useEffect(() => {
    markers.forEach((marker) => {
      const el = markerElemsRef.current.get(marker.id);
      if (!el) return;
      const render = getRenderer(marker.shape);
      render(
        el,
        marker.color,
        marker.id === selectedId,
        marker.borderColor,
        marker.label,
        marker.size
      );
    });
  }, [selectedId, markers]);

  // [줌-투-마커] selectedId 변경 시 해당 마커로 줌인 — 경로 맞춤 중이면 스킵
  // 모바일 하단 시트가 떠 있으면 기하 중심이 아니라, 시트가 처음 뜬 기본 높이 기준으로
  // "안 가려진 영역"의 중앙에 마커가 오도록 보정한다(사용자가 시트를 드래그해 늘려놔도 그 값은 안 씀).
  // fitPathKey는 deps에 넣지 않음: 안내 종료 시 마커로 다시 점프하지 않게
  useEffect(() => {
    if (fitPathKey != null && fitPathKey !== "") return;
    if (!selectedId || !mapRef.current || !window.kakao?.maps) return;
    const marker = markers.find((m) => m.id === selectedId);
    if (!marker) return;
    const K = window.kakao.maps;
    mapRef.current.setLevel(5, { animate: true });
    centerLatLngInVisibleMap(
      mapRef.current,
      new K.LatLng(marker.lat, marker.lng),
      initialBottomOverlayPxRef.current ?? bottomOverlayPxRef.current
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, mapInitCount]);

  // 코스 경로선 — 구간(path)별로 순서대로 잇는다(코스 일정 장소 순서). 구간마다 색상·점선 여부가 다를 수 있다.
  // 각 구간의 지점이 2개 미만이면 그 구간은 그리지 않음.
  // 구간 라벨(예: "Day 1")은 고정 위치가 아니라, 그 경로선에 마우스를 올렸을 때 커서가 있는
  // 지점에 붙여서 보여준다 — 노드(장소 마커) 위치와 안 겹치고, 어느 구간을 가리키는지 명확하다.
  // 같은 구간을 클릭하면 onPathClick(day)로 알려줘서 패널의 장소 목록도 그 Day로 전환할 수 있다.
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;

    pathPolylinesRef.current.forEach((line) => line.setMap(null));
    pathPolylinesRef.current = [];
    pathHoverOverlayRef.current?.setMap(null);
    pathHoverOverlayRef.current = null;

    const hoverEl = document.createElement("div");
    hoverEl.style.cssText =
      "color:white;font-size:11px;font-weight:700;line-height:1;padding:3px 7px;border-radius:999px;white-space:nowrap;box-shadow:0 1px 4px rgba(0,0,0,0.3);border:1.5px solid white;pointer-events:none;";
    pathHoverElRef.current = hoverEl;

    const showHoverLabel = (text: string, color: string, position: kakao.maps.LatLng) => {
      hoverEl.textContent = text;
      hoverEl.style.background = color;
      if (!pathHoverOverlayRef.current) {
        pathHoverOverlayRef.current = new K.CustomOverlay({
          content: hoverEl,
          position,
          yAnchor: 1.6,
          xAnchor: 0.5,
          zIndex: 10
        });
        pathHoverOverlayRef.current.setMap(mapRef.current);
      } else {
        pathHoverOverlayRef.current.setPosition(position);
        pathHoverOverlayRef.current.setMap(mapRef.current);
      }
    };
    const hideHoverLabel = () => {
      pathHoverOverlayRef.current?.setMap(null);
    };

    for (const segment of path) {
      const defaultColor = segment.color ?? "#16a34a";
      const drawPolyline = (
        pts: { lat: number; lng: number }[],
        strokeColor: string,
        dashed: boolean
      ) => {
        if (pts.length < 2) return;
        const line = new K.Polyline({
          path: pts.map((p) => new K.LatLng(p.lat, p.lng)),
          strokeWeight: 4,
          strokeColor,
          strokeOpacity: 0.85,
          strokeStyle: dashed ? "shortdash" : "solid",
          // 점선(Day 경계 연결 구간)이 실선 위를 덮지 않도록 항상 아래에 깔리고,
          // 실선끼리도 segment.zIndex 로 우선순위를 줄 수 있다(예: 선택된 Day 경로선을 위로).
          zIndex: segment.zIndex ?? (dashed ? 1 : 2)
        });
        line.setMap(mapRef.current);
        pathPolylinesRef.current.push(line);

        if (segment.label) {
          const label = segment.label;
          K.event.addListener(line, "mouseover", (e: kakao.maps.MouseEvent) =>
            showHoverLabel(label, defaultColor, e.latLng)
          );
          K.event.addListener(line, "mousemove", (e: kakao.maps.MouseEvent) =>
            showHoverLabel(label, defaultColor, e.latLng)
          );
          K.event.addListener(line, "mouseout", hideHoverLabel);
          if (segment.day != null) {
            const day = segment.day;
            K.event.addListener(line, "click", () => onPathClick?.(day));
          }
        }
      };

      if (segment.trafficChunks?.length && !segment.dashed) {
        for (const chunk of segment.trafficChunks) {
          drawPolyline(chunk.points, trafficStateToColor(chunk.trafficState), false);
        }
        continue;
      }

      if (segment.points.length < 2) continue;
      drawPolyline(segment.points, defaultColor, Boolean(segment.dashed));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(path), mapInitCount]);

  // 경로 안내 시 전체 경로가 보이도록 영역 맞춤 (panTo = 부드러운 이동·줌)
  useEffect(() => {
    if (fitPathKey == null || fitPathKey === "") return;
    if (!mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;

    const bounds = new K.LatLngBounds();
    let count = 0;
    for (const segment of path) {
      const pts = segment.points;
      if (pts.length === 0) continue;
      const step = pts.length > 200 ? Math.ceil(pts.length / 200) : 1;
      for (let i = 0; i < pts.length; i += step) {
        const p = pts[i];
        if (!Number.isFinite(p.lat) || !Number.isFinite(p.lng)) continue;
        bounds.extend(new K.LatLng(p.lat, p.lng));
        count += 1;
      }
      const last = pts[pts.length - 1];
      if (Number.isFinite(last.lat) && Number.isFinite(last.lng)) {
        bounds.extend(new K.LatLng(last.lat, last.lng));
        count += 1;
      }
    }
    if (count < 2) return;

    mapRef.current.relayout();
    // 화면보다 멀리 이동하면 카카오가 애니메이션 없이 점프할 수 있음
    if (bottomOverlayPx > 0) {
      mapRef.current.setBounds(bounds, 56, 28, bottomOverlayPx + 16, 28);
    } else {
      mapRef.current.panTo(bounds, 72);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitPathKey, mapInitCount, bottomOverlayPx, JSON.stringify(path)]);

  // 경로 안내 요약 칩 — 경로 중간점에 거리·시간 고정 표시
  const pathSummaryKey = pathSummary
    ? `${pathSummary.distanceM}-${pathSummary.durationSec}-${pathSummary.tollFare ?? 0}`
    : "";
  const pathPointsKey = JSON.stringify(path);

  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;

    pathSummaryOverlayRef.current?.setMap(null);
    pathSummaryOverlayRef.current = null;

    if (
      !pathSummary ||
      !Number.isFinite(pathSummary.distanceM) ||
      !Number.isFinite(pathSummary.durationSec)
    ) {
      return;
    }

    const points = path.flatMap((segment) => segment.points);
    const routable = points.filter(
      (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0)
    );
    if (routable.length < 2) return;

    const mid = routable[Math.floor((routable.length - 1) / 2)];
    const tollPart = formatRouteTollFare(pathSummary.tollFare ?? 0);
    const label = tollPart
      ? `${formatRouteDistance(pathSummary.distanceM)} · ${formatRouteDuration(pathSummary.durationSec)} · ${tollPart}`
      : `${formatRouteDistance(pathSummary.distanceM)} · ${formatRouteDuration(pathSummary.durationSec)}`;

    const el = document.createElement("div");
    el.textContent = label;
    el.style.cssText =
      "background:#fff;color:#0f172a;font-size:12px;font-weight:700;line-height:1.2;padding:6px 10px;border-radius:999px;white-space:nowrap;box-shadow:0 2px 10px rgba(15,23,42,0.18);border:1px solid rgba(15,23,42,0.08);pointer-events:none;";

    const overlay = new K.CustomOverlay({
      content: el,
      position: new K.LatLng(mid.lat, mid.lng),
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 8
    });
    overlay.setMap(mapRef.current);
    pathSummaryOverlayRef.current = overlay;

    return () => {
      overlay.setMap(null);
      if (pathSummaryOverlayRef.current === overlay) {
        pathSummaryOverlayRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInitCount, pathSummaryKey, pathPointsKey]);

  // 내 위치 마커 — myLocation이 바뀔 때마다 다시 그리고, null이면 제거
  useEffect(() => {
    if (!mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;

    myLocationOverlayRef.current?.setMap(null);
    myLocationOverlayRef.current = null;

    if (!myLocation) return;

    const overlay = new K.CustomOverlay({
      position: new K.LatLng(myLocation.lat, myLocation.lng),
      content: createMyLocationEl(),
      yAnchor: 0.5,
      xAnchor: 0.5,
      zIndex: 2
    });
    overlay.setMap(mapRef.current);
    myLocationOverlayRef.current = overlay;
  }, [myLocation, mapInitCount]);

  // 하단 시트가 가리는 높이는 props 로 늦게 갱신될 수 있어, 보정 시 최신 값을 읽는다.
  const bottomOverlayPxRef = useRef(bottomOverlayPx);
  // 장소를 눌러 줌인할 때는 "지금" 시트 높이(사용자가 드래그로 늘렸을 수도 있는)가 아니라,
  // 시트가 처음 뜬 기본 높이 기준으로 안 가려진 영역 중앙에 맞춘다 — 한 번 잡히면 이후 드래그와
  // 무관하게 고정.
  const initialBottomOverlayPxRef = useRef<number | null>(null);
  useEffect(() => {
    bottomOverlayPxRef.current = bottomOverlayPx;
    if (initialBottomOverlayPxRef.current == null && bottomOverlayPx > 0) {
      initialBottomOverlayPxRef.current = bottomOverlayPx;
    }
  }, [bottomOverlayPx]);

  /**
   * 내 위치를 "시트에 가려지지 않은 지도 영역"의 세로 중앙에 둔다.
   * 전체 컨테이너 기준 setCenter 만 하면 시트 때문에 핀이 아래로 치우친다.
   * setBounds는 실제 넓이가 있는 경로(fitPathKey)를 맞출 때는 안정적이지만, 여기서 다루는
   * 점 하나(넓이 0인 bounds)에는 top/bottom padding을 비대칭으로 줘도 무시하고 그냥 기하
   * 중심에 놓아버리는 경우가 있어(카카오 SDK 특성) — 대신 projection으로 "보이는 영역 중앙에
   * 오려면 지도 중심이 어디여야 하는지"를 직접 계산해서 그 좌표 하나로 panTo 한다.
   * (예전엔 setCenter로 순간이동한 뒤 panBy로 한 번 더 밀었는데, 순간이동 직후 슬라이드가
   * 붙어서 "휙" 튀는 것처럼 보였다 — 최종 목표 좌표를 미리 구해서 한 번에 부드럽게 이동한다.)
   */
  const centerLatLngInVisibleMap = (
    map: kakao.maps.Map,
    latlng: kakao.maps.LatLng,
    bottomOverlay: number
  ) => {
    map.relayout();

    if (bottomOverlay <= 0) {
      map.panTo(latlng);
      return;
    }

    try {
      const K = window.kakao.maps;
      const proj = map.getProjection();
      const point = proj.pointFromCoords(latlng);
      // 목표 지점보다 지도 중심을 아래(+y)에 두면, 상대적으로 목표 지점은 화면 위쪽(보이는
      // 영역 중앙)에서 보이게 된다.
      const shiftedPoint = new K.Point(point.x, point.y + Math.round(bottomOverlay / 2));
      const target = proj.coordsFromPoint(shiftedPoint);
      map.panTo(target);
    } catch {
      map.panTo(latlng);
    }
  };

  // [내 위치로 이동] focusMyLocationTrigger가 바뀔 때 1회만 이동.
  // "내 위치" 버튼을 눌러 GPS를 새로 잡았을 때만 한 번 올라가는 트리거라, fitPathKey(코스 경로
  // 맞춤)가 걸려 있어도 사용자가 명시적으로 요청한 이동이므로 항상 실행한다 — 그렇지 않으면
  // 코스 상세처럼 지도에 마커가 있어 fitPathKey가 항상 설정된 화면에서는 "내 위치"가 아예 동작하지 않는다.
  // myLocation / fitPathKey를 deps에 넣지 않음 — GPS 갱신·안내 종료 시 카메라 재점프 방지
  useEffect(() => {
    if (!focusMyLocationTrigger || !myLocation || !mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;
    const latlng = new K.LatLng(myLocation.lat, myLocation.lng);

    // 시트 높이 state 반영 직후 한 번 더 맞춤 (루프 없이 2회만)
    const apply = () => {
      if (!mapRef.current) return;
      centerLatLngInVisibleMap(mapRef.current, latlng, bottomOverlayPxRef.current);
    };
    apply();
    const t1 = window.setTimeout(apply, 200);
    return () => window.clearTimeout(t1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMyLocationTrigger, mapInitCount]);

  // [지도 초기화 — 수동] resetViewTrigger가 바뀔 때("초기화" 버튼을 직접 눌렀을 때 등 사용자가
  // 명시적으로 요청한 경우) 화면에 뭐가 보이든 상관없이 항상 대전 전체가 보이는 초기 화면으로 되돌린다.
  // 모바일 하단 시트가 떠 있으면 기하 중심이 아니라 "보이는 영역"의 중앙에 오도록 보정한다.
  useEffect(() => {
    if (!resetViewTrigger || !mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;
    const map = mapRef.current;

    map.setLevel(MAP_LEVEL, { animate: false });
    centerLatLngInVisibleMap(
      map,
      new K.LatLng(MAP_CENTER.lat, MAP_CENTER.lng),
      bottomOverlayPxRef.current
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetViewTrigger, mapInitCount]);

  // 하단 시트에 가려지지 않은 "보이는 영역"의 지도 경계 — 검색 결과가 지금 화면에 보이는지 판단할 때 쓴다.
  const getVisibleBounds = (
    map: kakao.maps.Map,
    bottomOverlay: number
  ): kakao.maps.LatLngBounds => {
    const K = window.kakao.maps;
    if (bottomOverlay <= 0) return map.getBounds();
    const container = containerRef.current;
    if (!container) return map.getBounds();
    try {
      const proj = map.getProjection();
      if (!proj.coordsFromContainerPoint) return map.getBounds();
      const w = container.clientWidth;
      const visibleH = container.clientHeight - bottomOverlay;
      if (visibleH <= 0) return map.getBounds();
      const bounds = new K.LatLngBounds();
      bounds.extend(proj.coordsFromContainerPoint(new K.Point(0, 0)));
      bounds.extend(proj.coordsFromContainerPoint(new K.Point(w, visibleH)));
      return bounds;
    } catch {
      return map.getBounds();
    }
  };

  // [지도 초기화 — 자동] autoResetViewTrigger가 바뀔 때(검색·필터 변경으로 자동 트리거) 지금 안
  // 가려진 화면에 표시할 장소가 하나도 없을 때만 초기 화면으로 되돌린다. 이미 보이는 장소가 있으면
  // 사용자가 맞춰둔 확대/위치를 그대로 유지한다.
  useEffect(() => {
    if (!autoResetViewTrigger || !mapRef.current || !window.kakao?.maps) return;
    const K = window.kakao.maps;
    const map = mapRef.current;

    const visibleBounds = getVisibleBounds(map, bottomOverlayPxRef.current);
    const hasVisibleMarker = markers.some((marker) =>
      visibleBounds.contain(new K.LatLng(marker.lat, marker.lng))
    );
    if (hasVisibleMarker) return;

    map.setLevel(MAP_LEVEL, { animate: false });
    centerLatLngInVisibleMap(
      map,
      new K.LatLng(MAP_CENTER.lat, MAP_CENTER.lng),
      bottomOverlayPxRef.current
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoResetViewTrigger, mapInitCount]);

  // 지도가 처음 만들어졌을 때도 같은 이유로 기본 위치(대전시청)를 보이는 영역 중앙에 맞춘다.
  // 코스 경로 등을 바로 fit할 예정이면(fitPathKey) 그쪽이 카메라를 맡으므로 여기선 건드리지 않는다.
  // bottomOverlayPx 는 부모(모바일 시트 높이 계산)가 한 프레임 늦게 줄 수 있어 잠깐 재시도한다.
  useEffect(() => {
    if (!mapInitCount || !mapRef.current || !window.kakao?.maps) return;
    if (fitPathKey != null && fitPathKey !== "") return;
    const K = window.kakao.maps;
    const apply = () => {
      if (!mapRef.current) return;
      centerLatLngInVisibleMap(
        mapRef.current,
        new K.LatLng(center.lat, center.lng),
        bottomOverlayPxRef.current
      );
    };
    apply();
    const t1 = window.setTimeout(apply, 120);
    const t2 = window.setTimeout(apply, 320);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapInitCount]);

  return (
    <>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />
      {mapLoadFailed ? (
        <div className="bg-surface text-slate absolute inset-0 grid place-items-center px-6 text-center">
          <div className="max-w-sm">
            <p className="text-ink text-lg font-semibold">지도를 불러올 수 없어요</p>
            <p className="mt-2 text-base leading-6">
              지도 연결 설정을 확인하는 동안 검색 결과 목록에서 장소 정보를 먼저 확인해 주세요.
            </p>
          </div>
        </div>
      ) : null}
    </>
  );
}
