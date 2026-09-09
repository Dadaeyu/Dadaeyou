"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LocateFixed, X, MoreVertical, Palette, RotateCcw, ZoomIn, Check } from "lucide-react";
import { useFilters } from "@/components/PlaceFilters";
import KakaoMap, { type MapMarker, type MapPathSegment } from "@/components/KakaoMap";
import PlaceSearchSidebar from "@/components/search/PlaceSearchSidebar";
import {
  type PlaceRouteGuideState,
  type RouteOriginPhase,
  type RouteOriginPlace
} from "@/components/search/TourismDetailPanel";
import {
  getCategoryColor,
  LCLSSYSTM1_COLORS,
  LCLSSYSTM1_LABELS
} from "@/lib/search/categoryColors";
import { usePlaceSearch } from "@/hooks/usePlaceSearch";
import { useMyLocation, type MyLocationErrorReason } from "@/hooks/useMyLocation";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { getMapRenderPlaces } from "@/lib/search/mapDeepLinkState";
import { parseCourseReturnPath } from "@/lib/search/mapRouteHref";
import {
  fetchDirections,
  openKakaoMapRoute,
  pickRouteOption,
  buildRoutePathFromOption,
  type RouteMode,
  type RouteOption
} from "@/lib/kakao/directions";
import RouteOptionPicker from "@/components/search/RouteOptionPicker";
import TrafficLegend from "@/components/search/TrafficLegend";
import {
  formatRouteDistance,
  formatRouteDuration,
  formatRouteTollFare
} from "@/lib/kakao/directions";

/** 모바일 하단 시트 스냅 — 이름만 · 50% · 55%(지도 45%) · 거의 전체 */
type MobileSheetSnap = "peek" | "half" | "default" | "full";
const MOBILE_SHEET_SNAP_ORDER: MobileSheetSnap[] = ["peek", "half", "default", "full"];
const MOBILE_SHEET_PEEK_PX = 92;
/** 스냅별 시트 높이 % (peek 은 px 전용) */
const MOBILE_SHEET_SNAP_PCT: Record<Exclude<MobileSheetSnap, "peek">, number> = {
  half: 50,
  default: 55, // 보이는 지도 ≈ 45%
  full: 92
};

function sheetSnapToPercent(snap: MobileSheetSnap, containerH: number): number {
  if (snap === "peek") {
    const h = Math.max(containerH, 1);
    return Math.min(92, Math.max(8, (MOBILE_SHEET_PEEK_PX / h) * 100));
  }
  return MOBILE_SHEET_SNAP_PCT[snap];
}

function nearestMobileSheetSnap(heightPct: number, containerH: number): MobileSheetSnap {
  let best: MobileSheetSnap = "default";
  let bestDist = Number.POSITIVE_INFINITY;
  for (const snap of MOBILE_SHEET_SNAP_ORDER) {
    const dist = Math.abs(sheetSnapToPercent(snap, containerH) - heightPct);
    if (dist < bestDist) {
      bestDist = dist;
      best = snap;
    }
  }
  return best;
}

// ── 메인 컴포넌트 ─────────────────────────────────────────
// 지도 화면: 사이드바(검색/필터/목록) + KakaoMap. usePlaceSearch·useMyLocation 훅으로
// DB/카카오 검색 결과와 내 위치를 지도에 반영하고, 선택한 장소의 상세 패널을 보여준다.
export default function Map() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTheme = searchParams.get("theme");
  const initialQuery = searchParams.get("query")?.trim() ?? "";
  const initialContentId = searchParams.get("contentId");
  const mapOnly = searchParams.get("mode") === "map";
  const startRouteOnLoad = searchParams.get("route") === "1";
  const courseReturnPath = parseCourseReturnPath(searchParams.get("from"));
  const startRouteOnLoadRef = useRef(startRouteOnLoad);
  const courseReturnPathRef = useRef(courseReturnPath);
  useLockBodyScroll();

  // 모바일(및 mapOnly) 하단 시트 — 오버레이 높이 스냅(peek / 50% / 55% / full).
  // 핸들이 시트와 같이 움직이므로 window 리스너로 드래그 추적한다.
  const [mobileSheetSnap, setMobileSheetSnap] = useState<MobileSheetSnap>("default");
  const [sheetDragPct, setSheetDragPct] = useState<number | null>(null);
  const sheetDragRef = useRef<{ startY: number; startPct: number } | null>(null);
  const sheetDragLatestPctRef = useRef(0);
  const mobileSheetSnapRef = useRef<MobileSheetSnap>("default");
  const sheetDragCleanupRef = useRef<(() => void) | null>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mobileSheetSnapRef.current = mobileSheetSnap;
  }, [mobileSheetSnap]);

  // 드래그 중 언마운트 시 window 리스너 누수 방지
  useEffect(() => {
    return () => {
      sheetDragCleanupRef.current?.();
      sheetDragCleanupRef.current = null;
    };
  }, []);

  const resolveContainerHeight = () =>
    mapAreaRef.current?.clientHeight ||
    (typeof window !== "undefined" ? Math.max(window.innerHeight - 64, 1) : 640);

  /** CSS 변수 — peek 은 px, 그 외·드래그 중은 % (SSR 시 window 불필요) */
  const sheetHeightCss = useMemo(() => {
    if (sheetDragPct != null) return `${sheetDragPct}%`;
    if (mobileSheetSnap === "peek") return `${MOBILE_SHEET_PEEK_PX}px`;
    return `${MOBILE_SHEET_SNAP_PCT[mobileSheetSnap]}%`;
  }, [mobileSheetSnap, sheetDragPct]);

  const handleSheetDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    // 이전 드래그가 남아 있으면 정리
    sheetDragCleanupRef.current?.();

    const containerHeight = resolveContainerHeight();
    const startPct =
      sheetDragPct != null ? sheetDragPct : sheetSnapToPercent(mobileSheetSnap, containerHeight);
    sheetDragRef.current = { startY: e.clientY, startPct };
    sheetDragLatestPctRef.current = startPct;
    setSheetDragPct(startPct);

    const onMove = (moveEvent: PointerEvent) => {
      if (!sheetDragRef.current) return;
      moveEvent.preventDefault();
      const h = resolveContainerHeight();
      const deltaPercent = ((sheetDragRef.current.startY - moveEvent.clientY) / h) * 100;
      const next = Math.min(
        92,
        Math.max(sheetSnapToPercent("peek", h), sheetDragRef.current.startPct + deltaPercent)
      );
      sheetDragLatestPctRef.current = next;
      setSheetDragPct(next);
    };
    const finish = () => {
      const drag = sheetDragRef.current;
      sheetDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      sheetDragCleanupRef.current = null;
      if (!drag) {
        setSheetDragPct(null);
        return;
      }
      const h = resolveContainerHeight();
      const pct = sheetDragLatestPctRef.current;
      const moved = pct - drag.startPct;
      const currentSnap = mobileSheetSnapRef.current;
      let nextSnap: MobileSheetSnap;
      if (Math.abs(moved) < 3) {
        nextSnap = currentSnap;
      } else if (Math.abs(moved) < 10) {
        const idx = MOBILE_SHEET_SNAP_ORDER.indexOf(currentSnap);
        nextSnap =
          moved > 0
            ? MOBILE_SHEET_SNAP_ORDER[Math.min(MOBILE_SHEET_SNAP_ORDER.length - 1, idx + 1)]
            : MOBILE_SHEET_SNAP_ORDER[Math.max(0, idx - 1)];
      } else {
        nextSnap = nearestMobileSheetSnap(pct, h);
      }
      setMobileSheetSnap(nextSnap);
      setSheetDragPct(null);
    };
    sheetDragCleanupRef.current = finish;
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const handleSheetHandleDoubleClick = () => {
    setSheetDragPct(null);
    setMobileSheetSnap((prev) => (prev === "full" ? "default" : "full"));
  };

  // 지도 영역 높이만 측정하고, 시트가 가리는 픽셀은 아래에서 파생한다.
  // (effect 안에서 setMapBottomOverlayPx 를 반복 호출하면 resize/relayout 과 맞물려
  //  Maximum update depth exceeded 가 날 수 있음)
  const [mapAreaHeightPx, setMapAreaHeightPx] = useState(0);
  const [isMobileSheetLayout, setIsMobileSheetLayout] = useState(mapOnly);
  useEffect(() => {
    const measure = () => {
      const mobile = mapOnly || window.innerWidth < 768;
      setIsMobileSheetLayout((prev) => (prev === mobile ? prev : mobile));
      const h = mapAreaRef.current?.clientHeight ?? 0;
      setMapAreaHeightPx((prev) => (prev === h ? prev : h));
    };
    measure();
    window.addEventListener("resize", measure);
    const el = mapAreaRef.current;
    const ro =
      el && typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => measure()) : null;
    if (el && ro) ro.observe(el);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  }, [mapOnly]);

  const mapBottomOverlayPx = useMemo(() => {
    if (!isMobileSheetLayout) return 0;
    const containerHeight = mapAreaHeightPx > 0 ? mapAreaHeightPx : 1;
    if (sheetDragPct != null) {
      return Math.round(containerHeight * (sheetDragPct / 100));
    }
    if (mobileSheetSnap === "peek") {
      return Math.min(MOBILE_SHEET_PEEK_PX, containerHeight);
    }
    return Math.round(containerHeight * (MOBILE_SHEET_SNAP_PCT[mobileSheetSnap] / 100));
  }, [isMobileSheetLayout, mapAreaHeightPx, sheetDragPct, mobileSheetSnap]);

  // 지도 오른쪽 하단 "기능 목록" 드롭다운 — 코스 상세와 동일: 초기화/내 위치/확대·축소/테마 범례.
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const mapMenuRef = useRef<HTMLDivElement>(null);
  // 전체 화면을 덮는 배경 버튼 대신 document 클릭을 직접 듣고 메뉴 영역 바깥인지만 판정한다 —
  // 그래야 드롭다운이 열려 있어도 지도 위 마우스휠/터치가 그대로 지도에 전달돼 확대·축소가 된다.
  useEffect(() => {
    if (!mapMenuOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (mapMenuRef.current && !mapMenuRef.current.contains(e.target as Node)) {
        setMapMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [mapMenuOpen]);
  const [showThemeLegend, setShowThemeLegend] = useState(false);
  const [showZoomControl, setShowZoomControl] = useState(true);
  // "초기화" 메뉴 항목용 — 값을 바꿀 때마다 resetViewTrigger 가 달라져서 지도가 대전 전체 화면으로 되돌아간다.
  const [mapManualResetTrigger, setMapManualResetTrigger] = useState(0);

  const { filters, set, toggleList, reset, activeCount } = useFilters({
    themes: initialTheme ? [initialTheme] : []
  });

  const {
    keyword,
    setKeyword,
    searchPlaces,
    searchDetailId,
    setSearchDetailId,
    searchDetail,
    isSearching,
    areaCodes,
    dongOptions,
    likedIds,
    refreshLiked,
    tourismDetail,
    isLoadingDetail,
    handleSearch,
    focusPlaceById,
    focusedPlace,
    topRatedPlaces,
    isLoadingTopRated,
    hasActiveFilter,
    mapResetTrigger,
    searchPage,
    setSearchPage,
    searchTotal
  } = usePlaceSearch({
    accessibility: filters.accessibility,
    gu: filters.gu,
    dong: filters.dong,
    favoritesOnly: filters.favoritesOnly,
    headcount: filters.headcount,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo,
    themes: filters.themes,
    minRating: filters.minRating,
    initialKeyword: initialQuery
  });

  useEffect(() => {
    if (initialContentId) focusPlaceById(initialContentId);
  }, [focusPlaceById, initialContentId]);

  const {
    location: myLocation,
    status: myLocationStatus,
    errorReason: myLocationError,
    start: startMyLocation,
    reset: resetMyLocation,
    focusTrigger: focusMyLocationTrigger,
    resetTrigger: myLocationResetTrigger
  } = useMyLocation();

  const [locationToastDismissed, setLocationToastDismissed] = useState(false);
  const locationErrorCopy =
    myLocationStatus === "error" ? getMyLocationErrorCopy(myLocationError) : null;
  const showLocationErrorToast = Boolean(locationErrorCopy) && !locationToastDismissed;

  useEffect(() => {
    if (myLocationStatus !== "error") return;
    const timer = window.setTimeout(() => setLocationToastDismissed(true), 5000);
    return () => window.clearTimeout(timer);
  }, [myLocationStatus, myLocationError]);

  const handleStartMyLocation = () => {
    setLocationToastDismissed(false);
    startMyLocation();
  };

  // 내 위치 버튼 토글: 켜져 있으면 끄면서 대전 전체 화면으로, 꺼져 있으면 내 위치를 조회한다.
  // 모바일에서는 시트 55%(지도 45%)로 맞춘 뒤 위치를 잡아, 보이는 지도 중앙에 오도록 한다.
  const handleLocateClick = () => {
    if (myLocationStatus === "active") {
      resetMyLocation();
    } else {
      setSheetDragPct(null);
      setMobileSheetSnap("default");
      handleStartMyLocation();
    }
  };

  const [routePath, setRoutePath] = useState<MapPathSegment[]>([]);
  const [routeGuide, setRouteGuide] = useState<PlaceRouteGuideState | null>(null);
  const [routeStops, setRouteStops] = useState<
    { lat: number; lng: number; name?: string }[] | null
  >(null);
  const routeOptionsRef = useRef<RouteOption[] | null>(null);
  const [selectedRouteId, setSelectedRouteId] = useState("0");
  const routeRequestIdRef = useRef(0);
  const [routeOrigin, setRouteOrigin] = useState<RouteOriginPlace | null>(null);
  const [routeOriginPhase, setRouteOriginPhase] = useState<RouteOriginPhase>("idle");

  const handleSelectRoute = (id: string) => {
    const options = routeOptionsRef.current;
    if (!options) return;
    const opt = options.find((r) => r.id === id);
    if (!opt) return;
    setSelectedRouteId(id);
    setRoutePath([
      buildRoutePathFromOption(
        opt,
        routeGuide?.mode ?? "car",
        routeGuide?.mode === "walk" ? "#0d9488" : "#2563eb"
      )
    ]);
    setRouteGuide((prev) =>
      prev
        ? {
            ...prev,
            distanceM: opt.distanceM,
            durationSec: opt.durationSec,
            tollFare: opt.tollFare,
            selectedRouteId: id,
            showTrafficLegend:
              prev.mode === "car" && !opt.fallback && Boolean(opt.trafficChunks?.length)
          }
        : prev
    );
  };

  const clearRouteGuide = () => {
    routeRequestIdRef.current += 1;
    routeOptionsRef.current = null;
    setSelectedRouteId("0");
    setRouteGuide(null);
    setRoutePath([]);
    setRouteStops(null);
  };

  const handleBeginRoute = () => {
    setSheetDragPct(null);
    setMobileSheetSnap((snap) => (snap === "peek" ? "half" : snap));
    if (routeOriginPhase === "searching") return;
    clearRouteGuide();
    setRouteOriginPhase(routeOrigin ? "picked" : "searching");
  };

  useEffect(() => {
    if (!startRouteOnLoadRef.current) return;
    if (!searchDetail) return;
    if (initialContentId && searchDetail.id !== initialContentId) return;
    startRouteOnLoadRef.current = false;
    setSheetDragPct(null);
    setMobileSheetSnap((snap) => (snap === "peek" ? "half" : snap));
    setRouteOriginPhase("searching");
  }, [initialContentId, searchDetail]);

  const handlePickOrigin = (place: RouteOriginPlace) => {
    setRouteOrigin(place);
    setRouteOriginPhase("picked");
    setSheetDragPct(null);
    setMobileSheetSnap((snap) => (snap === "peek" ? "half" : snap));
  };

  const handleChangeOrigin = () => {
    clearRouteGuide();
    setRouteOriginPhase("searching");
    setSheetDragPct(null);
    setMobileSheetSnap((snap) => (snap === "peek" ? "half" : snap));
  };

  const handleDismissRoute = () => {
    clearRouteGuide();
    setRouteOriginPhase("idle");
  };

  const applyDirectionsResult = (
    result: Awaited<ReturnType<typeof fetchDirections>>,
    mode: RouteMode,
    stops: { lat: number; lng: number; name?: string }[],
    onOpenKakao: () => void
  ) => {
    const options = result.routes?.length ? result.routes : [pickRouteOption(result)];
    const multi = options.length > 1 ? options : null;
    routeOptionsRef.current = multi;
    const primary = pickRouteOption(result, "0");
    setSelectedRouteId(primary.id);
    setRoutePath([
      buildRoutePathFromOption(primary, mode, mode === "walk" ? "#0d9488" : "#2563eb")
    ]);
    const showTrafficLegend =
      mode === "car" && !result.fallback && Boolean(primary.trafficChunks?.length);
    setRouteGuide({
      mode,
      loading: false,
      error: result.fallback ? "대략 경로예요. 정확한 안내는 카카오맵에서 시작하세요." : null,
      distanceM: primary.distanceM,
      durationSec: primary.durationSec,
      tollFare: primary.tollFare,
      routeOptions: multi,
      selectedRouteId: primary.id,
      onSelectRoute: handleSelectRoute,
      showTrafficLegend,
      onOpenKakao,
      onClear: clearRouteGuide
    });
  };

  const handleStartRoute = async (mode: RouteMode) => {
    if (!searchDetail) return;
    if (!routeOrigin) {
      setRouteOriginPhase("searching");
      return;
    }

    const origin = {
      lat: routeOrigin.lat,
      lng: routeOrigin.lng,
      name: routeOrigin.name
    };
    const destination = {
      lat: searchDetail.lat,
      lng: searchDetail.lng,
      name: searchDetail.name
    };
    const stops = [origin, destination];
    const requestId = ++routeRequestIdRef.current;
    setRouteStops(stops);
    setRouteGuide({
      mode,
      loading: true,
      error: null,
      distanceM: null,
      durationSec: null,
      onOpenKakao: () => openKakaoMapRoute(stops, mode),
      onClear: clearRouteGuide
    });

    try {
      const result = await fetchDirections({ origin, destination, mode });
      if (requestId !== routeRequestIdRef.current) return;
      applyDirectionsResult(result, mode, stops, () => openKakaoMapRoute(stops, mode));
    } catch (e) {
      if (requestId !== routeRequestIdRef.current) return;
      routeOptionsRef.current = null;
      setSelectedRouteId("0");
      setRoutePath([{ points: stops, color: "#94a3b8", dashed: true }]);
      setRouteGuide({
        mode,
        loading: false,
        error:
          e instanceof Error
            ? `${e.message} 카카오맵으로 안내할 수 있어요.`
            : "경로 미리보기에 실패했어요. 카카오맵으로 안내할 수 있어요.",
        distanceM: null,
        durationSec: null,
        onOpenKakao: () => openKakaoMapRoute(stops, mode),
        onClear: clearRouteGuide
      });
    }
  };

  const activeFilterCount = activeCount;
  const resetFilters = () => {
    reset();
  };

  const selectPlace = (id: string) => {
    if (id === "route-origin") return;
    if (initialContentId && id !== initialContentId && courseReturnPathRef.current) {
      courseReturnPathRef.current = null;
    }
    clearRouteGuide();
    setRouteOriginPhase("idle");
    setSearchDetailId(id);
    // 이름만 보이는 상태면 장소 상세를 볼 수 있게 기본 비율로 펼친다.
    setSheetDragPct(null);
    setMobileSheetSnap((snap) => (snap === "peek" ? "default" : snap));
  };

  const closePlaceDetail = () => {
    clearRouteGuide();
    setRouteOriginPhase("idle");
    setSearchDetailId(null);
  };

  const backFromDetail = () => {
    const returnTo = courseReturnPathRef.current;
    if (returnTo) {
      router.push(returnTo);
      return;
    }
    closePlaceDetail();
  };

  // 필터/검색을 아무것도 안 켰을 때만 핫플레이스를 기본으로 보여준다.
  // 필터를 켰는데 결과가 0개면(searchPlaces=[]) 그대로 빈 목록으로 둬서 "결과 없음"이 보이게 한다.
  const displayPlaces = getMapRenderPlaces({
    focusedPlace,
    hasActiveFilter,
    searchPlaces,
    topRatedPlaces
  });
  const markerPlaces = displayPlaces;

  return (
    <div
      className="relative -mx-4 -mt-6 -mb-24 flex overflow-hidden md:-mx-6"
      style={{ height: "calc(100dvh - 64px)" }}
    >
      {/* ── 검색 패널 — 데스크톱은 왼쪽 고정 사이드바, 모바일(및 mapOnly)은 코스 상세와 동일한
          드래그 가능한 하단 시트. 검색 목록 ↔ 상세 전환도 PlaceSearchSidebar 가 내부에서 처리한다. ── */}
      <aside
        className={
          mapOnly
            ? "border-hairline absolute inset-x-0 bottom-0 z-30 flex h-[var(--sheet-h)] shrink-0 flex-col overflow-hidden rounded-t-2xl border-t bg-white shadow-2xl"
            : "border-hairline absolute inset-x-0 bottom-0 z-30 flex h-[var(--sheet-h)] shrink-0 flex-col overflow-hidden rounded-t-2xl border-t bg-white shadow-2xl md:static md:inset-auto md:z-auto md:flex md:h-auto md:w-72 md:rounded-none md:border-t-0 md:border-r md:shadow-none"
        }
        style={{ "--sheet-h": sheetHeightCss } as CSSProperties}
      >
        {/* 하단 시트 핸들 — 드래그 후 peek/50%/55%/full 스냅. mapOnly 는 항상, 일반 모드는 모바일만. */}
        <div
          role="slider"
          tabIndex={0}
          aria-valuemin={0}
          aria-valuemax={3}
          aria-valuenow={MOBILE_SHEET_SNAP_ORDER.indexOf(mobileSheetSnap)}
          aria-valuetext={
            mobileSheetSnap === "peek"
              ? "장소 이름만"
              : mobileSheetSnap === "half"
                ? "절반"
                : mobileSheetSnap === "full"
                  ? "거의 전체"
                  : "기본(지도 45%)"
          }
          aria-label="검색·장소 정보 창 높이 조절"
          className={`shrink-0 touch-none items-center justify-center py-3 active:cursor-grabbing ${mapOnly ? "flex" : "flex md:hidden"} cursor-grab`}
          onPointerDown={handleSheetDragStart}
          onDoubleClick={handleSheetHandleDoubleClick}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              const idx = MOBILE_SHEET_SNAP_ORDER.indexOf(mobileSheetSnap);
              setMobileSheetSnap(
                MOBILE_SHEET_SNAP_ORDER[Math.min(MOBILE_SHEET_SNAP_ORDER.length - 1, idx + 1)]
              );
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              const idx = MOBILE_SHEET_SNAP_ORDER.indexOf(mobileSheetSnap);
              setMobileSheetSnap(MOBILE_SHEET_SNAP_ORDER[Math.max(0, idx - 1)]);
            }
          }}
        >
          <span className="bg-stone/40 h-1 w-10 rounded-full" aria-hidden />
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <PlaceSearchSidebar
            keyword={keyword}
            setKeyword={setKeyword}
            onSearch={handleSearch}
            isSearching={isSearching}
            filters={filters}
            set={set}
            toggleList={toggleList}
            guOptions={areaCodes.map((a) => a.name)}
            dongOptions={dongOptions}
            activeCount={activeFilterCount}
            onResetFilters={resetFilters}
            defaultFilterOpen
            places={displayPlaces}
            searchCount={searchPlaces.length}
            hasActiveFilter={hasActiveFilter}
            isLoadingTopRated={isLoadingTopRated}
            onSelectPlace={selectPlace}
            searchPage={searchPage}
            searchTotal={searchTotal}
            onSearchPageChange={setSearchPage}
            searchDetail={searchDetail}
            tourismDetail={tourismDetail}
            isLoadingDetail={isLoadingDetail}
            onBackFromDetail={backFromDetail}
            onLikeChange={refreshLiked}
            onStartRoute={handleStartRoute}
            onBeginRoute={handleBeginRoute}
            routeOrigin={routeOrigin}
            routeOriginPhase={routeOriginPhase}
            onPickOrigin={handlePickOrigin}
            onChangeOrigin={handleChangeOrigin}
            onDismissRoute={handleDismissRoute}
            routeGuide={routeGuide}
          />
        </div>
      </aside>

      {/* ── MAP AREA ── */}
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden">
        <KakaoMap
          markers={[
            ...markerPlaces.map((sp): MapMarker => {
              if (sp.source === "kakao") {
                // 눈물방울 핀(카카오 옐로우 배경 + 파란 중앙 점)으로 카카오 검색 결과임을 표시.
                return {
                  id: sp.id,
                  lat: sp.lat,
                  lng: sp.lng,
                  color: "#FEE500",
                  borderColor: "#2563EB",
                  shape: "teardrop"
                };
              }
              if (filters.favoritesOnly && likedIds.has(sp.id)) {
                return { id: sp.id, lat: sp.lat, lng: sp.lng, color: "#ef4444", shape: "heart" };
              }
              // 추천 장소(로그인 + 접근성/선호테마 매칭)는 핀 안에 별 표시로 통일한다.
              // 매칭 이유(접근성/선호테마) 구분은 목록의 텍스트 배지에서만 보여준다.
              const matchLabel = sp.matchedAccessibility || sp.matchedTheme ? "★" : undefined;
              return {
                id: sp.id,
                lat: sp.lat,
                lng: sp.lng,
                color: getCategoryColor(sp.categoryCode),
                label: matchLabel
              };
            }),
            ...(routeOrigin
              ? [
                  {
                    id: "route-origin",
                    lat: routeOrigin.lat,
                    lng: routeOrigin.lng,
                    color: "#2563eb",
                    shape: "dot" as const,
                    label: "출",
                    zIndex: 8
                  } satisfies MapMarker
                ]
              : [])
          ]}
          selectedId={searchDetailId}
          onSelect={(id) => selectPlace(id)}
          onDeselect={closePlaceDetail}
          myLocation={myLocation}
          focusMyLocationTrigger={focusMyLocationTrigger}
          resetViewTrigger={myLocationResetTrigger + mapManualResetTrigger}
          autoResetViewTrigger={mapResetTrigger}
          showZoomControl={showZoomControl}
          path={routePath}
          fitPathKey={
            routeGuide && !routeGuide.loading
              ? `${routeGuide.mode}-${routeGuide.distanceM ?? "x"}-${selectedRouteId}-${routePath.length}`
              : null
          }
          pathSummary={
            routeGuide &&
            !routeGuide.loading &&
            routeGuide.distanceM != null &&
            routeGuide.durationSec != null
              ? {
                  distanceM: routeGuide.distanceM,
                  durationSec: routeGuide.durationSec,
                  tollFare: routeGuide.tollFare ?? 0
                }
              : null
          }
          bottomOverlayPx={mapBottomOverlayPx}
        />

        {routeGuide && !searchDetail ? (
          <div className="border-hairline bg-background absolute bottom-20 left-3 z-20 max-w-xs rounded-2xl border p-3 shadow-lg md:bottom-4">
            <p className="text-ink text-xs font-semibold">
              {routeGuide.mode === "walk" ? "도보" : "자동차"} 경로
              {routeGuide.loading ? " 불러오는 중…" : ""}
            </p>
            {routeGuide.distanceM != null && routeGuide.durationSec != null ? (
              <p className="text-stone mt-1 text-xs">
                {formatRouteDistance(routeGuide.distanceM)} ·{" "}
                {formatRouteDuration(routeGuide.durationSec)}
                {routeGuide.tollFare != null && routeGuide.tollFare > 0
                  ? ` · ${formatRouteTollFare(routeGuide.tollFare)}`
                  : ""}
              </p>
            ) : null}
            {routeGuide.mode === "car" &&
            routeGuide.routeOptions &&
            routeGuide.routeOptions.length > 1 &&
            routeGuide.onSelectRoute ? (
              <div className="mt-2">
                <RouteOptionPicker
                  options={routeGuide.routeOptions}
                  selectedId={routeGuide.selectedRouteId ?? "0"}
                  onSelect={routeGuide.onSelectRoute}
                  disabled={routeGuide.loading}
                />
              </div>
            ) : null}
            {routeGuide.showTrafficLegend ? (
              <div className="mt-2">
                <TrafficLegend />
              </div>
            ) : null}
            <button
              type="button"
              onClick={() => routeStops && openKakaoMapRoute(routeStops, routeGuide.mode)}
              className="bg-brand-700 mt-2 w-full rounded-lg py-2 text-xs font-semibold text-white"
            >
              카카오맵에서 안내 시작
            </button>
          </div>
        ) : null}
        {showLocationErrorToast && locationErrorCopy ? (
          <div
            id="map-location-error"
            role="alert"
            className="border-hairline bg-background absolute right-4 z-[60] w-[min(16rem,calc(100%-2rem))] rounded-2xl border p-3.5 shadow-lg"
            style={{ bottom: mapBottomOverlayPx + 16 + 56 }}
          >
            <div className="flex items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-ink text-sm font-semibold tracking-[-0.01em]">
                  {locationErrorCopy.title}
                </p>
                <p className="text-stone mt-1 text-xs leading-relaxed">{locationErrorCopy.help}</p>
              </div>
              <button
                type="button"
                onClick={() => setLocationToastDismissed(true)}
                className="text-stone hover:text-ink hover:bg-surface-soft -mt-0.5 -mr-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors"
                aria-label="안내 닫기"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : null}

        {/* 테마 색상 범례 — 확대/축소 컨트롤(카카오 기본 줌 컨트롤, 오른쪽 위에 뜸, 모바일도 토글로 켤 수 있음)이
              켜져 있을 땐 화면 크기와 상관없이 윗변을 맞추고 바로 왼쪽에, 꺼져 있으면 오른쪽 끝에 붙인다.
              z-index는 상단 헤더(z-40)와 모바일 하단 시트 패널(z-30)보다도 낮게 둬서, 줌 컨트롤과
              마찬가지로 페이지를 스크롤해 지도가 헤더 아래로 넘어가거나 시트에 가리면 범례도 자연스럽게
              같이 가려지게 한다. */}
        {showThemeLegend && (
          <div
            className={`border-hairline absolute top-0.5 right-3 z-20 rounded-xl border bg-white/90 p-2.5 shadow-lg backdrop-blur-sm ${showZoomControl ? "right-11" : ""}`}
          >
            <p className="text-steel mb-1.5 text-[11px] font-semibold">테마 색상</p>
            <div className="space-y-1">
              {Object.entries(LCLSSYSTM1_COLORS).map(([code, color]) => (
                <div key={code} className="flex items-center gap-1.5 text-xs text-gray-700">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: color }}
                  />
                  {LCLSSYSTM1_LABELS[code] ?? code}
                </div>
              ))}
              {/* 카카오 검색 결과 마커는 카카오 브랜드 옐로우(#FEE500)로 표시된다 */}
              <div className="flex items-center gap-1.5 text-xs text-gray-700">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: "#FEE500" }}
                />
                카카오
              </div>
            </div>
          </div>
        )}

        {/* 지도 기능 드롭다운 — 초기화 / 내 위치 / 확대·축소 / 테마 범례.
              모바일(및 mapOnly)에선 검색 패널이 하단 시트로 뜨므로, 그 시트 바로 위에 버튼이 오도록
              mapBottomOverlayPx(시트가 가리는 높이)만큼 띄운다. 데스크톱은 overlay가 0이라
              기존 bottom-4(16px)와 동일하게 유지된다. */}
        <div
          ref={mapMenuRef}
          className="absolute right-4 z-[61]"
          style={{ bottom: mapBottomOverlayPx + 16 }}
        >
          {mapMenuOpen && (
            <div className="border-hairline absolute right-0 bottom-14 w-32 overflow-hidden rounded-xl border bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={() => setMapManualResetTrigger((n) => n + 1)}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4 shrink-0 text-gray-500" />
                초기화
              </button>
              <button
                type="button"
                onClick={handleLocateClick}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <LocateFixed
                    className={`h-4 w-4 shrink-0 text-gray-500 ${myLocationStatus === "locating" ? "animate-pulse" : ""}`}
                  />
                  내 위치
                </span>
                {myLocationStatus === "active" && (
                  <Check className="text-brand-600 h-4 w-4 shrink-0" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowZoomControl((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <ZoomIn className="h-4 w-4 shrink-0 text-gray-500" />
                  확대/축소
                </span>
                {showZoomControl && <Check className="text-brand-600 h-4 w-4 shrink-0" />}
              </button>
              <button
                type="button"
                onClick={() => setShowThemeLegend((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <span className="flex items-center gap-2">
                  <Palette className="h-4 w-4 shrink-0 text-gray-500" />
                  테마 범례
                </span>
                {showThemeLegend && <Check className="text-brand-600 h-4 w-4 shrink-0" />}
              </button>
            </div>
          )}
          <button
            type="button"
            onClick={() => setMapMenuOpen((v) => !v)}
            className={`flex h-11 w-11 items-center justify-center rounded-full shadow-lg transition-colors ${
              myLocationStatus === "error"
                ? "border-error/30 text-error border bg-white hover:bg-red-50"
                : "bg-white text-gray-600 hover:bg-gray-50"
            }`}
            aria-label="지도 기능 목록"
            aria-expanded={mapMenuOpen}
            aria-describedby={showLocationErrorToast ? "map-location-error" : undefined}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function getMyLocationErrorCopy(errorReason: MyLocationErrorReason): {
  title: string;
  help: string;
} {
  if (errorReason === "denied") {
    return {
      title: "위치 권한이 꺼져 있어요",
      help: "브라우저에서 위치 권한을 켜면 내 위치를 지도에 표시할 수 있어요."
    };
  }
  if (errorReason === "outside_daejeon") {
    return {
      title: "대전 밖 위치예요",
      help: "내 위치는 대전 안에서만 표시해요. 위치 없이도 장소 검색은 가능해요."
    };
  }
  return {
    title: "위치를 다시 확인해 주세요",
    help: "위치를 확인하지 못했어요. 위치 없이 계속 둘러볼 수 있어요."
  };
}
