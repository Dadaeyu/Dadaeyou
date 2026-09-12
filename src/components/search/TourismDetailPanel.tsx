"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Star,
  Heart,
  Navigation,
  ChevronLeft,
  MapPin,
  MessageCircle,
  PenLine,
  Plus,
  ExternalLink,
  Phone,
  Footprints,
  Car,
  Loader2
} from "lucide-react";
import type { SearchPlace } from "@/lib/search/kakaoSearch";
import type { TourismDetail } from "@/hooks/usePlaceSearch";
import { formatHomeEventPeriod } from "@/features/home/homePresentation";
import AccessibilitySection from "./AccessibilitySection";
import { useAuth } from "@/context/AuthContext";
import { isPlaceLiked } from "@/lib/supabase/placeLikes";
import { requireLoginOrRedirect } from "@/lib/auth/require-login-redirect";
import { useConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { RouteMode, RouteOption } from "@/lib/kakao/directions";
import {
  formatRouteDistance,
  formatRouteDuration,
  formatRouteTollFare
} from "@/lib/kakao/directions";
import RouteOptionPicker from "./RouteOptionPicker";
import TrafficLegend from "./TrafficLegend";
import { type RouteOriginPlace } from "./OriginPlacePicker";
import RouteEndpointsCard from "./RouteEndpointsCard";

export type { RouteOriginPlace };
export type RouteOriginPhase = "idle" | "searching" | "picked";

const REVIEW_PREVIEW_LENGTH = 60;
// 리뷰로 취급하는 게시판("후기")의 board_id.
const REVIEW_BOARD_ID = 1;

type PlaceReviewItem = {
  id: number;
  title: string;
  content: string;
  rating: number | null;
  created_at: string;
};

// Tour API 텍스트에 &apos; &quot; 같은 HTML 엔티티가 그대로 섞여 오는 경우가 있어,
// {text}로 렌더링하기 전(=브라우저가 HTML로 파싱해주지 않는 경우) 직접 디코딩해준다.
const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " "
};
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(amp|lt|gt|quot|apos|nbsp);/g, (_, name) => HTML_ENTITIES[name])
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)));
}

// <br> 기준으로 줄바꿈하되, 원문에 섞인 공백/개행까지 살아남아 빈 줄이 생기지 않도록 각 줄을 trim한다.
// usetime/restdate의 실제 개행문자(\n)는 place 정규화 단계(syncEngine.ts의 formatUseTime/
// formatRestDate)에서 이미 항목 경계에 넣어 저장해두므로, 여기서는 <br>와 동일하게 나눠주기만 한다.
function renderWithLineBreaks(text: string) {
  const lines = text
    .split(/<br\s*\/?>|\n/gi)
    .map((l) => decodeHtmlEntities(l.trim()))
    .filter(Boolean);
  return lines.flatMap((line, i) => (i === 0 ? [line] : [<br key={i} />, line]));
}

// 지도·코스 검색 결과 상세 패널 — DB(tb_place) 출처와 카카오 로컬 검색 출처를 함께 다룬다.
// DB 출처: usePlaceSearch()의 tourismDetail 을 받아 실제 리뷰·접근성·상세내용을 보여준다.
// 카카오 출처(sp.source==="kakao"): DB 상세가 없으므로 좋아요 영속화·리뷰 작성 없이
// 간소화된 정보(주소/전화)와 플레이스홀더 리뷰, 카카오맵 외부 링크만 보여준다.
export type PlaceRouteGuideState = {
  mode: RouteMode;
  loading: boolean;
  error: string | null;
  distanceM: number | null;
  durationSec: number | null;
  tollFare?: number | null;
  routeOptions?: RouteOption[] | null;
  selectedRouteId?: string;
  onSelectRoute?: (id: string) => void;
  /** 자동차 + API 교통 데이터 있을 때 혼잡도 범례 */
  showTrafficLegend?: boolean;
  onOpenKakao: () => void;
  onClear: () => void;
};

export default function TourismDetailPanel({
  sp,
  detail,
  isLoading,
  onBack,
  onLikeChange,
  onAddToCourse,
  onStartRoute,
  onBeginRoute,
  routeOrigin = null,
  routeOriginPhase = "idle",
  onPickOrigin,
  onChangeOrigin,
  onDismissRoute,
  routeGuide
}: {
  sp: SearchPlace;
  detail: TourismDetail | null;
  isLoading: boolean;
  onBack: () => void;
  onLikeChange?: () => void;
  onAddToCourse?: () => void; // 넘기면 헤더에 "내 코스에 추가" 버튼 표시 (코스 편집 화면 전용)
  onStartRoute?: (mode: RouteMode) => void;
  onBeginRoute?: () => void;
  routeOrigin?: RouteOriginPlace | null;
  routeOriginPhase?: RouteOriginPhase;
  onPickOrigin?: (place: RouteOriginPlace) => void;
  onChangeOrigin?: () => void;
  onDismissRoute?: () => void;
  routeGuide?: PlaceRouteGuideState | null;
}) {
  const router = useRouter();
  const { user } = useAuth();
  const { confirm: dialogConfirm, dialog: loginDialog } = useConfirmDialog();
  const isKakao = sp.source === "kakao";
  const [favorited, setFavorited] = useState(false);
  const [loginNotice, setLoginNotice] = useState(false);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const favoriteErrorTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [favoriteSuccessMessage, setFavoriteSuccessMessage] = useState<string | null>(null);
  const favoriteSuccessTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [overviewExpanded, setOverviewExpanded] = useState(false);
  const [reviewTotal, setReviewTotal] = useState(0);
  const [averageRating, setAverageRating] = useState<number | null>(null);
  const [reviews, setReviews] = useState<PlaceReviewItem[]>([]);
  const [reviewsLoading, setReviewsLoading] = useState(true);
  const canStartRoute = Boolean(onBeginRoute);
  const routePanelOpen =
    canStartRoute &&
    (routeOriginPhase === "searching" || routeOriginPhase === "picked" || Boolean(routeGuide));
  const routeModePanelRef = useRef<HTMLDivElement | null>(null);
  const routeGuidePanelRef = useRef<HTMLDivElement | null>(null);
  const prevRouteGuideRef = useRef(false);

  // 카카오 출처는 contentid 가 없어(예: "kakao_123") 좋아요/리뷰 API 대상이 될 수 없다.
  const placeId = isKakao ? null : Number(sp.id);

  // 모바일 하단 시트에서 출발지 검색·수단 선택 패널이 화면 밖으로 밀리지 않도록 스크롤한다.
  useEffect(() => {
    if (!routePanelOpen) return;
    const frame = window.requestAnimationFrame(() => {
      routeModePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [routePanelOpen, routeOriginPhase]);

  // 경로 결과(로딩 포함)가 새로 열릴 때도 시트 안으로 맞춰 사용자가 인지하게 한다.
  useEffect(() => {
    const hasGuide = !!routeGuide;
    if (hasGuide && !prevRouteGuideRef.current) {
      const frame = window.requestAnimationFrame(() => {
        routeGuidePanelRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      prevRouteGuideRef.current = true;
      return () => window.cancelAnimationFrame(frame);
    }
    prevRouteGuideRef.current = hasGuide;
  }, [routeGuide]);

  useEffect(() => {
    if (isKakao) {
      // 카카오 출처는 DB 상세가 없어 리뷰를 아예 보여주지 않는다.
      setReviewTotal(0);
      setAverageRating(null);
      setReviews([]);
      setReviewsLoading(false);
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (!cancelled) setReviewsLoading(true);
    });
    fetch(`/api/tourism/place-reviews?contentId=${encodeURIComponent(sp.id)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (cancelled) return;
        setReviewTotal(json?.total ?? 0);
        setAverageRating(json?.average_rating ?? null);
        setReviews(json?.reviews ?? []);
      })
      .catch(() => {
        if (!cancelled) {
          setReviewTotal(0);
          setAverageRating(null);
          setReviews([]);
        }
      })
      .finally(() => {
        if (!cancelled) setReviewsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sp.id, isKakao]);

  const goWriteReview = async () => {
    const params = new URLSearchParams({ contentId: sp.id, board: String(REVIEW_BOARD_ID) });
    const nextPath = `/community/new?${params}`;
    // 비로그인이면 로그인 화면으로 보내되, 장소/게시판 선택이 담긴 next 경로를 그대로 넘겨서
    // 로그인 후 돌아왔을 때 다시 선택하지 않아도 되게 한다. 네이티브 confirm() 대신 앱 톤에 맞는
    // 인앱 다이얼로그(useConfirmDialog)를 쓴다.
    if (!(await requireLoginOrRedirect(user, router, nextPath, dialogConfirm))) return;
    router.push(nextPath);
  };

  const goMoreReviews = () => {
    const params = new URLSearchParams({
      tab: "board",
      contentId: sp.id,
      boardId: String(REVIEW_BOARD_ID)
    });
    router.push(`/community?${params}`);
  };

  useEffect(() => {
    if (isKakao || !user || placeId == null) {
      queueMicrotask(() => setFavorited(false));
      return undefined;
    }
    let cancelled = false;
    isPlaceLiked(user.id, placeId)
      .then((liked) => {
        if (!cancelled) setFavorited(liked);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [user, placeId, isKakao]);

  useEffect(
    () => () => {
      if (favoriteErrorTimeoutRef.current) clearTimeout(favoriteErrorTimeoutRef.current);
      if (favoriteSuccessTimeoutRef.current) clearTimeout(favoriteSuccessTimeoutRef.current);
    },
    []
  );

  const handleToggleFavorite = async () => {
    if (!user) {
      setLoginNotice(true);
      setTimeout(() => setLoginNotice(false), 2000);
      return;
    }
    if (favoriteErrorTimeoutRef.current) {
      clearTimeout(favoriteErrorTimeoutRef.current);
      favoriteErrorTimeoutRef.current = null;
    }
    if (favoriteSuccessTimeoutRef.current) {
      clearTimeout(favoriteSuccessTimeoutRef.current);
      favoriteSuccessTimeoutRef.current = null;
    }
    setFavoriteError(null);
    const next = !favorited;
    setFavorited(next);
    try {
      let res: Response;
      try {
        res = await fetch("/api/places/favorite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ place_id: placeId })
        });
      } catch {
        // fetch() 자체가 던지는 건 브라우저의 영어 네트워크 에러(예: "Failed to fetch")라
        // 그대로 보여주지 않고 한글 메시지로 바꾼다.
        throw new Error("네트워크 연결을 확인해주세요.");
      }
      const json = (await res.json().catch(() => ({}))) as {
        favorited?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(json.error ?? "즐겨찾기 저장에 실패했습니다.");
      const finalFavorited = typeof json.favorited === "boolean" ? json.favorited : next;
      setFavorited(finalFavorited);
      onLikeChange?.();
      setFavoriteSuccessMessage(finalFavorited ? "즐겨찾기에 추가했어요" : "즐겨찾기를 해제했어요");
      favoriteSuccessTimeoutRef.current = setTimeout(() => setFavoriteSuccessMessage(null), 2000);
    } catch (error) {
      setFavorited(!next);
      setFavoriteError(error instanceof Error ? error.message : "즐겨찾기 저장에 실패했습니다.");
      favoriteErrorTimeoutRef.current = setTimeout(() => setFavoriteError(null), 4000);
    }
  };

  const title = detail?.title ?? sp.name;
  const image = detail?.image ?? sp.image;
  const hasOverview = !!detail?.overview;
  const categoryLabel = isKakao ? sp.category?.split(" > ").pop() : detail?.category;

  // 축제/공연/행사(lclssystm1='EV')는 "휴무일" 개념이 없고 대신 행사 기간(eventstartdate ~
  // eventenddate)이 있다 — 주소와 시간 사이에 "기간"으로 보여주고 휴무일 행은 뺀다.
  const isEvent = detail?.categoryCode === "EV";
  const eventPeriod = formatHomeEventPeriod(detail?.event_start_date, detail?.event_end_date);

  // 기본 정보 목록 — DB 출처는 주소/시간/전화, 카카오 출처는 시간 정보가 없어 주소/전화만.
  const infoRows = isKakao
    ? [
        { label: "주소", value: sp.address || "-" },
        { label: "전화", value: sp.phone || "-" }
      ]
    : [
        { label: "주소", value: detail?.addr1 || "-" },
        ...(isEvent ? [{ label: "기간", value: eventPeriod || "-" }] : []),
        { label: "시간", value: detail?.use_time || "-" },
        ...(isEvent ? [] : [{ label: "휴무일", value: detail?.rest_date || "-" }]),
        { label: "전화", value: detail?.phone || "-" }
      ];

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-gray-100 bg-white px-3 py-2.5">
        <button
          onClick={onBack}
          className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <h2 className="flex-1 truncate text-sm font-bold text-gray-800">{title}</h2>
        {onAddToCourse && !isKakao && (
          <button
            onClick={onAddToCourse}
            className="bg-brand-500 hover:bg-brand-600 flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold text-white transition-colors"
          >
            <Plus className="h-3.5 w-3.5" />
            코스에 추가
          </button>
        )}
      </div>

      {/* 카카오 검색 결과는 우리 DB에 없는 장소라 place_id가 없어 코스에 저장할 수 없다 —
          "코스에 추가" 버튼 대신 이유를 안내한다. */}
      {onAddToCourse && isKakao && (
        <p className="border-b border-amber-100 bg-amber-50 px-3 py-2 text-xs text-amber-700">
          카카오 검색 결과는 아직 다대유에 등록되지 않은 장소라 코스에 추가할 수 없어요.
        </p>
      )}

      {/* 이미지 */}
      {image ? (
        <Image
          src={image}
          alt={title}
          width={640}
          height={320}
          unoptimized
          className="h-40 w-full shrink-0 bg-gray-50 object-contain"
        />
      ) : (
        <div className="from-brand-400 to-brand-600 flex h-40 shrink-0 items-center justify-center bg-gradient-to-br">
          <MapPin className="h-12 w-12 text-white/60" />
        </div>
      )}

      {!isKakao && isLoading ? (
        <div className="flex flex-1 items-center justify-center py-12">
          <div className="border-brand-500 h-6 w-6 animate-spin rounded-full border-2 border-t-transparent" />
        </div>
      ) : (
        <div className="flex-1 space-y-5 p-4">
          {/* 제목 + 평점 — 카카오 출처는 리뷰가 없어 평점도 표시하지 않는다 */}
          <div>
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-base leading-snug font-bold text-gray-900">{title}</h3>
              {!isKakao && (
                <div className="flex shrink-0 items-center gap-3">
                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    <span className="text-sm font-semibold text-gray-800">
                      {averageRating != null ? averageRating.toFixed(1) : "0.0"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Heart className="h-4 w-4 fill-red-400 text-red-400" />
                    <span className="text-sm font-semibold text-gray-800">
                      {detail?.like_count ?? 0}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {categoryLabel && <p className="mt-0.5 text-xs text-gray-500">{categoryLabel}</p>}
          </div>

          {/* 액션 버튼 — "내 코스"는 지도 브라우징 중엔 대상 코스/Day 가 애매해 일단 숨김.
              즐겨찾기는 카카오 출처엔 저장 대상(DB row)이 없어 숨긴다. */}
          <div className={`grid gap-2 ${isKakao ? "grid-cols-1" : "grid-cols-2"}`}>
            {!isKakao && (
              <button
                type="button"
                onClick={handleToggleFavorite}
                className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-colors ${
                  favorited
                    ? "border-red-300 bg-red-50 text-red-600"
                    : "border-gray-200 text-gray-600 hover:bg-gray-50"
                }`}
              >
                <Heart className={`h-4 w-4 ${favorited ? "fill-red-500 text-red-500" : ""}`} />
                즐겨찾기
              </button>
            )}
            <button
              type="button"
              onClick={() => onBeginRoute?.()}
              disabled={!canStartRoute}
              aria-expanded={routePanelOpen}
              aria-controls="route-mode-panel"
              className={`flex flex-col items-center gap-1 rounded-xl border py-2.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                routePanelOpen
                  ? "border-blue-300 bg-blue-50 text-blue-700"
                  : "border-gray-200 text-gray-600 hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
              }`}
            >
              <Navigation className="h-4 w-4 text-blue-500" />
              경로안내
            </button>
          </div>

          {canStartRoute && routePanelOpen ? (
            <div id="route-mode-panel" ref={routeModePanelRef}>
              <div ref={routeGuidePanelRef}>
                <RouteEndpointsCard
                  destinationName={title}
                  origin={routeOrigin}
                  searching={routeOriginPhase === "searching"}
                  onPickOrigin={onPickOrigin}
                  onChangeOrigin={onChangeOrigin}
                  onClose={onDismissRoute ?? routeGuide?.onClear}
                >
                  {routeOriginPhase === "picked" && routeOrigin && !routeGuide ? (
                    <div className="space-y-2">
                      <p className="text-ink text-xs font-semibold">이동 수단</p>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onStartRoute?.("walk")}
                          className="border-hairline hover:border-brand-300 hover:bg-background flex items-center justify-center gap-1.5 rounded-xl border bg-white px-3 py-2.5 text-xs font-semibold text-gray-700"
                        >
                          <Footprints className="h-3.5 w-3.5" />
                          도보
                        </button>
                        <button
                          type="button"
                          onClick={() => onStartRoute?.("car")}
                          className="border-hairline hover:border-brand-300 hover:bg-background flex items-center justify-center gap-1.5 rounded-xl border bg-white px-3 py-2.5 text-xs font-semibold text-gray-700"
                        >
                          <Car className="h-3.5 w-3.5" />
                          자동차
                        </button>
                      </div>
                    </div>
                  ) : routeGuide ? (
                    <div className="space-y-2">
                      <p className="text-ink flex items-center gap-1.5 text-xs font-semibold">
                        {routeGuide.loading ? (
                          <Loader2 className="text-brand-700 h-3.5 w-3.5 shrink-0 animate-spin" />
                        ) : null}
                        {routeGuide.mode === "walk" ? "도보" : "자동차"}
                        {routeGuide.loading ? " 경로를 찾는 중…" : " 경로"}
                      </p>
                      {!routeGuide.loading &&
                      routeGuide.distanceM != null &&
                      routeGuide.durationSec != null ? (
                        <p className="text-ink text-sm font-semibold">
                          {formatRouteDuration(routeGuide.durationSec)}
                          <span className="text-stone ml-2 text-xs font-medium">
                            {formatRouteDistance(routeGuide.distanceM)}
                            {routeGuide.tollFare != null && routeGuide.tollFare > 0
                              ? ` · ${formatRouteTollFare(routeGuide.tollFare)}`
                              : ""}
                          </span>
                        </p>
                      ) : null}
                      {routeGuide.error ? (
                        <p className="text-error text-xs">{routeGuide.error}</p>
                      ) : null}
                      {routeGuide.mode === "car" &&
                      routeGuide.routeOptions &&
                      routeGuide.routeOptions.length > 1 &&
                      routeGuide.onSelectRoute ? (
                        <RouteOptionPicker
                          options={routeGuide.routeOptions}
                          selectedId={
                            routeGuide.selectedRouteId ?? routeGuide.routeOptions[0]?.id ?? "0"
                          }
                          onSelect={routeGuide.onSelectRoute}
                          disabled={routeGuide.loading}
                        />
                      ) : null}
                      {routeGuide.showTrafficLegend ? <TrafficLegend /> : null}
                      <button
                        type="button"
                        disabled={routeGuide.loading}
                        onClick={routeGuide.onOpenKakao}
                        className="bg-brand-700 hover:bg-brand-800 w-full rounded-xl py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                      >
                        카카오맵에서 안내 시작
                      </button>
                    </div>
                  ) : null}
                </RouteEndpointsCard>
              </div>
            </div>
          ) : null}

          {/* 로그인 안내 토스트 — body에 직접 포탈해서, 시트 등 조상 요소의 transform 때문에
              fixed 위치가 화면 중앙이 아니라 그 조상 기준으로 틀어지는 걸 막는다. */}
          {loginNotice &&
            createPortal(
              <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-xs whitespace-nowrap text-white shadow-lg">
                로그인 후 이용 가능합니다
              </div>,
              document.body
            )}

          {/* 즐겨찾기 저장 실패 안내 — 누르면 바로 재시도 */}
          {favoriteError &&
            createPortal(
              <button
                type="button"
                onClick={() => void handleToggleFavorite()}
                className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-xs whitespace-nowrap text-white shadow-lg"
              >
                {favoriteError} · 탭해서 다시 시도
              </button>,
              document.body
            )}

          {/* 즐겨찾기 저장 성공 토스트 */}
          {favoriteSuccessMessage &&
            !favoriteError &&
            createPortal(
              <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-xs whitespace-nowrap text-white shadow-lg">
                {favoriteSuccessMessage}
              </div>,
              document.body
            )}

          {/* 기본 정보 */}
          <div className="space-y-1.5 text-xs text-gray-600">
            {infoRows.map(({ label, value }) => (
              <div key={label} data-speakable className="flex gap-2">
                <span className="w-12 shrink-0 font-medium text-gray-700">{label}</span>
                <span
                  className="min-w-0 break-words"
                  data-speakable="true"
                  tabIndex={0}
                  aria-label={`${label} ${value.replace(/<br\s*\/?>|\n/g, ", ")}`}
                >
                  {renderWithLineBreaks(value)}
                </span>
              </div>
            ))}
          </div>

          {/* 접근성 정보 (DB 출처만) */}
          {!isKakao && detail?.accessibility && detail.accessibility.length > 0 && (
            <AccessibilitySection groups={detail.accessibility} />
          )}

          {/* 상세 내용(overview, DB 출처) 또는 카카오맵 외부 링크(카카오 출처) */}
          {!isKakao ? (
            <div>
              <h4 className="mb-2 text-sm font-semibold text-gray-800">상세 내용</h4>
              <p
                className={`text-sm leading-relaxed text-gray-600 ${overviewExpanded ? "" : "line-clamp-5"}`}
                tabIndex={0}
                aria-label={`상세내용 ${
                  hasOverview
                    ? decodeHtmlEntities((detail?.overview ?? "").replace(/<br\s*\/?>|\n/g, " "))
                    : "없음"
                }`}
              >
                {hasOverview ? renderWithLineBreaks(detail?.overview ?? "") : "상세내용이 없습니다"}
              </p>
              {hasOverview && (
                <button
                  onClick={() => setOverviewExpanded((v) => !v)}
                  className="text-brand-600 hover:text-brand-800 mt-1 text-xs transition-colors"
                >
                  {overviewExpanded ? "접기 ▲" : "더보기 ▼"}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {sp.phone && (
                <a
                  href={`tel:${sp.phone.replace(/[^\d+]/g, "")}`}
                  className="border-brand-200 text-brand-800 flex items-center justify-center gap-2 rounded-xl border py-2.5 text-sm font-semibold transition-colors hover:bg-cyan-50"
                >
                  <Phone className="h-4 w-4" />
                  전화하기
                </a>
              )}
              {sp.placeUrl && (
                <a
                  href={sp.placeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-2.5 text-sm text-gray-600 transition-colors hover:bg-gray-50"
                >
                  <ExternalLink className="h-4 w-4" />
                  카카오맵에서 보기
                </a>
              )}
            </div>
          )}

          {/* 공공데이터 출처 표기 (DB=TourAPI 출처만, 카카오 출처는 해당 없음) */}
          {!isKakao && <p className="text-[11px] text-gray-400">출처: ⓒ한국관광공사</p>}

          {/* 리뷰 — 카카오 출처는 DB 상세가 없어 리뷰 자체를 보여주지 않는다 */}
          {!isKakao && (
            <div>
              <div className="mb-3 flex items-center gap-2">
                <MessageCircle className="h-4 w-4 text-gray-500" />
                <h4
                  className="text-sm font-semibold text-gray-800"
                  data-speakable="true"
                  tabIndex={0}
                  aria-label={`리뷰 ${reviewTotal}개`}
                >
                  리뷰
                </h4>
                <span className="text-xs text-gray-400">{reviewTotal}개</span>
                <div className="ml-auto flex items-center gap-2">
                  <button
                    onClick={() => void goWriteReview()}
                    className="text-brand-600 hover:text-brand-800 flex items-center gap-1 text-xs font-medium transition-colors"
                  >
                    <PenLine className="h-3 w-3" />
                    리뷰 쓰기
                  </button>
                  {reviewTotal > 0 && (
                    <button
                      onClick={goMoreReviews}
                      className="text-xs font-medium text-gray-400 transition-colors hover:text-gray-600"
                    >
                      더보기
                    </button>
                  )}
                </div>
              </div>
              {reviewsLoading ? (
                <p className="py-4 text-center text-xs text-gray-400">불러오는 중…</p>
              ) : reviews.length === 0 ? (
                <p className="py-4 text-center text-xs text-gray-400">등록된 후기가 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {reviews.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => router.push(`/community/${r.id}`)}
                      aria-label={[
                        r.title,
                        r.rating != null ? `별점 ${r.rating}점` : null,
                        r.content
                      ]
                        .filter(Boolean)
                        .join(", ")}
                      data-speakable="true"
                      className="block w-full rounded-xl border border-gray-100 p-3 text-left transition-colors hover:bg-gray-50"
                    >
                      <div className="mb-1.5 flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-semibold text-gray-800">
                          {r.title}
                        </span>
                        {r.rating != null && (
                          <div className="flex shrink-0 items-center gap-0.5">
                            {Array.from({ length: 5 }).map((_, i) => (
                              <Star
                                key={i}
                                className={`h-3 w-3 ${i < r.rating! ? "fill-yellow-400 text-yellow-400" : "text-gray-200"}`}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                      <p aria-hidden="true" className="text-xs leading-relaxed text-gray-600">
                        {r.content.length > REVIEW_PREVIEW_LENGTH
                          ? `${r.content.slice(0, REVIEW_PREVIEW_LENGTH)}...`
                          : r.content}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
      {loginDialog}
    </div>
  );
}
