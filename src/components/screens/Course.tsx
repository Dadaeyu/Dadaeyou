"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
  type CSSProperties
} from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import dynamic from "next/dynamic";
import type { MapMarker, MapPathSegment } from "@/components/KakaoMap";
import { useAuth } from "@/context/AuthContext";
import {
  Plus,
  Sparkles,
  Heart,
  Share2,
  SlidersHorizontal,
  ChevronDown,
  Star,
  X,
  ChevronUp,
  Trash2,
  Check,
  Pencil,
  ShieldCheck,
  User,
  RotateCcw,
  Navigation,
  Footprints,
  Car,
  MoreVertical,
  Palette,
  LocateFixed,
  ZoomIn
} from "lucide-react";
import { Filters, DEFAULT_FILTERS, FilterFields, useFilters } from "@/components/PlaceFilters";
import type { SearchPlace } from "@/lib/search/kakaoSearch";
import { buildPlaceRouteMapHref } from "@/lib/search/mapRouteHref";
import { usePlaceSearch, type TourismDetail } from "@/hooks/usePlaceSearch";
import {
  getCategoryColor,
  LCLSSYSTM1_COLORS,
  LCLSSYSTM1_LABELS
} from "@/lib/search/categoryColors";
import { useMyLocation } from "@/hooks/useMyLocation";
import { useLockBodyScroll } from "@/hooks/useLockBodyScroll";
import { shareToKakaoTalk } from "@/lib/kakao/loadKakaoShare";
import { fetchSharedCourses, type CourseSort } from "@/lib/supabase/courses";
import type { TourismSharedCourse } from "@/lib/supabase/types";
import { Select } from "@/components/ui/Select";
import { DateField } from "@/components/ui/DateField";

// 공유/내 코스 목록 정렬 — 등록일/제목/별점 각각 오름·내림차순.
const COURSE_SORT_OPTIONS: { value: CourseSort; label: string }[] = [
  { value: "registtime_desc", label: "등록일 최신순" },
  { value: "registtime_asc", label: "등록일 오래된순" },
  { value: "title_asc", label: "제목 오름차순" },
  { value: "title_desc", label: "제목 내림차순" },
  { value: "rating_desc", label: "별점 높은순" },
  { value: "rating_asc", label: "별점 낮은순" }
];
const DEFAULT_COURSE_SORT: CourseSort = "registtime_desc";
import { requireLoginOrRedirect } from "@/lib/auth/require-login-redirect";
import {
  fetchDirectionsForStops,
  formatRouteDistance,
  formatRouteDuration,
  formatRouteTollFare,
  openKakaoMapRoute,
  pickRouteOption,
  buildRoutePathFromOption,
  type RouteMode,
  type RouteOption
} from "@/lib/kakao/directions";
import RouteOptionPicker from "@/components/search/RouteOptionPicker";
import TrafficLegend from "@/components/search/TrafficLegend";
import { DaiyuCompactLoading } from "@/components/loading/DaiyuLoading";

// Day(일정)별 마커·경로선 색상 — Day 순서대로 순환 배정. 마커와 경로선이 같은 팔레트를 써야
// "이 색 마커들이 이 색 선으로 이어진 게 같은 Day"라는 게 지도에서 바로 보인다.
const DAY_LINE_COLORS = [
  "#16a34a",
  "#2563eb",
  "#dc2626",
  "#d97706",
  "#7c3aed",
  "#0891b2",
  "#db2777"
];

// 1시간 뒤 시각(0~23, 자정 넘어가면 랩어라운드). 새 장소의 기본 종료시각 계산용.
const KakaoMap = dynamic(() => import("@/components/KakaoMap"), { ssr: false });
const PlaceSearchSidebar = dynamic(() => import("@/components/search/PlaceSearchSidebar"));
const TourismDetailPanel = dynamic(() => import("@/components/search/TourismDetailPanel"));

function addOneHour(hour: number): number {
  return (((hour + 1) % 24) + 24) % 24;
}

// 코스 편집 중 화면에 들고 있는 편집용 상태 타입 (실제 저장은 tb_course/tb_course_detail 직접 CRUD).
interface CoursePlace {
  id: number; // 코스 내 행 식별용 로컬 id
  name: string;
  startHour: number; // 0~23 (분 없음)
  endHour: number; // 0~23 (분 없음)
  placeId?: number; // tb_course_detail.place_id 로 저장되는 원본 장소 id
  lat?: number; // 장소 검색으로 추가된 경우의 좌표 (지도 마커·경로선 표시용)
  lng?: number;
  contentId?: string; // tb_place.contentid (TourAPI id, 관리자 등록 장소는 "a" 접두 문자열) — /api/tourism/detail 조회용. placeId(내부 PK)와는 다른 값.
  categoryCode?: string | null; // tb_place.lclssystm1 — 지도/장소목록의 테마별 색상에 쓴다.
}

interface CourseDay {
  day: number;
  places: CoursePlace[];
}

interface MyCourse {
  id: number;
  title: string;
  duration: string;
  isPrivate: boolean;
  rating: number;
  likes: number;
  tags: string[];
  days: CourseDay[];
  startDate?: string; // 시작일 (DB: startdate)
  endDate?: string; // 종료일 (DB: enddate)
}

// <select> 시각 옵션(0~23시)
const HOUR_OPTIONS = Array.from({ length: 24 }, (_, h) => h);

// 화면 읽기가 "1번째"를 숫자 그대로 읽으면 "한번째"처럼 어색하게 나온다(한국어 서수는
// "첫 번째"처럼 고유어를 써야 자연스럽다). 장소 목록은 보통 한 Day에 몇 곳 안 되므로 20번째까지만
// 고유어로 두고, 그 이상은 자연스러운 표현이 마땅치 않아 숫자로 대체한다.
const KOREAN_ORDINAL_PREFIXES = [
  "첫",
  "두",
  "세",
  "네",
  "다섯",
  "여섯",
  "일곱",
  "여덟",
  "아홉",
  "열",
  "열한",
  "열두",
  "열세",
  "열네",
  "열다섯",
  "열여섯",
  "열일곱",
  "열여덟",
  "열아홉",
  "스무"
];

function koreanOrdinal(n: number): string {
  const prefix = KOREAN_ORDINAL_PREFIXES[n - 1];
  return prefix ? `${prefix} 번째` : `${n}번째`;
}
import { Card } from "../ui/Card";
import { Badge } from "../ui/Badge";

// 코스 상세 → 뒤로가기 시 "어느 탭의, 어느 코스를 보다가 들어왔는지" 복원하기 위한 저장소.
// sessionStorage 사용 (탭 닫으면 사라져도 무방, 새로고침엔 살아있어야 하므로 localStorage 는 부적합).
const COURSE_LIST_RETURN_KEY = "dadaeyu:courseListReturn";
type CourseListReturn = {
  tab: "shared" | "recommend" | "my";
  courseId: number;
  scrollY: number;
  filters?: Filters; // 카드 클릭 당시의 필터 값 — 뒤로가기 시 그대로 복원
  showFilters?: boolean; // 필터 패널 펼침/접힘 상태
  sort?: CourseSort; // 카드 클릭 당시의 정렬 값 — 뒤로가기 시 그대로 복원
};

function saveCourseListReturn(
  tab: CourseListReturn["tab"],
  courseId: number,
  filters?: Filters,
  showFilters?: boolean,
  sort?: CourseSort
) {
  if (typeof window === "undefined") return;
  try {
    const payload: CourseListReturn = {
      tab,
      courseId,
      scrollY: window.scrollY,
      filters,
      showFilters,
      sort
    };
    sessionStorage.setItem(COURSE_LIST_RETURN_KEY, JSON.stringify(payload));
  } catch {
    // 저장 실패는 무시 — 스크롤/탭 복원이 안 될 뿐, 기능 자체엔 영향 없음.
  }
}

function readCourseListReturn(): CourseListReturn | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(COURSE_LIST_RETURN_KEY);
    return raw ? (JSON.parse(raw) as CourseListReturn) : null;
  } catch {
    return null;
  }
}

function clearCourseListReturn() {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.removeItem(COURSE_LIST_RETURN_KEY);
  } catch {
    // ignore
  }
}

// AI 추천 코스는 저장 전이라 실제 course_id가 없다 — 목록 카드를 누르면 그 초안을
// sessionStorage에 넣어두고 이 고정 id로 상세 화면(/course/[id])에 진입, 거기서 그대로 읽어와 보여준다.
const AI_PREVIEW_ROUTE_ID = "ai-preview";
const AI_PREVIEW_STORAGE_KEY = "dadaeyu:aiCoursePreview";

function saveAiCoursePreview(draft: RecommendedCourseDraft) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(AI_PREVIEW_STORAGE_KEY, JSON.stringify(draft));
  } catch {
    // ignore
  }
}

// sessionStorage에 남아있던 draft는 필드가 추가되기 전 옛날 스키마일 수 있다(예: hashtags가
// 없던 시절 저장분) — 그대로 쓰면 course.hashtags.map() 같은 데서 런타임 에러가 난다. 읽을 때마다
// 최신 필드를 기본값으로 채워 넣어 방어한다.
function normalizeRecommendedCourseDraft(draft: RecommendedCourseDraft): RecommendedCourseDraft {
  return {
    ...draft,
    hashtags: Array.isArray(draft.hashtags) ? draft.hashtags : [],
    days: draft.days.map((day) => ({
      ...day,
      places: day.places.map((place) => ({
        ...place,
        categoryCode: place.categoryCode ?? null
      }))
    }))
  };
}

function readAiCoursePreview(): RecommendedCourseDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(AI_PREVIEW_STORAGE_KEY);
    if (!raw) return null;
    return normalizeRecommendedCourseDraft(JSON.parse(raw) as RecommendedCourseDraft);
  } catch {
    return null;
  }
}

// AI 추천 코스 탭의 필터+결과 세션. LLM 호출로 만든 결과라 비용/시간이 들어서, 뒤로가기는 물론
// 새로고침해도 그대로 남아있게 한다(탭을 닫기 전까지). 필터와 결과를 하나로 묶어서 저장해야
// "빈 필터인데 결과만 남아있는" 것 같은 화면 불일치가 안 생긴다 — 이 둘은 항상 같이 갱신된다.
const RECOMMEND_SESSION_KEY = "dadaeyu:recommendSession";
type RecommendSessionSnapshot = {
  filters: Filters;
  showFilters: boolean;
  showResults: boolean;
  courses: RecommendedCourseDraft[];
  notice: string;
};

function saveRecommendSession(snapshot: RecommendSessionSnapshot) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(RECOMMEND_SESSION_KEY, JSON.stringify(snapshot));
  } catch {
    // ignore
  }
}

function readRecommendSession(): RecommendSessionSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(RECOMMEND_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RecommendSessionSnapshot;
    return {
      ...parsed,
      courses: (parsed.courses ?? []).map(normalizeRecommendedCourseDraft)
    };
  } catch {
    return null;
  }
}

type AuthorType = "admin" | "user";

// 코스 카드 상단의 "등록자 · 등록일" 행 — 공유/추천/내 코스 목록에서 공통으로 사용.
function CourseAuthorRow({
  authorType,
  author,
  date,
  badgeAfter = false
}: {
  authorType: AuthorType;
  author: string;
  date?: string;
  badgeAfter?: boolean; // true면 배지를 닉네임 뒤로 보낸다(기본은 배지가 먼저).
}) {
  const badge =
    authorType === "admin" ? (
      <span className="flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700">
        <ShieldCheck className="h-3 w-3" />
        관리자
      </span>
    ) : (
      <span className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-bold text-gray-600">
        <User className="h-3 w-3" />
        유저
      </span>
    );
  return (
    <div className="mb-2 flex items-center gap-1.5">
      {!badgeAfter && badge}
      <span className="text-xs font-medium text-gray-500">{author}</span>
      {badgeAfter && badge}
      {date && <span className="ml-auto text-[10px] text-gray-300">{date}</span>}
    </div>
  );
}

// /api/courses/recommend 응답 — AI가 필터 조건에 맞춰 즉석에서 설계한 코스 초안.
// 아직 tb_course 에 저장되지 않은 상태라 course_id 가 없다 — "저장" 시에만 실제 코스가 된다.
interface RecommendedCoursePlace {
  placeId: number;
  contentId: string;
  name: string;
  lat: number;
  lng: number;
  startHour: number;
  endHour: number;
  categoryCode: string | null;
}
interface RecommendedCourseDay {
  day: number;
  places: RecommendedCoursePlace[];
}
interface RecommendedCourseDraft {
  title: string;
  summary: string;
  placeCount: number;
  hashtags: string[];
  // 추천 요청 시 선택한 여행 기간 — API 응답 자체엔 없어서, 요청에 쓴 filters.dateFrom/dateTo를
  // 그대로 붙여 미리보기/저장에 쓴다(실제 코스 저장이 없는 미리보기 단계라 서버가 몰라도 된다).
  startDate?: string;
  endDate?: string;
  days: RecommendedCourseDay[];
}

// "YYYY-MM-DD..." / "YYYY-MM-DD" 형태의 날짜값을 "YYYY.MM.DD" 로 통일해 보여준다.
function formatDotDate(value?: string | null): string {
  if (!value) return "-";
  return value.slice(0, 10).replaceAll("-", ".");
}

export default function Course() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : undefined;
  // 코스 상세(지도 포함, calc(100dvh-64px) 고정 레이아웃)일 때만 body 스크롤을 잠근다 —
  // 목록 화면은 일반 페이지 스크롤이 그대로 필요하다.
  useLockBodyScroll(Boolean(id));
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, member, loading: authLoading } = useAuth();
  // 코스 추가/취소 후, 혹은 코스 상세에서 뒤로가기 시 원래 보던 탭이 유지되도록 쿼리로 초기 탭을 정한다.
  const tabParam = searchParams.get("tab");
  const initialTab = tabParam === "my" || tabParam === "recommend" ? tabParam : "shared";
  const [activeTab, setActiveTab] = useState<"shared" | "recommend" | "my">(initialTab);
  const [loginNotice, setLoginNotice] = useState(false);
  const showLoginNotice = () => {
    setLoginNotice(true);
    setTimeout(() => setLoginNotice(false), 2000);
  };
  const goCreateCourse = () => {
    if (!user) {
      showLoginNotice();
      return;
    }
    router.push("/course/new");
  };

  // 공유/추천/내 코스 필터 공통 — 위치(구/동) 선택지. tb_place.ldongsigngucd 는 이름이 아니라
  // 코드로 저장돼 있어서, 필터 UI(이름 기준)와 서버 조회(코드 기준) 사이를 변환해줘야 한다.
  const [sharedAreaCodes, setSharedAreaCodes] = useState<{ code: string; name: string }[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/area-code")
      .then((r) => r.json())
      .then((data) => {
        if (active) setSharedAreaCodes(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  // 내 코스 — tb_course 중 register=로그인 사용자 id 인 행만, 공유 코스와 동일한 필터를
  // 서버(/api/courses/shared?mine=1)에 적용해 페이지 단위로 로드한다.
  const MY_COURSES_PAGE_SIZE = 20;
  const [myDbCourses, setMyDbCourses] = useState<TourismSharedCourse[]>([]);
  const [myCoursesError, setMyCoursesError] = useState("");
  const [myCoursesLoading, setMyCoursesLoading] = useState(true);
  const [myCoursesLoadingMore, setMyCoursesLoadingMore] = useState(false);
  const [myHasMore, setMyHasMore] = useState(false);
  // course_id -> tb_course_like 행 개수 (즐겨찾기 수)
  const [courseLikeCounts, setCourseLikeCounts] = useState<Record<number, number>>({});
  // course_id -> 일정 요약(며칠 일정인지, 장소 몇 곳인지)
  const [courseMeta, setCourseMeta] = useState<
    Record<number, { duration: string; places: number }>
  >({});
  // course_id -> 해시태그(포함된 장소들의 대분류+접근성 종합 상위 3개)
  const [courseHashtags, setCourseHashtags] = useState<Record<number, string[]>>({});
  // course_id -> 별점 평균(tb_post.course_rating, 소수 1자리). 후기 없으면 0.
  const [courseRatings, setCourseRatings] = useState<Record<number, number>>({});

  // 내 코스 필터 — 공유 코스와 동일한 필터 UI/서버 로직(mine=1)을 그대로 재사용한다.
  // 코스 상세 → 뒤로가기로 돌아왔을 때 카드 클릭 당시의 필터를 그대로 복원한다.
  const [showMyFilters, setShowMyFilters] = useState(() => {
    const saved = !id ? readCourseListReturn() : null;
    return saved?.tab === "my" ? !!saved.showFilters : false;
  });
  const [myFilters, setMyFilters] = useState<Filters>(() => {
    const saved = !id ? readCourseListReturn() : null;
    return saved?.tab === "my" && saved.filters ? saved.filters : DEFAULT_FILTERS;
  });
  // "검색" 버튼을 눌러야 draft 가 실제 조회에 쓰이는 myFilters 로 반영된다.
  const [myFilterDraft, setMyFilterDraft] = useState<Filters>(myFilters);
  // 정렬은 필터와 달리 고르는 즉시 바로 반영된다(검색 버튼 없이).
  const [mySort, setMySort] = useState<CourseSort>(() => {
    const saved = !id ? readCourseListReturn() : null;
    return saved?.tab === "my" && saved.sort ? saved.sort : DEFAULT_COURSE_SORT;
  });
  const myGuCode = sharedAreaCodes.find((a) => a.name === myFilters.gu)?.code ?? "";
  const myDraftGuCode = sharedAreaCodes.find((a) => a.name === myFilterDraft.gu)?.code ?? "";
  const [myDongOptions, setMyDongOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!myDraftGuCode) {
      setMyDongOptions([]);
      return;
    }
    let active = true;
    fetch(`/api/area-code/dong?gu=${encodeURIComponent(myDraftGuCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setMyDongOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [myDraftGuCode]);

  // 필터가 바뀔 때만 재조회하도록, 배열은 정렬 후 문자열 키로 비교한다 (공유 코스와 동일 패턴).
  const myFilterKey = JSON.stringify({
    accessibility: [...myFilters.accessibility].sort(),
    themes: [...myFilters.themes].sort(),
    favoritesOnly: myFilters.favoritesOnly,
    gu: myGuCode,
    dong: myFilters.dong,
    headcount: myFilters.headcount,
    dateFrom: myFilters.dateFrom,
    dateTo: myFilters.dateTo,
    minRating: myFilters.minRating,
    sort: mySort
  });

  // (offset, limit) 구간의 내 코스를 공유 코스와 동일한 필터로 조회한다. 초기 로드/더보기 양쪽에서 재사용.
  const loadMyCoursesPage = useCallback(
    async (offset: number, limit: number) => {
      const { items, hasMore } = await fetchSharedCourses(offset, limit, {
        accessibility: myFilters.accessibility,
        themes: myFilters.themes,
        favoritesOnly: myFilters.favoritesOnly,
        gu: myGuCode,
        dong: myFilters.dong,
        headcount: myFilters.headcount,
        dateFrom: myFilters.dateFrom,
        dateTo: myFilters.dateTo,
        minRating: myFilters.minRating,
        mine: true,
        sort: mySort
      });
      const likeCounts: Record<number, number> = {};
      const meta: Record<number, { duration: string; places: number }> = {};
      const hashtags: Record<number, string[]> = {};
      const ratings: Record<number, number> = {};
      for (const c of items) {
        likeCounts[c.course_id] = c.like_count;
        hashtags[c.course_id] = c.hashtags;
        ratings[c.course_id] = c.average_rating;
        meta[c.course_id] = {
          duration: c.day_count > 1 ? `${c.day_count}일` : "반일",
          places: c.place_count
        };
      }
      return { courses: items, hasMore, likeCounts, meta, hashtags, ratings } as const;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [myFilterKey]
  );

  // user 는 Supabase 의 onAuthStateChange(토큰 자동 리프레시, 탭 포커스 복귀 시 세션 재검증 등)가
  // 일어날 때마다 "내용은 같아도 매번 새 객체 참조"로 갱신된다. 이 effect의 deps 에 user 객체
  // 자체를 넣으면 그 재발급마다 재실행되어 무한 스크롤로 불러온 목록을 처음 20개로 계속 덮어써버린다
  // (그래서 "스크롤해도 안 늘어나는 것처럼" 보임) — 실제로 로그인 사용자가 바뀔 때만 반응하도록
  // user?.id (문자열 값)만 deps 로 쓴다.
  const userId = user?.id;
  // 필터 "세대" — 공유 코스와 동일하게, 필터가 바뀔 때(=처음부터 다시 조회할 때)만 증가한다.
  const myGenerationRef = useRef(0);
  // sentinel 의 IntersectionObserver 콜백과 "뒤로가기 복원" 효과가 거의 동시에 loadMore 를
  // 부를 수 있는데, 그 둘 사이 간격이 setState 커밋보다 짧으면 myCoursesLoadingMore 상태값이
  // 아직 갱신 전이라 가드를 통과해 같은 offset 으로 중복 요청 → 같은 코스가 두 번 붙어 React key
  // 중복 경고가 난다. ref 는 동기적으로 즉시 반영되므로 이 레이스를 막는다.
  const myLoadingMoreInFlightRef = useRef(false);
  useEffect(() => {
    if (!userId) {
      // 비로그인 상태에선 "내 코스" 목록을 비운다.
      setMyDbCourses([]);
      setMyCoursesError("");
      setCourseLikeCounts({});
      setCourseMeta({});
      setCourseHashtags({});
      setCourseRatings({});
      setMyHasMore(false);
      setMyCoursesLoading(false);
      return;
    }
    const generation = ++myGenerationRef.current;
    myLoadingMoreInFlightRef.current = false;
    setMyCoursesLoading(true);
    setMyCoursesLoadingMore(false);
    (async () => {
      try {
        const page = await loadMyCoursesPage(0, MY_COURSES_PAGE_SIZE);
        if (myGenerationRef.current !== generation) return;
        setMyDbCourses(page.courses);
        setCourseLikeCounts(page.likeCounts);
        setCourseMeta(page.meta);
        setCourseHashtags(page.hashtags);
        setCourseRatings(page.ratings);
        setMyHasMore(page.hasMore);
      } catch (e) {
        if (myGenerationRef.current !== generation) return;
        setMyCoursesError(e instanceof Error ? e.message : String(e));
      } finally {
        if (myGenerationRef.current === generation) setMyCoursesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, myFilterKey]);

  const loadMoreMyCourses = useCallback(async () => {
    if (!userId || myCoursesLoading || myCoursesLoadingMore || !myHasMore) return;
    if (myLoadingMoreInFlightRef.current) return;
    myLoadingMoreInFlightRef.current = true;
    const generation = myGenerationRef.current;
    const offset = myDbCourses.length;
    setMyCoursesLoadingMore(true);
    try {
      const page = await loadMyCoursesPage(offset, MY_COURSES_PAGE_SIZE);
      if (myGenerationRef.current !== generation) return;
      // 방어적 중복 제거 — 레이스로 같은 페이지가 두 번 붙는 경우에도 React key 중복이 나지 않게.
      setMyDbCourses((prev) => {
        const existingIds = new Set(prev.map((c) => c.course_id));
        return [...prev, ...page.courses.filter((c) => !existingIds.has(c.course_id))];
      });
      setCourseLikeCounts((prev) => ({ ...prev, ...page.likeCounts }));
      setCourseMeta((prev) => ({ ...prev, ...page.meta }));
      setCourseHashtags((prev) => ({ ...prev, ...page.hashtags }));
      setCourseRatings((prev) => ({ ...prev, ...page.ratings }));
      setMyHasMore(page.hasMore);
    } catch (e) {
      if (myGenerationRef.current !== generation) return;
      setMyCoursesError(e instanceof Error ? e.message : String(e));
    } finally {
      myLoadingMoreInFlightRef.current = false;
      if (myGenerationRef.current === generation) setMyCoursesLoadingMore(false);
    }
  }, [
    userId,
    myCoursesLoading,
    myCoursesLoadingMore,
    myHasMore,
    myDbCourses.length,
    loadMyCoursesPage
  ]);

  // 무한 스크롤 — 목록 하단 sentinel 이 보이면 자동으로 다음 페이지 로드.
  // sentinel 은 탭 전환(activeTab)·hasMore 변화에 따라 DOM 에 붙었다 떨어졌다 하므로,
  // useEffect + deps 로 옵저버를 붙이면 "노드는 새로 생겼는데 deps 는 그대로"인 순간
  // (예: 다른 탭에 있는 동안 hasMore 가 true 로 바뀜 → 나중에 탭을 열어도 재실행 안 됨)
  // 옵저버가 영영 안 붙거나, 이미 제거된 옛 노드를 계속 관찰하게 된다.
  // callback ref 는 노드가 붙고 떨어질 때마다 정확히 호출되므로 그 문제가 원천 차단된다.
  // loadMore 는 페이지를 불러올 때마다 정체성이 바뀌니 ref 로 최신 것만 참조한다
  // (옵저버를 매번 재생성하면 이미 보이는 sentinel 재관찰 → 즉시 재발화로 전부 로드돼버림).
  const loadMoreMyCoursesRef = useRef(loadMoreMyCourses);
  useEffect(() => {
    loadMoreMyCoursesRef.current = loadMoreMyCourses;
  }, [loadMoreMyCourses]);
  const myObserverRef = useRef<IntersectionObserver | null>(null);
  const setMySentinel = useCallback((el: HTMLDivElement | null) => {
    myObserverRef.current?.disconnect();
    myObserverRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreMyCoursesRef.current();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    myObserverRef.current = observer;
  }, []);

  // 코스 삭제(소프트 삭제) — 목록에서 바로 삭제, 성공하면 목록에서도 즉시 제거.
  const [deletingCourseId, setDeletingCourseId] = useState<number | null>(null);
  const handleDeleteCourse = async (e: MouseEvent, courseId: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (!window.confirm("이 코스를 삭제할까요? 되돌릴 수 없습니다.")) return;
    if (!user) return;
    setDeletingCourseId(courseId);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error } = await supabase
        .from("tb_course")
        .update({ delete_yn: "Y", deletetime: new Date().toISOString(), deleter: user.id })
        .eq("course_id", courseId);
      if (error) throw error;
      setMyDbCourses((prev) => prev.filter((c) => c.course_id !== courseId));
    } catch (e2) {
      const message =
        e2 instanceof Error
          ? e2.message
          : typeof e2 === "object" && e2 !== null && "message" in e2
            ? String((e2 as { message: unknown }).message)
            : String(e2);
      setMyCoursesError(message);
    } finally {
      setDeletingCourseId(null);
    }
  };

  // 공유 코스 필터 (먼저 선언 — 아래 조회 로직에서 이 값을 참조한다)
  // 코스 상세 → 뒤로가기로 돌아왔을 때 카드 클릭 당시의 필터를 그대로 복원한다.
  const [showSharedFilters, setShowSharedFilters] = useState(() => {
    const saved = !id ? readCourseListReturn() : null;
    return saved?.tab === "shared" ? !!saved.showFilters : false;
  });
  const [sharedFilters, setSharedFilters] = useState<Filters>(() => {
    const saved = !id ? readCourseListReturn() : null;
    return saved?.tab === "shared" && saved.filters ? saved.filters : DEFAULT_FILTERS;
  });
  // 필터 패널에서 만지는 건 "초안(draft)" — 검색 버튼을 눌러야 실제 조회에 쓰이는 sharedFilters
  // 로 반영된다(선택할 때마다 바로 검색되지 않도록).
  const [sharedFilterDraft, setSharedFilterDraft] = useState<Filters>(sharedFilters);
  // 정렬은 필터와 달리 고르는 즉시 바로 반영된다(검색 버튼 없이).
  const [sharedSort, setSharedSort] = useState<CourseSort>(() => {
    const saved = !id ? readCourseListReturn() : null;
    return saved?.tab === "shared" && saved.sort ? saved.sort : DEFAULT_COURSE_SORT;
  });
  // 조회에 실제로 쓰이는 건 "적용된" 필터(sharedFilters) 기준 코드.
  const sharedGuCode = sharedAreaCodes.find((a) => a.name === sharedFilters.gu)?.code ?? "";
  // 반면 동 선택지는 필터 패널에서 "구"를 고르는 즉시(검색 누르기 전이라도) 바뀌어야 하므로
  // draft 기준으로 따로 계산한다.
  const sharedDraftGuCode =
    sharedAreaCodes.find((a) => a.name === sharedFilterDraft.gu)?.code ?? "";
  const [sharedDongOptions, setSharedDongOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!sharedDraftGuCode) {
      setSharedDongOptions([]);
      return;
    }
    let active = true;
    fetch(`/api/area-code/dong?gu=${encodeURIComponent(sharedDraftGuCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSharedDongOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sharedDraftGuCode]);

  // 접근성/테마/위치/즐겨찾기는 서버(쿼리 파라미터)에서 필터링한다 — 무한스크롤 페이지네이션과
  // 맞물려야 해서 클라이언트에서 로드된 페이지만 걸러내면 hasMore 판정이 어긋난다.
  // 배열은 순서와 무관하게 같은 조합이면 같은 요청으로 취급하려고 정렬 후 문자열 키로 비교한다.
  // gu 는 이름이 아니라 변환된 코드(sharedGuCode)를 키에 넣어야, area-code 로딩이 늦게 끝나
  // sharedGuCode 가 나중에 채워지는 경우에도 재조회가 정확히 트리거된다.
  const sharedFilterKey = JSON.stringify({
    accessibility: [...sharedFilters.accessibility].sort(),
    themes: [...sharedFilters.themes].sort(),
    favoritesOnly: sharedFilters.favoritesOnly,
    gu: sharedGuCode,
    dong: sharedFilters.dong,
    headcount: sharedFilters.headcount,
    dateFrom: sharedFilters.dateFrom,
    dateTo: sharedFilters.dateTo,
    minRating: sharedFilters.minRating,
    sort: sharedSort
  });

  // 공유 코스 — tb_course.open_yn='Y' 를 필터 조건에 맞춰 DB에서 페이지 단위로 조회
  const SHARED_PAGE_SIZE = 20;
  const [sharedDbCourses, setSharedDbCourses] = useState<TourismSharedCourse[]>([]);
  const [sharedCoursesLoading, setSharedCoursesLoading] = useState(true);
  const [sharedCoursesLoadingMore, setSharedCoursesLoadingMore] = useState(false);
  const [sharedCoursesError, setSharedCoursesError] = useState("");
  const [sharedHasMore, setSharedHasMore] = useState(false);

  // 필터 "세대" — 필터가 바뀔 때(=처음부터 다시 조회할 때)만 증가한다.
  // "더보기"는 새 세대를 만들지 않고 현재 세대에 속한다: 더보기가 세대를 올려버리면 진행 중이던
  // 초기 조회가 stale 로 판정돼 응답이 통째로 버려지고 로딩 플래그도 못 내려 스피너가 고착된다.
  // 응답 도착 시 자기 세대가 아직 유효한지 확인한 뒤에만 상태를 반영한다.
  const sharedGenerationRef = useRef(0);
  // sentinel 의 IntersectionObserver 콜백과 "뒤로가기 복원" 효과가 거의 동시에 loadMore 를
  // 부를 수 있는데, 그 간격이 setState 커밋보다 짧으면 sharedCoursesLoadingMore 상태값이 아직
  // 갱신 전이라 가드를 통과해 같은 offset 으로 중복 요청 → 같은 코스가 두 번 붙어 React key 중복
  // 경고가 난다. ref 는 동기적으로 즉시 반영되므로 이 레이스를 막는다.
  const sharedLoadingMoreInFlightRef = useRef(false);

  useEffect(() => {
    const generation = ++sharedGenerationRef.current;
    sharedLoadingMoreInFlightRef.current = false;
    setSharedCoursesLoading(true);
    // 진행 중이던 "더보기"는 이 세대에서 무효 — 응답이 와도 stale 가드에 걸려 finally 가
    // 스킵되므로 여기서 미리 꺼두지 않으면 더보기 스피너가 켜진 채 남는다.
    setSharedCoursesLoadingMore(false);
    (async () => {
      try {
        const { items, hasMore } = await fetchSharedCourses(0, SHARED_PAGE_SIZE, {
          accessibility: sharedFilters.accessibility,
          themes: sharedFilters.themes,
          favoritesOnly: sharedFilters.favoritesOnly,
          gu: sharedGuCode,
          dong: sharedFilters.dong,
          headcount: sharedFilters.headcount,
          dateFrom: sharedFilters.dateFrom,
          dateTo: sharedFilters.dateTo,
          minRating: sharedFilters.minRating,
          sort: sharedSort
        });
        if (sharedGenerationRef.current !== generation) return;
        setSharedDbCourses(items);
        setSharedHasMore(hasMore);
      } catch (e) {
        if (sharedGenerationRef.current !== generation) return;
        setSharedCoursesError(e instanceof Error ? e.message : String(e));
      } finally {
        if (sharedGenerationRef.current === generation) setSharedCoursesLoading(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedFilterKey]);

  const loadMoreSharedCourses = useCallback(async () => {
    // 초기 조회(필터 변경 등)가 진행 중이면 더보기는 건너뛴다 — 목록이 스피너로 바뀌며 페이지가
    // 짧아진 순간 sentinel 이 뷰포트에 들어와 발화하는 것을 막는다.
    if (sharedCoursesLoading || sharedCoursesLoadingMore || !sharedHasMore) return;
    if (sharedLoadingMoreInFlightRef.current) return;
    sharedLoadingMoreInFlightRef.current = true;
    const generation = sharedGenerationRef.current; // 세대를 올리지 않고 현재 세대에 속한다
    const offset = sharedDbCourses.length;
    setSharedCoursesLoadingMore(true);
    try {
      const { items, hasMore } = await fetchSharedCourses(offset, SHARED_PAGE_SIZE, {
        accessibility: sharedFilters.accessibility,
        themes: sharedFilters.themes,
        favoritesOnly: sharedFilters.favoritesOnly,
        gu: sharedGuCode,
        dong: sharedFilters.dong,
        headcount: sharedFilters.headcount,
        dateFrom: sharedFilters.dateFrom,
        dateTo: sharedFilters.dateTo,
        minRating: sharedFilters.minRating,
        sort: sharedSort
      });
      if (sharedGenerationRef.current !== generation) return;
      // 방어적 중복 제거 — 레이스로 같은 페이지가 두 번 붙는 경우에도 React key 중복이 나지 않게.
      setSharedDbCourses((prev) => {
        const existingIds = new Set(prev.map((c) => c.course_id));
        return [...prev, ...items.filter((c) => !existingIds.has(c.course_id))];
      });
      setSharedHasMore(hasMore);
    } catch (e) {
      if (sharedGenerationRef.current !== generation) return;
      setSharedCoursesError(e instanceof Error ? e.message : String(e));
    } finally {
      sharedLoadingMoreInFlightRef.current = false;
      if (sharedGenerationRef.current === generation) setSharedCoursesLoadingMore(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    sharedCoursesLoading,
    sharedCoursesLoadingMore,
    sharedHasMore,
    sharedDbCourses.length,
    sharedFilterKey,
    sharedGuCode
  ]);

  // 무한 스크롤 — 내 코스 쪽과 동일하게 callback ref 로 sentinel 노드에 옵저버를 붙인다.
  const loadMoreSharedCoursesRef = useRef(loadMoreSharedCourses);
  useEffect(() => {
    loadMoreSharedCoursesRef.current = loadMoreSharedCourses;
  }, [loadMoreSharedCourses]);
  const sharedObserverRef = useRef<IntersectionObserver | null>(null);
  const setSharedSentinel = useCallback((el: HTMLDivElement | null) => {
    sharedObserverRef.current?.disconnect();
    sharedObserverRef.current = null;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) loadMoreSharedCoursesRef.current();
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    sharedObserverRef.current = observer;
  }, []);

  // 추천 코스 필터 — 공유 코스와 동일하게 뒤로가기 시 필터 복원.
  // 추천 코스 탭의 필터/결과는 뒤로가기는 물론 새로고침해도 그대로 남아있어야 해서(LLM 호출 결과라
  // 비용·시간이 듦), "카드를 눌러 상세로 들어갔다 왔는지"와 무관하게 sessionStorage에서 무조건
  // 복원한다(readRecommendSession). 공유 코스 탭의 필터가 카드 클릭 시점의 courseListReturn에만
  // 의존하는 것과는 다른 범위 — 필터와 결과를 항상 같이 저장/복원해서 화면이 어긋나지 않게 한다.
  const restoredRecommendSession = !id ? readRecommendSession() : null;
  const [showFilters, setShowFilters] = useState(
    () => restoredRecommendSession?.showFilters ?? false
  );
  const [filters, setFilters] = useState<Filters>(
    () => restoredRecommendSession?.filters ?? DEFAULT_FILTERS
  );
  const [showResults, setShowResults] = useState(
    () => restoredRecommendSession?.showResults ?? false
  );
  // 추천 코스 필터의 위치(구/동) 선택지 — 공유 코스와 같은 area-code 조회 결과(sharedAreaCodes)를
  // 그대로 재사용한다(탭과 무관한 공용 데이터라 따로 다시 조회할 필요가 없다).
  const recommendGuCode = sharedAreaCodes.find((a) => a.name === filters.gu)?.code ?? "";
  const [recommendDongOptions, setRecommendDongOptions] = useState<string[]>([]);
  useEffect(() => {
    if (!recommendGuCode) {
      setRecommendDongOptions([]);
      return;
    }
    let active = true;
    fetch(`/api/area-code/dong?gu=${encodeURIComponent(recommendGuCode)}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setRecommendDongOptions(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [recommendGuCode]);

  // AI 추천 코스 — /api/courses/recommend 가 필터 조건에 맞춰 즉석에서 설계해준 초안들.
  const [recommendCourses, setRecommendCourses] = useState<RecommendedCourseDraft[]>(
    () => restoredRecommendSession?.courses ?? []
  );
  const [recommendLoading, setRecommendLoading] = useState(false);
  const [recommendError, setRecommendError] = useState("");
  const [recommendNotice, setRecommendNotice] = useState(
    () => restoredRecommendSession?.notice ?? ""
  );
  // AI 추천 하루 이용 횟수 — 응답에 실려오는 usage 를 그대로 반영(서버가 실제 제한을 판단).
  const [recommendUsage, setRecommendUsage] = useState<{
    used: number;
    remaining: number;
    limit: number;
  } | null>(null);

  // 배너가 처음 뜰 때부터(추천받기 누르기 전부터) 오늘 사용 현황을 보여준다 — 로그인해야
  // 실제로 추천을 받을 수 있으니, 로그인했을 때만 조회한다(비로그인은 어차피 눌러도
  // requireLoginOrRedirect로 막혀 의미가 없다).
  useEffect(() => {
    if (!user) return;
    let alive = true;
    fetch("/api/courses/recommend")
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { usage?: { used: number; remaining: number; limit: number } } | null) => {
        if (alive && json?.usage) setRecommendUsage(json.usage);
      })
      .catch(() => {
        // 조회 실패해도 배너 자체는 기본 문구(하루 3회)로 정상 표시되니 조용히 무시한다.
      });
    return () => {
      alive = false;
    };
  }, [user]);

  // 필터/결과가 바뀔 때마다 세션에 동기화 — 상세 화면(id 있음)에서는 건드리지 않는다.
  useEffect(() => {
    if (id) return;
    saveRecommendSession({
      filters,
      showFilters,
      showResults,
      courses: recommendCourses,
      notice: recommendNotice
    });
  }, [id, filters, showFilters, showResults, recommendCourses, recommendNotice]);

  // 회원 전용인 추천 목록은 비로그인 상태면 항상 비운다 — 보다가 로그아웃했을 때뿐 아니라,
  // (세션에 남아있던 목록이 있는 상태로) 애초에 비로그인으로 추천 탭에 들어왔을 때도 해당된다.
  // authLoading 이 끝나기 전(로그인 여부 아직 미확정)엔 건드리지 않는다 — 안 그러면 실제로는
  // 로그인돼 있는데 세션 확인이 끝나기 전 잠깐의 "user=null" 순간에 목록을 지워버리게 된다.
  useEffect(() => {
    if (authLoading || userId) return;
    if (!showResults && recommendCourses.length === 0 && !recommendNotice && !recommendError)
      return;
    setShowResults(false);
    setRecommendCourses([]);
    setRecommendNotice("");
    setRecommendError("");
  }, [authLoading, userId, showResults, recommendCourses.length, recommendNotice, recommendError]);

  const handleRecommend = async () => {
    if (!(await requireLoginOrRedirect(user, router, "/course?tab=recommend"))) return;
    setShowResults(true);
    setRecommendLoading(true);
    setRecommendError("");
    setRecommendNotice("");
    setRecommendCourses([]);
    try {
      const res = await fetch("/api/courses/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accessibility: filters.accessibility,
          themes: filters.themes,
          gu: recommendGuCode,
          dong: filters.dong,
          headcount: filters.headcount,
          dateFrom: filters.dateFrom,
          dateTo: filters.dateTo
        })
      });
      const json = (await res.json()) as {
        courses?: RecommendedCourseDraft[];
        message?: string;
        error?: string;
        usage?: { used: number; remaining: number; limit: number };
      };
      if (json.usage) setRecommendUsage(json.usage);
      if (!res.ok) {
        setRecommendError(json.error ?? "코스를 추천받지 못했어요. 잠시 뒤 다시 시도해 주세요.");
        return;
      }
      // 응답엔 기간이 없으니, 요청에 실었던 dateFrom/dateTo를 그대로 각 카드에 붙여둔다 —
      // 미리보기 상세에 "기간"으로 보여주고, "내 코스에 추가" 시 그대로 저장하기 위해서다.
      const courses = (json.courses ?? []).map((course) => ({
        ...course,
        startDate: filters.dateFrom || undefined,
        endDate: filters.dateTo || undefined
      }));
      setRecommendCourses(courses);
      setRecommendNotice(
        courses.length === 0 ? (json.message ?? "조건에 맞는 코스를 찾지 못했어요.") : ""
      );
    } catch {
      setRecommendError("코스를 추천받는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.");
    } finally {
      setRecommendLoading(false);
    }
  };

  // 코스 상세 → 뒤로가기로 돌아왔을 때, 클릭했던 코스 카드가 보이는 위치로 스크롤 복원.
  // 무한 스크롤이라 그 카드가 아직 로드 안 됐을 수 있어, 못 찾으면 다음 페이지를 더 불러와 재시도한다.
  // sessionStorage 는 "이 컴포넌트가 처음 마운트될 때" 딱 한 번만 읽어 고정한다 — 매 렌더/effect 마다
  // 다시 읽으면, 카드를 클릭해 상세로 "들어가는" 순간(아직 이 컴포넌트가 언마운트되기 전) 방금 자신이
  // 저장한 값을 곧바로 다시 읽어 스스로 소비해버리는 경쟁 상태가 생긴다(진짜 "뒤로가기"가 아닌데도).
  // 이 Course() 함수는 /course(목록)와 /course/[id](상세) 양쪽에서 재사용되므로, id 가 있을 때
  // (=상세 페이지로 새로 마운트됐을 때)는 애초에 읽지도, 복원 로직을 돌리지도 않는다.
  const [pendingRestore] = useState(() => (id ? null : readCourseListReturn()));
  useEffect(() => {
    if (id) return;
    if (!pendingRestore || pendingRestore.tab !== activeTab) return;
    if (pendingRestore.tab === "shared" && sharedCoursesLoading) return;
    if (pendingRestore.tab === "my" && myCoursesLoading) return;

    const el = document.querySelector(`[data-course-id="${pendingRestore.courseId}"]`);
    if (el) {
      el.scrollIntoView({ block: "center" });
      clearCourseListReturn();
      return;
    }
    if (pendingRestore.tab === "shared" && sharedHasMore) {
      loadMoreSharedCourses();
      return;
    }
    if (pendingRestore.tab === "my" && myHasMore) {
      loadMoreMyCourses();
      return;
    }
    // 더 불러올 게 없는데도 못 찾았다면(삭제됐거나 필터에 걸림) 저장했던 좌표로라도 복원.
    window.scrollTo(0, pendingRestore.scrollY);
    clearCourseListReturn();
  }, [
    id,
    pendingRestore,
    activeTab,
    sharedCoursesLoading,
    myCoursesLoading,
    sharedDbCourses,
    myDbCourses,
    sharedHasMore,
    myHasMore,
    loadMoreSharedCourses,
    loadMoreMyCourses
  ]);

  if (id) return <CourseDetail id={id} />;

  // 공유 코스 helpers — 필터 패널 조작은 전부 draft 에만 반영한다.
  const setShared = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setSharedFilterDraft((prev) => ({ ...prev, [key]: val }));
  const toggleSharedList = (key: "themes" | "accessibility", item: string) =>
    setSharedFilterDraft((prev) => {
      const list = prev[key] as string[];
      return {
        ...prev,
        [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
      };
    });
  // "검색" 버튼을 눌러야 draft 가 실제 조회에 쓰이는 sharedFilters 로 반영된다.
  const applySharedFilters = () => {
    setSharedFilters(sharedFilterDraft);
  };
  const resetShared = () => {
    setSharedFilterDraft(DEFAULT_FILTERS);
    setSharedFilters(DEFAULT_FILTERS);
  };
  const sharedFilterCount = [
    sharedFilters.accessibility.length > 0,
    sharedFilters.gu,
    sharedFilters.themes.length > 0,
    sharedFilters.headcount > 1,
    sharedFilters.dateFrom || sharedFilters.dateTo,
    sharedFilters.minRating > 0,
    sharedFilters.favoritesOnly
  ].filter(Boolean).length;
  // 접근성/테마/위치/인원/일정/별점/즐겨찾기 모두 서버에서 이미 필터링해 내려온다.
  const filteredShared = sharedDbCourses;

  // 내 코스 helpers — 공유 코스와 동일한 패턴.
  const setMy = <K extends keyof Filters>(key: K, val: Filters[K]) =>
    setMyFilterDraft((prev) => ({ ...prev, [key]: val }));
  const toggleMyList = (key: "themes" | "accessibility", item: string) =>
    setMyFilterDraft((prev) => {
      const list = prev[key] as string[];
      return {
        ...prev,
        [key]: list.includes(item) ? list.filter((x) => x !== item) : [...list, item]
      };
    });
  const applyMyFilters = () => {
    setMyFilters(myFilterDraft);
  };
  const resetMy = () => {
    setMyFilterDraft(DEFAULT_FILTERS);
    setMyFilters(DEFAULT_FILTERS);
  };
  const myFilterCount = [
    myFilters.accessibility.length > 0,
    myFilters.gu,
    myFilters.themes.length > 0,
    myFilters.headcount > 1,
    myFilters.dateFrom || myFilters.dateTo,
    myFilters.minRating > 0,
    myFilters.favoritesOnly
  ].filter(Boolean).length;

  // 추천 코스 helpers
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
  const resetAll = () => {
    setFilters(DEFAULT_FILTERS);
    setShowResults(false);
    setRecommendCourses([]);
    setRecommendError("");
    setRecommendNotice("");
    // 세션 동기화 effect가 위 상태 변화를 그대로 sessionStorage에도 반영한다.
  };
  const activeFilterCount = [
    filters.accessibility.length > 0,
    filters.gu,
    filters.themes.length > 0,
    filters.headcount > 1,
    filters.dateFrom || filters.dateTo
  ].filter(Boolean).length;
  return (
    <div className="space-y-6">
      {/* Tabs — 헤더(h-16) 바로 아래에 고정, 위쪽 여백은 살짝 줄임 */}
      <div className="bg-background sticky top-16 z-30 -mt-3 flex border-b border-gray-200">
        {(["shared", "recommend", "my"] as const).map((tab) => {
          const labels = { shared: "공유 코스", recommend: "추천 코스", my: "내 코스" };
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === tab
                  ? "text-brand-600 border-brand-600 border-b-2"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {labels[tab]}
            </button>
          );
        })}
      </div>

      {/* Shared Courses Tab */}
      {activeTab === "shared" && (
        <div className="space-y-4">
          {/* 필터 토글 헤더 + 정렬 */}
          <div className="flex items-center gap-2">
            <div className="flex flex-1 items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
              <button
                onClick={() => {
                  // 열 때는 draft 를 현재 적용된 값으로 다시 맞춰서, 이전에 검색 없이 만지다 만
                  // 값이 남아있지 않게 한다.
                  if (!showSharedFilters) setSharedFilterDraft(sharedFilters);
                  setShowSharedFilters(!showSharedFilters);
                }}
                className="flex flex-1 items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors outline-none hover:bg-gray-50 focus:outline-none focus-visible:outline-none"
              >
                <div className="flex items-center gap-2">
                  <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                  <span>필터</span>
                  {sharedFilterCount > 0 && (
                    <span className="bg-brand-600 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white">
                      {sharedFilterCount}
                    </span>
                  )}
                </div>
                <ChevronDown
                  className={`h-4 w-4 text-gray-400 transition-transform ${showSharedFilters ? "rotate-180" : ""}`}
                />
              </button>
              {sharedFilterCount > 0 && (
                <button
                  onClick={resetShared}
                  className="shrink-0 border-l border-gray-200 px-3 py-2.5 text-xs text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                >
                  초기화
                </button>
              )}
            </div>
            <div className="shrink-0">
              <Select
                value={sharedSort}
                onChange={(v) => setSharedSort(v as CourseSort)}
                ariaLabel="정렬 기준"
                className="rounded-xl border-gray-200 py-2.5 pr-3 pl-3 text-sm font-semibold text-gray-700"
                options={COURSE_SORT_OPTIONS}
              />
            </div>
          </div>

          {/* 필터 패널 */}
          {showSharedFilters && (
            <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
              <FilterFields
                filters={sharedFilterDraft}
                set={setShared}
                toggleList={toggleSharedList}
                guOptions={sharedAreaCodes.map((a) => a.name)}
                dongOptions={sharedDongOptions}
              />
              <button
                onClick={applySharedFilters}
                className="bg-brand-600 hover:bg-brand-700 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors"
              >
                검색
              </button>
            </div>
          )}

          {/* 결과 수 */}
          {sharedCoursesError ? (
            <p className="text-sm text-red-500">{sharedCoursesError}</p>
          ) : (
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{filteredShared.length}개</span>의 코스
              {sharedFilterCount > 0 && "를 찾았어요"}
            </p>
          )}

          {/* 코스 목록 */}
          {sharedCoursesLoading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
              <span className="border-brand-500 h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-transparent" />
              불러오는 중...
            </div>
          ) : filteredShared.length > 0 ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filteredShared.map((course) => (
                <Card key={course.course_id} asChild variant="interactive">
                  <Link
                    href={`/course/${course.course_id}`}
                    data-course-id={course.course_id}
                    onClick={() =>
                      saveCourseListReturn(
                        "shared",
                        course.course_id,
                        sharedFilters,
                        showSharedFilters,
                        sharedSort
                      )
                    }
                    className="block"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="text-ink truncate font-semibold">{course.course_nm}</h3>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div
                          className="flex items-center gap-1"
                          aria-label={`별점 ${course.average_rating.toFixed(1)}점`}
                        >
                          <Star
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                            aria-hidden="true"
                          />
                          <span className="text-sm font-semibold text-gray-800" aria-hidden="true">
                            {course.average_rating.toFixed(1)}
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-1"
                          aria-label={`즐겨찾기 ${course.like_count}개`}
                        >
                          <Heart className="h-4 w-4 fill-red-400 text-red-400" aria-hidden="true" />
                          <span className="text-sm font-semibold text-gray-800" aria-hidden="true">
                            {course.like_count}
                          </span>
                        </div>
                      </div>
                    </div>
                    <CourseAuthorRow
                      authorType={course.author_role === "admin" ? "admin" : "user"}
                      author={course.author_nickname}
                      badgeAfter
                    />
                    <div className="mb-2 flex min-h-6 flex-wrap gap-1.5">
                      {course.hashtags.map((label) => (
                        <Badge key={label} tone="brand" shape="pill">
                          #{label}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm text-gray-500">
                      <div className="flex shrink-0 gap-2 whitespace-nowrap">
                        {(course.startdate || course.enddate) && (
                          <>
                            <span className="text-steel">
                              {course.startdate?.slice(0, 10) ?? ""}
                              {" ~ "}
                              {course.enddate?.slice(0, 10) ?? ""}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{course.place_count}곳</span>
                      </div>
                      <span className="text-steel shrink-0 text-xs whitespace-nowrap">
                        등록 {formatDotDate(course.registtime)}
                        {course.updatetime && ` · 수정 ${formatDotDate(course.updatetime)}`}
                      </span>
                    </div>
                  </Link>
                </Card>
              ))}
            </div>
          ) : (
            <div className="py-12 text-center text-gray-400">
              <X className="mx-auto mb-2 h-10 w-10 opacity-30" />
              <p className="text-sm">조건에 맞는 코스가 없어요</p>
              <button
                onClick={resetShared}
                className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
              >
                필터 초기화
              </button>
            </div>
          )}

          {/* 무한 스크롤 sentinel — 화면에 보이면 자동으로 다음 페이지 로드.
              초기 조회 중에는 목록이 스피너로 바뀌어 페이지가 짧아지므로, sentinel 을 아예
              렌더하지 않아 그 순간 뷰포트에 들어와 발화하는 일이 없게 한다. */}
          {sharedHasMore && !sharedCoursesLoading && (
            <div ref={setSharedSentinel} className="flex items-center justify-center gap-2 py-6">
              {sharedCoursesLoadingMore && (
                <>
                  <span className="border-brand-500 h-6 w-6 animate-spin rounded-full border-[3px] border-gray-200 border-t-transparent" />
                  <span className="text-sm font-medium text-gray-500">불러오는 중...</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Recommend Tab */}
      {activeTab === "recommend" && (
        <div className="space-y-4">
          {/* 필터 토글 헤더 */}
          <div className="flex items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="flex flex-1 items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
            >
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                <span>필터</span>
                {activeFilterCount > 0 && (
                  <span className="bg-brand-600 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </div>
              <ChevronDown
                className={`h-4 w-4 text-gray-400 transition-transform ${showFilters ? "rotate-180" : ""}`}
              />
            </button>
            {(activeFilterCount > 0 || showResults) && (
              <button
                onClick={resetAll}
                className="shrink-0 border-l border-gray-200 px-3 py-2.5 text-xs text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
              >
                초기화
              </button>
            )}
          </div>

          {/* 필터 패널 */}
          {showFilters && (
            <div className="rounded-xl border border-gray-200 bg-white p-4">
              <FilterFields
                filters={filters}
                set={set}
                toggleList={toggleList}
                guOptions={sharedAreaCodes.map((a) => a.name)}
                dongOptions={recommendDongOptions}
                hideRating
                hideFavorites
              />
            </div>
          )}

          {/* AI 추천 배너 */}
          <div className="bg-brand-50 flex items-center justify-between rounded-xl p-4">
            <div className="flex items-center gap-2">
              <Sparkles className="text-brand-600 h-5 w-5" />
              <div>
                <p className="text-brand-900 text-sm font-semibold">AI 코스 추천받기</p>
                <p className="text-brand-600 mt-0.5 text-xs">
                  필터 조건에 맞는 최적의 코스를 최대 5개까지 설계해드려요 · 하루{" "}
                  {recommendUsage?.limit ?? 3}회까지 이용할 수 있어요
                  {recommendUsage
                    ? ` (오늘 ${recommendUsage.used}/${recommendUsage.limit}회 사용)`
                    : ""}
                </p>
              </div>
            </div>
            <button
              onClick={handleRecommend}
              disabled={recommendLoading || recommendUsage?.remaining === 0}
              className="bg-brand-600 hover:bg-brand-700 shrink-0 rounded-lg px-4 py-2 text-sm text-white transition-colors disabled:opacity-60"
            >
              {recommendLoading ? "설계 중..." : "추천받기"}
            </button>
          </div>

          {/* 결과 */}
          {showResults ? (
            recommendLoading ? (
              <div className="relative min-h-64 overflow-hidden rounded-xl" aria-busy="true">
                <DaiyuCompactLoading
                  title="다유가 코스를 설계하고 있어요"
                  detail="선택한 조건과 이동 편의 정보를 맞춰 장소를 연결하는 중이에요."
                  contained
                />
              </div>
            ) : recommendError ? (
              <div className="py-12 text-center text-gray-400">
                <X className="mx-auto mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">{recommendError}</p>
                <button
                  onClick={handleRecommend}
                  className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
                >
                  다시 시도
                </button>
              </div>
            ) : recommendCourses.length > 0 ? (
              <>
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-gray-800">{recommendCourses.length}개</span>의
                  코스를 설계했어요
                </p>
                <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                  이 목록은 필터를 초기화하거나 다시 추천받거나 로그아웃하면 사라져요. 마음에 드는
                  코스는 상세로 들어가서 미리 저장해 두세요.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {recommendCourses.map((course, index) => (
                    <Card key={`${course.title}-${index}`} asChild variant="interactive">
                      <Link
                        href={`/course/${AI_PREVIEW_ROUTE_ID}`}
                        data-course-id={index}
                        onClick={() => {
                          saveAiCoursePreview(course);
                          saveCourseListReturn("recommend", index, filters, showFilters);
                        }}
                        className="block"
                      >
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <h3 className="text-ink truncate font-semibold">{course.title}</h3>
                          </div>
                          <div className="text-brand-600 flex shrink-0 items-center gap-1 text-xs font-semibold">
                            <Sparkles className="h-3.5 w-3.5" />
                            AI 추천
                          </div>
                        </div>
                        <CourseAuthorRow authorType="admin" author="다유 AI" badgeAfter />
                        {course.summary && (
                          <p className="mb-2 line-clamp-2 text-sm text-gray-500">
                            {course.summary}
                          </p>
                        )}
                        {course.hashtags.length > 0 && (
                          <div className="mb-2 flex flex-wrap gap-1.5">
                            {course.hashtags.map((label) => (
                              <Badge key={label} tone="brand" shape="pill">
                                #{label}
                              </Badge>
                            ))}
                          </div>
                        )}
                        <div className="flex gap-2 text-sm text-gray-500">
                          <span>{course.days.length}일</span>
                          <span>•</span>
                          <span>{course.placeCount}곳</span>
                        </div>
                      </Link>
                    </Card>
                  ))}
                </div>
              </>
            ) : (
              <div className="py-12 text-center text-gray-400">
                <X className="mx-auto mb-2 h-10 w-10 opacity-30" />
                <p className="text-sm">{recommendNotice || "조건에 맞는 코스가 없어요"}</p>
                <button
                  onClick={resetAll}
                  className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
                >
                  필터 초기화
                </button>
              </div>
            )
          ) : (
            <div className="py-14 text-center text-gray-400">
              <Sparkles className="text-brand-300 mx-auto mb-3 h-10 w-10" />
              <p className="text-sm font-medium text-gray-500">원하는 조건을 설정하고</p>
              <p className="text-sm text-gray-400">AI 코스 추천받기를 눌러보세요</p>
            </div>
          )}
        </div>
      )}

      {/* My Courses Tab */}
      {activeTab === "my" && (
        <div className="space-y-4">
          <button
            onClick={goCreateCourse}
            className="hover:border-brand-400 hover:text-brand-600 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-gray-300 py-4 text-gray-600 transition-colors"
          >
            <Plus className="h-5 w-5" />새 코스 만들기
          </button>
          {!user && (
            <p className="text-stone py-8 text-center text-sm">
              로그인하면 내가 만든 코스를 볼 수 있어요
            </p>
          )}

          {user && (
            <>
              {/* 필터 토글 헤더 + 정렬 — 공유 코스와 동일한 필터, 내 코스만 대상으로 적용 */}
              <div className="flex items-center gap-2">
                <div className="flex flex-1 items-center overflow-hidden rounded-xl border border-gray-200 bg-white">
                  <button
                    onClick={() => {
                      if (!showMyFilters) setMyFilterDraft(myFilters);
                      setShowMyFilters(!showMyFilters);
                    }}
                    className="flex flex-1 items-center justify-between px-4 py-2.5 text-sm font-semibold text-gray-700 transition-colors outline-none hover:bg-gray-50 focus:outline-none focus-visible:outline-none"
                  >
                    <div className="flex items-center gap-2">
                      <SlidersHorizontal className="h-4 w-4 text-gray-500" />
                      <span>필터</span>
                      {myFilterCount > 0 && (
                        <span className="bg-brand-600 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-white">
                          {myFilterCount}
                        </span>
                      )}
                    </div>
                    <ChevronDown
                      className={`h-4 w-4 text-gray-400 transition-transform ${showMyFilters ? "rotate-180" : ""}`}
                    />
                  </button>
                  {myFilterCount > 0 && (
                    <button
                      onClick={resetMy}
                      className="shrink-0 border-l border-gray-200 px-3 py-2.5 text-xs text-red-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      초기화
                    </button>
                  )}
                </div>
                <div className="shrink-0">
                  <Select
                    value={mySort}
                    onChange={(v) => setMySort(v as CourseSort)}
                    ariaLabel="정렬 기준"
                    className="rounded-xl border-gray-200 py-2.5 pr-3 pl-3 text-sm font-semibold text-gray-700"
                    options={COURSE_SORT_OPTIONS}
                  />
                </div>
              </div>

              {showMyFilters && (
                <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
                  <FilterFields
                    filters={myFilterDraft}
                    set={setMy}
                    toggleList={toggleMyList}
                    guOptions={sharedAreaCodes.map((a) => a.name)}
                    dongOptions={myDongOptions}
                  />
                  <button
                    onClick={applyMyFilters}
                    className="bg-brand-600 hover:bg-brand-700 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors"
                  >
                    검색
                  </button>
                </div>
              )}
            </>
          )}

          {user && myCoursesError && (
            <p className="text-sm text-red-500">목록 조회 실패: {myCoursesError}</p>
          )}
          {user && !myCoursesError && !myCoursesLoading && myDbCourses.length > 0 && (
            <p className="text-sm text-gray-500">
              <span className="font-semibold text-gray-800">{myDbCourses.length}개</span>의 코스
              {myFilterCount > 0 && "를 찾았어요"}
            </p>
          )}
          {user && myCoursesLoading && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-gray-400">
              <span className="border-brand-500 h-4 w-4 animate-spin rounded-full border-2 border-gray-200 border-t-transparent" />
              불러오는 중...
            </div>
          )}
          {user && !myCoursesError && !myCoursesLoading && myDbCourses.length === 0 && (
            <div className="py-12 text-center text-gray-400">
              {myFilterCount > 0 ? (
                <>
                  <X className="mx-auto mb-2 h-10 w-10 opacity-30" />
                  <p className="text-sm">조건에 맞는 코스가 없어요</p>
                  <button
                    onClick={resetMy}
                    className="text-brand-600 hover:text-brand-700 mt-2 text-sm underline underline-offset-2"
                  >
                    필터 초기화
                  </button>
                </>
              ) : (
                <p className="text-sm">아직 만든 코스가 없어요</p>
              )}
            </div>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {!myCoursesLoading &&
              myDbCourses.map((course) => (
                <Card key={course.course_id} asChild variant="interactive">
                  <Link
                    href={`/course/${course.course_id}`}
                    data-course-id={course.course_id}
                    onClick={() =>
                      saveCourseListReturn("my", course.course_id, myFilters, showMyFilters, mySort)
                    }
                    className="block"
                  >
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <h3 className="text-ink truncate font-semibold">{course.course_nm}</h3>
                        <Badge tone={course.open_yn === "N" ? "neutral" : "brand"} shape="tag">
                          {course.open_yn === "N" ? "비공개" : "공개"}
                        </Badge>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <div
                          className="flex items-center gap-1"
                          aria-label={`별점 ${(courseRatings[course.course_id] ?? 0).toFixed(1)}점`}
                        >
                          <Star
                            className="h-4 w-4 fill-yellow-400 text-yellow-400"
                            aria-hidden="true"
                          />
                          <span className="text-sm font-semibold text-gray-800" aria-hidden="true">
                            {(courseRatings[course.course_id] ?? 0).toFixed(1)}
                          </span>
                        </div>
                        <div
                          className="flex items-center gap-1"
                          aria-label={`즐겨찾기 ${courseLikeCounts[course.course_id] ?? 0}개`}
                        >
                          <Heart className="h-4 w-4 fill-red-400 text-red-400" aria-hidden="true" />
                          <span className="text-sm font-semibold text-gray-800" aria-hidden="true">
                            {courseLikeCounts[course.course_id] ?? 0}
                          </span>
                        </div>
                        <button
                          onClick={(e) => handleDeleteCourse(e, course.course_id)}
                          disabled={deletingCourseId === course.course_id}
                          className="rounded-lg p-1 text-gray-300 transition-colors hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
                          aria-label="코스 삭제"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                    <CourseAuthorRow
                      authorType={member?.role === "admin" ? "admin" : "user"}
                      author={member?.nickname ?? "나"}
                      badgeAfter
                    />
                    <div className="mb-2 flex min-h-6 flex-wrap gap-1.5">
                      {(courseHashtags[course.course_id] ?? []).map((label) => (
                        <Badge key={label} tone="brand" shape="pill">
                          #{label}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1 text-sm text-gray-500">
                      <div className="flex shrink-0 gap-2 whitespace-nowrap">
                        {(course.startdate || course.enddate) && (
                          <>
                            <span className="text-steel">
                              {course.startdate?.slice(0, 10) ?? ""}
                              {" ~ "}
                              {course.enddate?.slice(0, 10) ?? ""}
                            </span>
                            <span>•</span>
                          </>
                        )}
                        <span>{courseMeta[course.course_id]?.places ?? 0}곳</span>
                      </div>
                      <span className="text-steel shrink-0 text-xs whitespace-nowrap">
                        등록 {formatDotDate(course.registtime)}
                        {course.updatetime && ` · 수정 ${formatDotDate(course.updatetime)}`}
                      </span>
                    </div>
                  </Link>
                </Card>
              ))}
          </div>

          {/* 무한 스크롤 sentinel — 화면에 보이면 자동으로 다음 페이지 로드 */}
          {myHasMore && (
            <div ref={setMySentinel} className="flex items-center justify-center gap-2 py-6">
              {myCoursesLoadingMore && (
                <>
                  <span className="border-brand-500 h-6 w-6 animate-spin rounded-full border-[3px] border-gray-200 border-t-transparent" />
                  <span className="text-sm font-medium text-gray-500">불러오는 중...</span>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {loginNotice && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-xs whitespace-nowrap text-white shadow-lg">
          로그인 후 이용 가능합니다
        </div>
      )}
    </div>
  );
}

// ── 내 코스 ──────────────────────────────────────────────
type EditPlace = CoursePlace;
type EditDay = CourseDay;

function CourseDetail({ id }: { id: string }) {
  const isNew = id === "new";
  const isAiPreview = id === AI_PREVIEW_ROUTE_ID;
  const numId = Number(id);
  const router = useRouter();
  const { user } = useAuth();

  // 기존 코스 조회 — tb_course + tb_course_detail(+tb_place 조인)로 실제 데이터를 가져온다.
  const [dbCourse, setDbCourse] = useState<MyCourse | null>(null);
  // 소유 여부는 register(등록자 id)만 저장해두고 user 와 매번 비교해서 판단한다.
  // (로그인 상태값과 별개의 boolean 으로 한 번만 계산해두면 로그아웃해도 갱신되지 않는다.)
  const [courseRegister, setCourseRegister] = useState<string | null>(null);
  const [dbCourseLoading, setDbCourseLoading] = useState(!isNew);
  const [dbCourseError, setDbCourseError] = useState("");
  // tb_course_like 행 개수(즐겨찾기 수) — 상세화면에서 실시간 조회.
  const [likeCount, setLikeCount] = useState(0);
  // 코스 배지 — 포함된 장소들의 대분류+접근성 종합 상위 3개(개수 내림차순, 동률은 먼저 집계된 순서).
  const [courseBadges, setCourseBadges] = useState<{ label: string; count: number }[]>([]);
  // 등록자(닉네임/역할) + 등록일/수정일 — tb_course.register 를 tb_members 에서 조회.
  const [courseAuthor, setCourseAuthor] = useState<{
    nickname: string;
    role: "admin" | "user";
    registDate: string;
    updateDate: string | null;
  } | null>(null);

  // tb_course + tb_course_detail(+tb_place 조인) + tb_course_like 개수를 다시 읽어와 dbCourse/likeCount 를 갱신한다.
  // 최초 진입 시와, 편집 저장 직후(수정된 실제 데이터를 다시 반영) 둘 다에 쓴다.
  const loadCourseFromDb = useCallback(
    async (active: () => boolean) => {
      setDbCourseLoading(true);
      setDbCourseError("");
      try {
        const { createClient } = await import("@/utils/supabase/client");
        const supabase = createClient();

        const { data: courseRow, error: courseErr } = await supabase
          .from("tb_course")
          .select(
            "course_id, course_nm, open_yn, startdate, enddate, register, registtime, updatetime"
          )
          .eq("course_id", numId)
          .single();
        if (courseErr) throw courseErr;

        const { data: ownerRow } = await supabase
          .from("tb_members")
          .select("nickname, role")
          .eq("id", courseRow.register)
          .maybeSingle();
        if (active()) {
          setCourseAuthor({
            nickname: ownerRow?.nickname ?? "알 수 없음",
            role: ownerRow?.role === "admin" ? "admin" : "user",
            registDate: formatDotDate(courseRow.registtime),
            updateDate: courseRow.updatetime ? formatDotDate(courseRow.updatetime) : null
          });
        }

        const { count: likeCountResult, error: likeErr } = await supabase
          .from("tb_course_like")
          .select("*", { count: "exact", head: true })
          .eq("course_id", numId);
        if (likeErr) throw likeErr;
        if (active()) setLikeCount(likeCountResult ?? 0);

        const { data: detailRows, error: detailErr } = await supabase
          .from("tb_course_detail")
          .select("detail_id, day, place_id, starthour, endhour")
          .eq("course_id", numId)
          .order("day", { ascending: true })
          .order("detail_id", { ascending: true });
        if (detailErr) throw detailErr;

        const placeIds = [...new Set((detailRows ?? []).map((r) => r.place_id))];
        const placesById = new Map<
          number,
          {
            title: string;
            mapx: string;
            mapy: string;
            contentid: string | number | null;
            lclssystm1: string | null;
          }
        >();
        if (placeIds.length > 0) {
          const { data: placeRows, error: placeErr } = await supabase
            .from("tb_place")
            .select("place_id, title, mapx, mapy, contentid, lclssystm1")
            .in("place_id", placeIds);
          if (placeErr) throw placeErr;
          for (const p of placeRows ?? []) placesById.set(p.place_id, p);
        }

        // 코스 배지 — 코스에 포함된(중복 없는) 장소들의 대분류(lclssystm1)와 접근성 요약플래그를
        // 종합해서 개수를 세고, 가장 많은 3개만 배지로 보여준다.
        // 빵지순례(BK)는 lclssystm1엔 안 남는 자체 판정 테마라, getBakeryPlaceIds() 를 쓰는
        // /api/theme/bakery-place-ids 를 거쳐 따로 받아와야 한다(그 함수는 server-only 모듈이라
        // 클라이언트 컴포넌트에서 직접 못 부른다).
        const BAKERY_THEME_CODE = "BK";
        const bakeryPlaceIdSet = new Set<number>(
          await fetch("/api/theme/bakery-place-ids")
            .then((r) => r.json())
            .then((d: { placeIds?: number[] }) => d.placeIds ?? [])
            .catch(() => [])
        );
        const themeCodes = [...new Set([...placesById.values()].map((p) => p.lclssystm1))].filter(
          (v): v is string => v != null
        );
        if (placeIds.some((pid) => bakeryPlaceIdSet.has(pid))) themeCodes.push(BAKERY_THEME_CODE);
        const themeLabelByCode = new Map<string, string>();
        if (themeCodes.length > 0) {
          const { data: codeRows, error: codeErr } = await supabase
            .from("tb_code")
            .select("code_id, code_nm")
            .eq("code_group", "LCLSSYSTM1")
            .in("code_id", themeCodes);
          if (codeErr) throw codeErr;
          for (const c of codeRows ?? []) themeLabelByCode.set(c.code_id, c.code_nm);
        }

        const contentIds = [
          ...new Set(
            [...placesById.values()]
              .map((p) => (p.contentid != null && p.contentid !== "" ? String(p.contentid) : null))
              .filter((v): v is string => v != null)
          )
        ];
        const bfFlagsByContentId = new Map<
          string,
          { has_blind: boolean; has_deaf: boolean; has_gait: boolean; has_infant: boolean }
        >();
        if (contentIds.length > 0) {
          const { data: bfRows, error: bfErr } = await supabase
            .from("tb_place_barrierfree")
            .select("contentid, has_blind, has_deaf, has_gait, has_infant")
            .in("contentid", contentIds);
          if (bfErr) throw bfErr;
          for (const b of bfRows ?? []) bfFlagsByContentId.set(String(b.contentid), b);
        }

        const badgeCounts = new Map<string, number>();
        const bumpBadge = (label: string | null | undefined) => {
          if (!label) return;
          badgeCounts.set(label, (badgeCounts.get(label) ?? 0) + 1);
        };
        for (const [pid, p] of placesById.entries()) {
          if (p.lclssystm1) bumpBadge(themeLabelByCode.get(p.lclssystm1));
          if (bakeryPlaceIdSet.has(pid)) bumpBadge(themeLabelByCode.get(BAKERY_THEME_CODE));
          const contentId = p.contentid != null && p.contentid !== "" ? String(p.contentid) : null;
          const flags = contentId != null ? bfFlagsByContentId.get(contentId) : undefined;
          if (flags?.has_blind) bumpBadge("시각장애");
          if (flags?.has_deaf) bumpBadge("청각장애");
          if (flags?.has_gait) bumpBadge("보행장애");
          if (flags?.has_infant) bumpBadge("영유아");
        }
        const topBadges = [...badgeCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3)
          .map(([label, count]) => ({ label, count }));
        if (active()) setCourseBadges(topBadges);

        const dayMap = new Map<number, CoursePlace[]>();
        for (const r of detailRows ?? []) {
          const place = placesById.get(r.place_id);
          const list = dayMap.get(r.day) ?? [];
          list.push({
            id: r.detail_id,
            name: place?.title ?? "알 수 없는 장소",
            startHour: r.starthour,
            endHour: r.endhour,
            placeId: r.place_id,
            lat: place ? Number(place.mapy) : undefined,
            lng: place ? Number(place.mapx) : undefined,
            // /api/tourism/detail 은 tb_place.contentid(TourAPI id)로 조회한다 — place_id(내부 PK)와는 다른 값.
            contentId:
              place?.contentid != null && place.contentid !== ""
                ? String(place.contentid)
                : undefined,
            categoryCode: place?.lclssystm1 ?? null
          });
          dayMap.set(r.day, list);
        }
        const days: CourseDay[] =
          dayMap.size > 0
            ? [...dayMap.entries()]
                .sort((a, b) => a[0] - b[0])
                .map(([day, places]) => ({ day, places }))
            : [{ day: 1, places: [] }];

        // 코스 별점 — 후기 게시판(board_id=1)의 course_rating 평균. 후기가 없으면 0.0.
        const { data: ratingRows, error: ratingErr } = await supabase
          .from("tb_post")
          .select("course_rating")
          .eq("course_id", numId)
          .eq("board_id", 1)
          .eq("use_yn", true)
          .not("course_rating", "is", null);
        if (ratingErr) throw ratingErr;
        const ratedRows = (ratingRows ?? []) as { course_rating: number }[];
        const averageRating =
          ratedRows.length > 0
            ? Math.round(
                (ratedRows.reduce((sum, r) => sum + r.course_rating, 0) / ratedRows.length) * 10
              ) / 10
            : 0;

        if (!active()) return;
        setDbCourse({
          id: courseRow.course_id,
          title: courseRow.course_nm,
          duration: days.length > 1 ? `${days.length}일` : "반일",
          isPrivate: courseRow.open_yn !== "Y",
          rating: averageRating,
          likes: 0,
          tags: [],
          days,
          // startdate/enddate 는 DB 에서 timestamptz("2026-08-03T00:00:00+00:00")로 오므로,
          // <input type="date"> 가 인식하는 "YYYY-MM-DD" 로 미리 잘라둔다.
          // (안 자르면 편집 화면의 기간 입력란이 값을 인식 못 해 빈 채로 보인다.)
          startDate: courseRow.startdate ? String(courseRow.startdate).slice(0, 10) : undefined,
          endDate: courseRow.enddate ? String(courseRow.enddate).slice(0, 10) : undefined
        });
        setCourseRegister(courseRow.register);
      } catch (e) {
        // Supabase/Postgrest 에러는 Error 인스턴스가 아니라 {message,...} 객체라
        // String(e) 는 "[object Object]"가 된다. message 필드를 우선 꺼낸다.
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        if (active()) setDbCourseError(message);
      } finally {
        if (active()) setDbCourseLoading(false);
      }
    },
    [numId]
  );

  useEffect(() => {
    if (isNew || isAiPreview || Number.isNaN(numId)) return;
    let alive = true;
    loadCourseFromDb(() => alive);
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, isAiPreview, numId]);

  // AI 추천 미리보기 — 아직 tb_course 에 저장 안 된 초안이라 DB 조회 대신
  // 목록에서 카드를 누를 때 sessionStorage 에 넣어둔 draft 를 그대로 읽어와 dbCourse 에 채운다.
  // 이렇게 채워 넣기만 하면 "내 코스에 추가" 버튼 등 나머지 로직은 실제 코스일 때와 동일하게 동작한다.
  useEffect(() => {
    if (!isAiPreview) return;
    const draft = readAiCoursePreview();
    if (!draft) {
      setDbCourseError("추천 코스 미리보기를 찾을 수 없어요. 추천 코스 목록에서 다시 눌러 주세요.");
      setDbCourseLoading(false);
      return;
    }
    setDbCourse({
      id: 0,
      title: draft.title,
      duration: `${draft.days.length}일`,
      isPrivate: true,
      rating: 0,
      likes: 0,
      tags: [],
      startDate: draft.startDate,
      endDate: draft.endDate,
      days: draft.days.map((day) => ({
        day: day.day,
        places: day.places.map((place, index) => ({
          id: index,
          name: place.name,
          startHour: place.startHour,
          endHour: place.endHour,
          placeId: place.placeId,
          lat: place.lat,
          lng: place.lng,
          contentId: place.contentId,
          categoryCode: place.categoryCode
        }))
      }))
    });
    setCourseBadges(draft.hashtags.map((label) => ({ label, count: 0 })));
    // 목록 카드(1421번째 줄 근처)와 같은 표기 — 만든 주체는 나 자신이 아니라 다유 AI다.
    setCourseAuthor({
      nickname: "다유 AI",
      role: "admin",
      registDate: new Date().toISOString().slice(0, 10),
      updateDate: null
    });
    setDbCourseLoading(false);
  }, [isAiPreview]);

  const isOwned = isNew || (!!user && courseRegister === user.id);

  const baseCourseData: MyCourse = isNew
    ? {
        id: 0,
        title: "",
        duration: "1일",
        isPrivate: true,
        rating: 0,
        likes: 0,
        tags: [],
        days: [{ day: 1, places: [] }]
      }
    : (dbCourse ?? {
        id: numId,
        title: dbCourseLoading ? "불러오는 중..." : "코스를 찾을 수 없어요",
        duration: "1일",
        isPrivate: false,
        rating: 0,
        likes: 0,
        tags: [],
        days: [{ day: 1, places: [] }]
      });

  const [activeDay, setActiveDay] = useState(1);
  // 장소 검색으로 추가된(좌표 직접 보유) 코스 항목의 지도 노드를 클릭했을 때의 상세 보기.
  // 뒤로가기 시 코스 편집 패널로 바로 복귀한다.
  const [selectedSearchPlace, setSelectedSearchPlace] = useState<CoursePlace | null>(null);
  const [selectedSearchDetail, setSelectedSearchDetail] = useState<TourismDetail | null>(null);
  const [selectedSearchDetailLoading, setSelectedSearchDetailLoading] = useState(false);
  const [isEditing, setIsEditing] = useState(isNew);
  const [dayGuidePickerOpen, setDayGuidePickerOpen] = useState(false);
  const [dayGuideMode, setDayGuideMode] = useState<RouteMode | null>(null);
  const [dayGuideLoading, setDayGuideLoading] = useState(false);
  const [dayGuideError, setDayGuideError] = useState<string | null>(null);
  const [dayGuideDistanceM, setDayGuideDistanceM] = useState<number | null>(null);
  const [dayGuideDurationSec, setDayGuideDurationSec] = useState<number | null>(null);
  const [dayGuideTollFare, setDayGuideTollFare] = useState<number | null>(null);
  const [dayGuideRouteOptions, setDayGuideRouteOptions] = useState<RouteOption[] | null>(null);
  const [dayGuideSelectedRouteId, setDayGuideSelectedRouteId] = useState("0");
  const [dayGuideShowTrafficLegend, setDayGuideShowTrafficLegend] = useState(false);
  const dayGuideRouteOptionsRef = useRef<RouteOption[] | null>(null);
  const [dayGuidePath, setDayGuidePath] = useState<MapPathSegment[] | null>(null);
  const dayGuideRequestIdRef = useRef(0);

  // 모바일 편집 바텀시트 높이(%) — 핸들을 드래그해서 조절.
  // 하단 탭 네비게이션에 가려지는 부분은 시트를 위로 끌어올려서 볼 수 있게 한다(기본 65%, 최대 92%).
  // 핸들 자신이 드래그 도중 위치가 이동하므로(시트가 커지면 핸들도 같이 올라감), setPointerCapture 에
  // 의존하지 않고 window 에 직접 리스너를 붙여서 손가락이 핸들 밖으로 벗어나도 계속 추적한다.
  const [mobileSheetHeight, setMobileSheetHeight] = useState(65);
  const sheetDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const handleSheetDragStart = (e: ReactPointerEvent<HTMLDivElement>) => {
    // 브라우저 기본 스크롤/패닝 제스처가 같이 발동해서 지도·페이지가 스크롤되는 걸 막는다.
    e.preventDefault();
    sheetDragRef.current = { startY: e.clientY, startHeight: mobileSheetHeight };

    const onMove = (moveEvent: PointerEvent) => {
      if (!sheetDragRef.current) return;
      moveEvent.preventDefault();
      const containerHeight = window.innerHeight - 64; // calc(100vh - 64px) 와 동일한 식
      const deltaPercent =
        ((sheetDragRef.current.startY - moveEvent.clientY) / containerHeight) * 100;
      setMobileSheetHeight(
        Math.min(92, Math.max(30, sheetDragRef.current.startHeight + deltaPercent))
      );
    };
    const onUp = () => {
      sheetDragRef.current = null;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
    window.addEventListener("pointermove", onMove, { passive: false });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  };

  // 모바일에선 바텀시트가 화면 하단 mobileSheetHeight%를 덮어서, 지도 초기 위치를 맞출 때
  // 그만큼을 가려진 영역으로 쳐줘야 경로가 시트 위(보이는 영역)에 들어온다. 데스크톱(md 이상)은
  // 시트가 옆 사이드바라 지도를 안 가리므로 0.
  const [mapBottomOverlayPx, setMapBottomOverlayPx] = useState(0);
  // 지도 확대/축소·위치를 초기 상태로 되돌리는 버튼용 — 값을 바꿀 때마다 fitPathKey 가 달라져서
  // (다른 조건이 그대로여도) 강제로 다시 fit 되게 한다.
  const [mapResetNonce, setMapResetNonce] = useState(0);
  // "장소 추가" 검색 중엔 fitPathKey를 비워 코스 경로 맞춤이 카메라를 가로채지 않게 하므로,
  // 그 상태에서 초기화 버튼은 KakaoMap의 resetViewTrigger(항상 초기 화면으로)로 대신 처리한다.
  const [searchMapResetTrigger, setSearchMapResetTrigger] = useState(0);
  // 지도 오른쪽 하단 "기능 목록" 드롭다운 — 지도 초기화/테마 색상 범례/내 위치.
  const [mapMenuOpen, setMapMenuOpen] = useState(false);
  const mapMenuRef = useRef<HTMLDivElement>(null);
  // 예전엔 전체 화면을 덮는 배경 버튼으로 바깥 클릭을 감지했는데, 그 배경이 지도 위 마우스휠/
  // 터치 이벤트까지 가로채서 드롭다운이 열려 있는 동안 지도 확대/축소가 안 됐다. document 클릭을
  // 직접 듣고 메뉴 영역 바깥인지만 판정하면 지도 위에 아무 오버레이도 없어 확대/축소가 그대로 된다.
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
  const {
    location: myLocation,
    status: myLocationStatus,
    errorReason: myLocationError,
    start: startMyLocation,
    reset: resetMyLocation,
    focusTrigger: focusMyLocationTrigger
  } = useMyLocation();
  // 지도 영역 자체의 높이를 재야 한다 — window.innerHeight 로 계산하면 헤더 등 지도 위쪽 UI
  // 만큼 실제 지도 컨테이너보다 커서, 시트가 차지하는 비율(%)을 곱했을 때 실제 시트 높이보다
  // 과대 추정된다(버튼을 시트 바로 위가 아니라 그보다 훨씬 위에 띄우는 원인이었음).
  const mapAreaRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const updateOverlay = () => {
      const isMobile = window.innerWidth < 768; // Tailwind md 기준
      const containerHeight = mapAreaRef.current?.clientHeight ?? window.innerHeight;
      setMapBottomOverlayPx(isMobile ? Math.round(containerHeight * (mobileSheetHeight / 100)) : 0);
    };
    updateOverlay();
    window.addEventListener("resize", updateOverlay);
    return () => window.removeEventListener("resize", updateOverlay);
  }, [mobileSheetHeight]);

  const [editTitle, setEditTitle] = useState(baseCourseData.title);
  const [editIsPrivate, setEditIsPrivate] = useState(baseCourseData.isPrivate);
  const [editStartDate, setEditStartDate] = useState(baseCourseData.startDate ?? "");
  const [editEndDate, setEditEndDate] = useState(baseCourseData.endDate ?? "");
  const [editDays, setEditDays] = useState<EditDay[]>(baseCourseData.days);

  // editXxx 상태는 useState 초기값으로만 seed 되므로(첫 렌더 시점 값), DB fetch(dbCourse)가
  // 비동기로 늦게 도착하면 반영이 안 된다. dbCourse 가 새로 도착할 때마다 편집값을 그걸로 맞춘다.
  useEffect(() => {
    if (!dbCourse) return;
    setEditTitle(dbCourse.title);
    setEditIsPrivate(dbCourse.isPrivate);
    setEditStartDate(dbCourse.startDate ?? "");
    setEditEndDate(dbCourse.endDate ?? "");
    setEditDays(dbCourse.days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dbCourse]);

  // tb_course_like 즐겨찾기 — 로그인한 사용자가 이 코스를 이미 찜했는지 여부.
  const [favorited, setFavorited] = useState(false);
  const [favoriteBusy, setFavoriteBusy] = useState(false);
  const [favoriteNotice, setFavoriteNotice] = useState("");

  useEffect(() => {
    if (myLocationStatus !== "error") return;
    const message =
      myLocationError === "denied"
        ? "위치 접근 권한이 꺼져 있어요"
        : myLocationError === "outside_daejeon"
          ? "대전 지역 밖에서는 내 위치를 표시할 수 없어요"
          : "내 위치를 확인하지 못했어요";
    setFavoriteNotice(message);
    setTimeout(() => setFavoriteNotice(""), 2000);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myLocationStatus, myLocationError]);

  useEffect(() => {
    if (isNew || !user || Number.isNaN(numId)) {
      setFavorited(false);
      return;
    }
    let active = true;
    (async () => {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { data } = await supabase
        .from("tb_course_like")
        .select("like_id")
        .eq("course_id", numId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (active) setFavorited(!!data);
    })();
    return () => {
      active = false;
    };
  }, [isNew, numId, user]);

  const handleToggleFavorite = async () => {
    if (isNew || Number.isNaN(numId)) return;
    if (!user) {
      setFavoriteNotice("로그인 후 이용 가능합니다");
      setTimeout(() => setFavoriteNotice(""), 2000);
      return;
    }
    if (favoriteBusy) return;
    setFavoriteBusy(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      if (favorited) {
        const { error } = await supabase
          .from("tb_course_like")
          .delete()
          .eq("course_id", numId)
          .eq("user_id", user.id);
        if (error) throw error;
        setFavorited(false);
        setLikeCount((c) => Math.max(0, c - 1));
      } else {
        const { error } = await supabase.from("tb_course_like").insert({
          course_id: numId,
          user_id: user.id,
          registtime: new Date().toISOString()
        });
        if (error) throw error;
        setFavorited(true);
        setLikeCount((c) => c + 1);
      }
    } catch (e) {
      setFavoriteNotice(e instanceof Error ? e.message : String(e));
      setTimeout(() => setFavoriteNotice(""), 2500);
    } finally {
      setFavoriteBusy(false);
    }
  };

  // 카카오톡 공유 — 현재 코스 상세 화면 링크를 카카오톡 피드로 공유한다.
  const [sharing, setSharing] = useState(false);
  const handleShareKakao = async () => {
    if (isNew || Number.isNaN(numId) || sharing) return;
    setSharing(true);
    try {
      const url = `${window.location.origin}/course/${numId}`;
      await shareToKakaoTalk({
        title: courseData.title,
        description:
          courseBadges.length > 0
            ? courseBadges.map((b) => `#${b.label}`).join(" ")
            : "다대유에서 만든 무장애 여행 코스",
        imageUrl: `${window.location.origin}/daiyu-profile.png`,
        url
      });
    } catch (e) {
      setFavoriteNotice(e instanceof Error ? e.message : String(e));
      setTimeout(() => setFavoriteNotice(""), 2500);
    } finally {
      setSharing(false);
    }
  };

  // "내 코스에 추가" — 이 코스(장소·일정 그대로)를 내 소유의 새 코스로 복사한다.
  // 같은 코스를 여러 번 추가하는 것도 허용한다 — 클릭할 때마다 새 코스로 복사된다.
  const [addingCourse, setAddingCourse] = useState(false);
  const handleAddToMyCourse = async () => {
    if (!(await requireLoginOrRedirect(user, router, `/course/${id}`))) return;
    if (!user || !dbCourse || addingCourse) return;
    setAddingCourse(true);
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();

      const { data: course, error: courseErr } = await supabase
        .from("tb_course")
        .insert({
          course_nm: dbCourse.title,
          open_yn: "N", // 복사본은 기본적으로 비공개(내 코스)로 시작
          startdate: dbCourse.startDate || null,
          enddate: dbCourse.endDate || null,
          register: user.id
        })
        .select("course_id")
        .single();
      if (courseErr) throw courseErr;

      const detailRows = dbCourse.days.flatMap((d) =>
        d.places
          .filter((p) => p.placeId != null)
          .map((p) => ({
            course_id: course.course_id,
            day: d.day,
            place_id: p.placeId as number,
            starthour: p.startHour,
            endhour: p.endHour
          }))
      );
      if (detailRows.length > 0) {
        const { error: detailErr } = await supabase.from("tb_course_detail").insert(detailRows);
        if (detailErr) throw detailErr;
      }

      setFavoriteNotice("내 코스에 추가했어요");
      setTimeout(() => setFavoriteNotice(""), 2000);
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
      setFavoriteNotice(message);
      setTimeout(() => setFavoriteNotice(""), 2500);
    } finally {
      setAddingCourse(false);
    }
  };

  const [showErrors, setShowErrors] = useState(false); // 저장 시 필수값 검증 표시
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");

  // ── 장소 추가: 지도 화면과 공용인 PlaceSearchSidebar 로 검색/상세 → "코스에 추가" ──
  const [placeSearchOpen, setPlaceSearchOpen] = useState(false);
  const placeFilters = useFilters();
  const ps = usePlaceSearch({
    accessibility: placeFilters.filters.accessibility,
    gu: placeFilters.filters.gu,
    dong: placeFilters.filters.dong,
    favoritesOnly: placeFilters.filters.favoritesOnly,
    headcount: placeFilters.filters.headcount,
    dateFrom: placeFilters.filters.dateFrom,
    dateTo: placeFilters.filters.dateTo,
    themes: placeFilters.filters.themes,
    minRating: placeFilters.filters.minRating
  });
  // 필터/검색을 아무것도 안 켰을 때만 핫플레이스를 기본으로 보여준다.
  // 필터를 켰는데 결과가 0개면(searchPlaces=[]) 그대로 빈 목록으로 둬서 "결과 없음"이 보이게 한다.
  const psDisplayPlaces = ps.hasActiveFilter ? ps.searchPlaces : ps.topRatedPlaces;
  // 상세의 "내 코스에 추가" → 현재 활성 Day 에 장소 추가 후 폼으로 복귀
  const addPlaceFromSearch = () => {
    const sp = ps.searchDetail;
    // 카카오 검색 결과는 tb_place에 없어 place_id가 없으므로 코스에 저장할 수 없다
    // (버튼 자체를 숨기지만, 방어적으로 한 번 더 막는다).
    if (!sp || sp.source === "kakao") return;
    // sp.id 는 contentid 다. tb_course_detail.place_id 는 tb_place.place_id(내부 PK)를 참조하므로
    // 반드시 sp.placeId(카카오 출처는 없음)를 써야 한다 — contentid 를 넣으면 FK 위반으로 insert 가 실패한다.
    setEditDays((days) =>
      days.map((d) => {
        if (d.day !== activeDay) return d;
        // 기본 시작시각: 첫 장소는 9시, 이후는 바로 앞 장소의 종료시각. 종료시각은 시작+1시간.
        const prev = d.places[d.places.length - 1];
        const startHour = prev ? prev.endHour : 9;
        const endHour = addOneHour(startHour);
        return {
          ...d,
          places: [
            ...d.places,
            {
              id: Date.now(),
              name: sp.name,
              startHour,
              endHour,
              placeId: sp.placeId,
              lat: sp.lat,
              lng: sp.lng,
              // sp.id 는 DB 출처일 때만 contentid 다(관리자 등록 장소는 "a" 접두 문자열) — /api/tourism/detail 조회용.
              contentId: sp.source === "db" ? sp.id : undefined,
              // 지금 상세 패널에 열려있는 장소의 테마 코드 — 노드/순서아이콘 색이 바로 반영되게.
              categoryCode: ps.tourismDetail?.categoryCode ?? null
            }
          ]
        };
      })
    );
    ps.setSearchDetailId(null);
    setPlaceSearchOpen(false);
  };

  const courseData = isEditing
    ? { ...baseCourseData, title: editTitle, days: editDays }
    : baseCourseData;

  const currentPlaces = courseData.days[activeDay - 1]?.places ?? [];

  const dayGuideStops = currentPlaces
    .filter(
      (p) => p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng)
    )
    .map((p) => ({ lat: p.lat as number, lng: p.lng as number, name: p.name }));

  const clearDayGuide = () => {
    dayGuideRequestIdRef.current += 1;
    setDayGuideMode(null);
    setDayGuideLoading(false);
    setDayGuideError(null);
    setDayGuideDistanceM(null);
    setDayGuideDurationSec(null);
    setDayGuideTollFare(null);
    dayGuideRouteOptionsRef.current = null;
    setDayGuideRouteOptions(null);
    setDayGuideSelectedRouteId("0");
    setDayGuideShowTrafficLegend(false);
    setDayGuidePath(null);
    setDayGuidePickerOpen(false);
  };

  const handleDayGuideSelectRoute = (id: string) => {
    const options = dayGuideRouteOptionsRef.current;
    if (!options) return;
    const opt = options.find((r) => r.id === id);
    if (!opt) return;
    setDayGuideSelectedRouteId(id);
    setDayGuidePath([
      buildRoutePathFromOption(
        opt,
        dayGuideMode ?? "car",
        DAY_LINE_COLORS[(activeDay - 1) % DAY_LINE_COLORS.length]
      )
    ]);
    setDayGuideDistanceM(opt.distanceM);
    setDayGuideDurationSec(opt.durationSec);
    setDayGuideTollFare(opt.tollFare);
    setDayGuideShowTrafficLegend(
      dayGuideMode === "car" && !opt.fallback && Boolean(opt.trafficChunks?.length)
    );
  };

  const applyDayGuideResult = (
    result: Awaited<ReturnType<typeof fetchDirectionsForStops>>,
    mode: RouteMode
  ) => {
    const options = result.routes?.length ? result.routes : [pickRouteOption(result)];
    const multi = options.length > 1 ? options : null;
    dayGuideRouteOptionsRef.current = multi;
    setDayGuideRouteOptions(multi);
    const primary = pickRouteOption(result, "0");
    setDayGuideSelectedRouteId(primary.id);
    setDayGuidePath([
      buildRoutePathFromOption(
        primary,
        mode,
        DAY_LINE_COLORS[(activeDay - 1) % DAY_LINE_COLORS.length]
      )
    ]);
    setDayGuideDistanceM(primary.distanceM);
    setDayGuideDurationSec(primary.durationSec);
    setDayGuideTollFare(primary.tollFare);
    setDayGuideShowTrafficLegend(
      mode === "car" && !result.fallback && Boolean(primary.trafficChunks?.length)
    );
    setDayGuideError(
      result.fallback ? "대략 경로예요. 정확한 안내는 카카오맵에서 시작하세요." : null
    );
  };

  const startDayGuide = async (mode: RouteMode) => {
    setDayGuidePickerOpen(false);
    setDayGuideMode(mode);
    setDayGuideLoading(true);
    setDayGuideError(null);
    setDayGuideDistanceM(null);
    setDayGuideDurationSec(null);
    setDayGuideTollFare(null);
    dayGuideRouteOptionsRef.current = null;
    setDayGuideRouteOptions(null);
    setDayGuideSelectedRouteId("0");
    setDayGuideShowTrafficLegend(false);
    const requestId = ++dayGuideRequestIdRef.current;

    if (dayGuideStops.length < 2) {
      setDayGuideLoading(false);
      setDayGuidePath(null);
      setDayGuideError("이 Day에 좌표가 있는 장소가 2곳 이상 있어야 안내할 수 있어요.");
      return;
    }

    try {
      const result = await fetchDirectionsForStops(dayGuideStops, mode);
      if (requestId !== dayGuideRequestIdRef.current) return;
      applyDayGuideResult(result, mode);
    } catch (e) {
      if (requestId !== dayGuideRequestIdRef.current) return;
      dayGuideRouteOptionsRef.current = null;
      setDayGuideRouteOptions(null);
      setDayGuideSelectedRouteId("0");
      setDayGuideShowTrafficLegend(false);
      setDayGuideTollFare(null);
      setDayGuidePath([
        {
          points: dayGuideStops,
          color: DAY_LINE_COLORS[(activeDay - 1) % DAY_LINE_COLORS.length],
          dashed: true
        }
      ]);
      setDayGuideError(
        e instanceof Error
          ? `${e.message} 카카오맵으로 안내할 수 있어요.`
          : "경로 미리보기에 실패했어요. 카카오맵으로 안내할 수 있어요."
      );
    } finally {
      if (requestId === dayGuideRequestIdRef.current) {
        setDayGuideLoading(false);
      }
    }
  };

  // Day 탭이 바뀌면 안내 중일 때 해당 Day로 다시 계산
  useEffect(() => {
    if (!dayGuideMode || isEditing) return;
    const mode = dayGuideMode;
    const timer = window.setTimeout(() => {
      void startDayGuide(mode);
    }, 0);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeDay]);

  // KakaoMap 마커·경로선 — 특정 Day 만이 아니라 "모든 일정"을 Day 순서 → 각 Day 내 장소 순서로
  // 이어서 한 번에 보여준다(Day1 마지막 장소 → Day2 첫 장소 순으로 연결).
  // 좌표(p.lat/lng)가 있는 항목(장소 검색으로 추가된 실제 장소)만 지도에 표시한다.
  // 색은 "지금 보고 있는 Day"에만 쓴다 — 그 Day 노드는 테마색 + 원래 크기, 경로선은 원래 초록.
  // 다른 Day는 노드·선 전부 회색 + 노드 크기도 살짝 작게 줄여서 덜 눈에 띄게 한다.
  type MarkerSource = {
    kind: "real";
    item: CoursePlace;
    markerId: string;
    lat: number;
    lng: number;
    color: string;
    day: number;
    orderInDay: number;
    isActiveDay: boolean;
  };

  const INACTIVE_DAY_COLOR = "#9ca3af";
  const ACTIVE_DAY_LINE_COLOR = "#16a34a";

  const markerSources: MarkerSource[] = [];
  const sortedDays = [...courseData.days].sort((a, b) => a.day - b.day);
  sortedDays.forEach((d) => {
    const isActiveDay = d.day === activeDay;
    let orderInDay = 0;
    for (const p of d.places) {
      if (p.lat == null || p.lng == null) continue;
      orderInDay += 1;
      markerSources.push({
        markerId: `real:${d.day}:${p.id}`,
        lat: p.lat,
        lng: p.lng,
        color: isActiveDay ? getCategoryColor(p.categoryCode) : INACTIVE_DAY_COLOR,
        kind: "real",
        item: p,
        day: d.day,
        orderInDay,
        isActiveDay
      });
    }
  });

  // 지금 보는 Day의 마커는 장소 테마별 색 + 원래 크기, 다른 Day는 회색 + 살짝 작게.
  // 방문 순서 번호는 두 경우 다 표시한다.
  const mapMarkers: MapMarker[] = markerSources.map((m) => ({
    id: m.markerId,
    lat: m.lat,
    lng: m.lng,
    color: m.color,
    label: String(m.orderInDay),
    size: m.isActiveDay ? "md" : "sm",
    // 회색(다른 Day) 노드와 겹칠 때 색 있는(지금 보는 Day) 노드가 항상 위로 오게 한다.
    zIndex: m.isActiveDay ? 4 : 2
  }));

  // "장소 추가" 검색 패널이 열려 있을 때는 지도 화면과 똑같이 검색 결과 자체를 지도에 마커로
  // 보여준다(기존엔 검색 중엔 지도에 아무 표시도 없이 기존 코스 마커만 그대로였음).
  const searchResultMarkers: MapMarker[] = psDisplayPlaces.map((sp) => {
    if (sp.source === "kakao") {
      return {
        id: sp.id,
        lat: sp.lat,
        lng: sp.lng,
        color: "#FEE500",
        borderColor: "#2563EB",
        shape: "teardrop"
      };
    }
    return {
      id: sp.id,
      lat: sp.lat,
      lng: sp.lng,
      color: getCategoryColor(sp.categoryCode)
    };
  });

  // 경로선 — 지금 보는 Day만 원래 초록색 실선, 나머지 Day는 회색 실선으로 죽여둔다.
  // Day 가 바뀌는 경계(Day1 마지막 장소 → Day2 첫 장소)는 항상 옅은 회색 점선.
  // 어느 Day의 선을 클릭해도 그 Day로 전환되니, 회색 선을 눌러서 바로 확인할 수 있다.
  const coursePath: MapPathSegment[] = [];
  let prevDayLastPoint: { lat: number; lng: number } | null = null;
  for (const d of sortedDays) {
    const dayMarkers = markerSources.filter((m) => m.day === d.day);
    if (dayMarkers.length === 0) continue;
    const dayPoints = dayMarkers.map((m) => ({ lat: m.lat, lng: m.lng }));
    const isActiveDay = d.day === activeDay;

    if (prevDayLastPoint) {
      coursePath.push({
        points: [prevDayLastPoint, dayPoints[0]],
        color: "#d1d5db",
        dashed: true
      });
    }
    coursePath.push({
      points: dayPoints,
      color: isActiveDay ? ACTIVE_DAY_LINE_COLOR : INACTIVE_DAY_COLOR,
      label: `Day ${d.day}`,
      day: d.day,
      // 회색(다른 Day) 선과 겹칠 때 색 있는(지금 보는 Day) 선이 항상 위로 오게 한다.
      zIndex: isActiveDay ? 3 : 2
    });

    prevDayLastPoint = dayPoints[dayPoints.length - 1];
  }
  const selectedMarkerId = selectedSearchPlace
    ? (markerSources.find((m) => m.item.id === selectedSearchPlace.id)?.markerId ?? null)
    : null;

  // 지도에서 검색 추가 장소의 노드를 클릭하면(selectedSearchPlace) 상세를 새로 조회한다.
  useEffect(() => {
    if (!selectedSearchPlace?.contentId) {
      setSelectedSearchDetail(null);
      return;
    }
    let active = true;
    setSelectedSearchDetailLoading(true);
    fetch(`/api/tourism/detail?contentId=${selectedSearchPlace.contentId}`)
      .then((r) => r.json())
      .then((data) => {
        if (active) setSelectedSearchDetail(data ?? null);
      })
      .catch(() => {
        if (active) setSelectedSearchDetail(null);
      })
      .finally(() => {
        if (active) setSelectedSearchDetailLoading(false);
      });
    return () => {
      active = false;
    };
  }, [selectedSearchPlace?.contentId]);

  // 필수값: 코스 제목(course_nm). 공유 여부(open_yn)는 기본값이 있어 항상 채워지므로 검증 불필요.
  const titleMissing = editTitle.trim().length === 0;

  const handleSave = async () => {
    // 필수값이 없으면 저장하지 않고 안내만 표시
    if (titleMissing) {
      setShowErrors(true);
      return;
    }

    // tb_course RLS 정책이 register = auth.uid() 를 요구하므로 로그인 필요.
    if (!user) {
      setSaveError("로그인 후 저장할 수 있어요.");
      return;
    }

    // 기존 코스 편집 — tb_course update + tb_course_detail 전체 재구성을 RPC 하나로 묶어서
    // 원자적으로 처리한다(update_course_with_details, supabase/schema-course-update-atomic.sql).
    // 예전엔 update → delete → insert를 클라이언트에서 3번 나눠 호출해서, delete는 성공하고
    // insert가 실패하면(네트워크 오류 등) 기존 장소 일정이 통째로 사라진 채 에러만 떴다.
    if (!isNew) {
      setSaving(true);
      setSaveError("");
      try {
        const { createClient } = await import("@/utils/supabase/client");
        const supabase = createClient();

        const details = editDays.flatMap((d) =>
          d.places
            .filter((p) => p.placeId != null)
            .map((p) => ({
              day: d.day,
              place_id: p.placeId as number,
              starthour: p.startHour,
              endhour: p.endHour
            }))
        );

        const { error: rpcErr } = await supabase.rpc("update_course_with_details", {
          p_course_id: numId,
          p_course_nm: editTitle.trim(),
          p_open_yn: editIsPrivate ? "N" : "Y",
          p_startdate: editStartDate || null,
          p_enddate: editEndDate || null,
          p_updater: user.id,
          p_details: details
        });
        if (rpcErr) throw rpcErr;

        // DB 에서 다시 읽어와 detail_id 등 최신 상태로 갱신.
        let alive = true;
        await loadCourseFromDb(() => alive);
        alive = false;
        setIsEditing(false);
        setPlaceSearchOpen(false);
      } catch (e) {
        const message =
          e instanceof Error
            ? e.message
            : typeof e === "object" && e !== null && "message" in e
              ? String((e as { message: unknown }).message)
              : String(e);
        setSaveError(message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // 새 코스 — tb_course / tb_course_detail 에 insert (클라이언트 직접)
    setSaving(true);
    setSaveError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();

      // 1) tb_course insert → course_id 반환
      const { data: course, error: courseErr } = await supabase
        .from("tb_course")
        .insert({
          course_nm: editTitle.trim(),
          open_yn: editIsPrivate ? "N" : "Y", // 공유 여부: 기본 N(공유 안 함)
          startdate: editStartDate || null,
          enddate: editEndDate || null,
          register: user.id // RLS: register = auth.uid() 이어야 insert 허용됨
        })
        .select("course_id")
        .single();
      if (courseErr) throw courseErr;

      // 2) tb_course_detail insert — 일정(day) + 장소(place_id). placeId 있는 장소만.
      const detailRows = editDays.flatMap((d) =>
        d.places
          .filter((p) => p.placeId != null)
          .map((p) => ({
            course_id: course.course_id,
            day: d.day,
            place_id: p.placeId as number,
            starthour: p.startHour,
            endhour: p.endHour
          }))
      );
      if (detailRows.length > 0) {
        const { error: detailErr } = await supabase.from("tb_course_detail").insert(detailRows);
        if (detailErr) throw detailErr;
      }

      router.push("/course?tab=my"); // 새로 만든 코스가 있는 "내 코스" 탭으로
    } catch (e) {
      // Supabase/Postgrest 에러는 Error 인스턴스가 아니라 {message,...} 객체라
      // String(e) 는 "[object Object]"가 된다. message 필드를 우선 꺼낸다.
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
      setSaveError(message);
    } finally {
      setSaving(false);
    }
  };

  // 기간(시작일/종료일) 처리 ──────────────────────────────
  //  - 둘 다 비어 있을 때 한쪽을 고르면 다른 쪽도 같은 날로 채운다.
  //  - 한쪽을 지우면 둘 다 지운다(→ 일정 수동 모드로 복귀).
  const periodSet = Boolean(editStartDate && editEndDate);

  // 기간(양 끝 포함)으로 day 개수를 계산
  const dayCountFromPeriod = (start: string, end: string) => {
    const diff = Math.floor((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
    return diff >= 0 ? diff + 1 : 1;
  };

  // 기간에 맞춰 day 개수를 자동 구성(기존 day 의 장소는 최대한 보존)
  const applyPeriodDays = (start: string, end: string) => {
    const count = dayCountFromPeriod(start, end);
    setEditDays((prev) =>
      Array.from({ length: count }, (_, i) => ({ day: i + 1, places: prev[i]?.places ?? [] }))
    );
    setActiveDay((d) => Math.min(Math.max(d, 1), count));
  };

  // 기간 삭제 → 둘 다 비우고 일정도 Day 1 하나만 남긴다(수동 모드 + '일정 추가' 버튼 복귀).
  const clearPeriod = () => {
    setEditStartDate("");
    setEditEndDate("");
    setEditDays((prev) => [{ day: 1, places: prev[0]?.places ?? [] }]);
    setActiveDay(1);
  };

  const handleStartDateChange = (value: string) => {
    if (!value) {
      clearPeriod();
      return;
    }
    const nextEnd = editEndDate || value; // 종료일이 비었으면 같은 날로 채움
    setEditStartDate(value);
    setEditEndDate(nextEnd);
    applyPeriodDays(value, nextEnd);
  };

  const handleEndDateChange = (value: string) => {
    if (!value) {
      clearPeriod();
      return;
    }
    const nextStart = editStartDate || value; // 시작일이 비었으면 같은 날로 채움
    setEditStartDate(nextStart);
    setEditEndDate(value);
    applyPeriodDays(nextStart, value);
  };

  // 편집 취소 — 저장 없이 닫힘(신규는 목록으로, 기존은 저장값으로 복원)
  const handleCancel = () => {
    if (!window.confirm("편집을 취소할까요? 저장하지 않은 변경 사항은 사라집니다.")) return;
    if (isNew) {
      router.push("/course?tab=my"); // "새 코스 만들기"는 "내 코스" 탭에서 진입하므로 그 탭으로 복귀
      return;
    }
    setIsEditing(false);
    setEditTitle(baseCourseData.title);
    setEditIsPrivate(baseCourseData.isPrivate);
    setEditStartDate(baseCourseData.startDate ?? "");
    setEditEndDate(baseCourseData.endDate ?? "");
    setEditDays(baseCourseData.days);
    setPlaceSearchOpen(false);
    setShowErrors(false);
  };

  // 모든 입력 항목을 새 코스 기본 상태로 초기화 — 저장 없이 즉시 적용
  const handleReset = () => {
    if (!window.confirm("모든 입력을 초기화할까요? 저장 없이 바로 적용됩니다.")) return;
    setEditTitle("");
    setEditIsPrivate(true); // 기본: 공유 안 함(open_yn N)
    setEditStartDate("");
    setEditEndDate("");
    setEditDays([{ day: 1, places: [] }]);
    setActiveDay(1);
    setPlaceSearchOpen(false);
    setShowErrors(false);
  };

  // 코스 삭제 — tb_course.delete_yn = 'Y' 로 소프트 삭제(목록 조회 시 .neq("delete_yn","Y") 로 걸러짐).
  const [deleting, setDeleting] = useState(false);
  const handleDeleteCourse = async () => {
    if (isNew || Number.isNaN(numId)) return;
    if (!user) return;
    if (!window.confirm("이 코스를 삭제할까요? 되돌릴 수 없습니다.")) return;
    setDeleting(true);
    setSaveError("");
    try {
      const { createClient } = await import("@/utils/supabase/client");
      const supabase = createClient();
      const { error } = await supabase
        .from("tb_course")
        .update({ delete_yn: "Y", deletetime: new Date().toISOString(), deleter: user.id })
        .eq("course_id", numId);
      if (error) throw error;
      router.push("/course?tab=my");
    } catch (e) {
      const message =
        e instanceof Error
          ? e.message
          : typeof e === "object" && e !== null && "message" in e
            ? String((e as { message: unknown }).message)
            : String(e);
      setSaveError(message);
      setDeleting(false);
    }
  };

  return (
    <div
      className="relative -mx-4 -mt-6 -mb-24 flex overflow-hidden md:-mx-6"
      style={{ height: "calc(100dvh - 64px)" }}
    >
      {/* ── LEFT SIDEBAR (desktop) / 모바일 바텀시트 — 보기·편집·검색·상세 모두 이 패널 하나로 관리한다 ── */}
      <aside
        className="border-hairline absolute inset-x-0 bottom-0 z-30 flex h-[var(--sheet-h)] shrink-0 flex-col overflow-hidden rounded-t-2xl border-t bg-white shadow-2xl md:static md:inset-auto md:z-auto md:flex md:h-auto md:w-72 md:rounded-none md:border-t-0 md:border-r md:shadow-none"
        style={{ "--sheet-h": `${mobileSheetHeight}%` } as CSSProperties}
      >
        {/* 모바일 바텀시트 핸들 — 드래그해서 시트 높이 조절(하단 네비게이션에 가려진 부분을 끌어올려서 볼 수 있음) */}
        <div
          className="flex shrink-0 touch-none justify-center py-3 md:hidden"
          onPointerDown={handleSheetDragStart}
        >
          <span className="bg-hairline h-1 w-10 rounded-full" />
        </div>

        {placeSearchOpen ? (
          /* ── 장소 검색 (지도 화면과 공용 PlaceSearchSidebar) — 코스 편집 사이드바 자리에 그대로 교체 ── */
          <PlaceSearchSidebar
            keyword={ps.keyword}
            setKeyword={ps.setKeyword}
            onSearch={ps.handleSearch}
            isSearching={ps.isSearching}
            filters={placeFilters.filters}
            set={placeFilters.set}
            toggleList={placeFilters.toggleList}
            guOptions={ps.areaCodes.map((a) => a.name)}
            dongOptions={ps.dongOptions}
            activeCount={placeFilters.activeCount}
            onResetFilters={placeFilters.reset}
            defaultFilterOpen
            places={psDisplayPlaces}
            searchCount={ps.searchPlaces.length}
            hasActiveFilter={ps.hasActiveFilter}
            isLoadingTopRated={ps.isLoadingTopRated}
            onSelectPlace={ps.setSearchDetailId}
            searchPage={ps.searchPage}
            searchTotal={ps.searchTotal}
            onSearchPageChange={ps.setSearchPage}
            searchDetail={ps.searchDetail}
            tourismDetail={ps.tourismDetail}
            isLoadingDetail={ps.isLoadingDetail}
            onBackFromDetail={() => ps.setSearchDetailId(null)}
            onLikeChange={ps.refreshLiked}
            detailAction={addPlaceFromSearch}
            onBack={() => setPlaceSearchOpen(false)}
          />
        ) : selectedSearchPlace ? (
          /* ── 코스 장소 상세(목록·마커). 보기 모드 경로안내는 지도에서 연다. 편집 중에는 끄고, 뒤로가면 코스 패널. ── */
          <TourismDetailPanel
            sp={
              {
                // TourismDetailPanel 은 sp.id 를 contentid 로 취급해 리뷰 등을 조회하므로
                // placeId(내부 PK)가 아니라 contentId 를 넣어야 한다.
                id: String(selectedSearchPlace.contentId ?? ""),
                name: selectedSearchPlace.name,
                lat: selectedSearchPlace.lat ?? 0,
                lng: selectedSearchPlace.lng ?? 0,
                image: "",
                source: "db"
              } satisfies SearchPlace
            }
            detail={selectedSearchDetail}
            isLoading={selectedSearchDetailLoading}
            onBack={() => setSelectedSearchPlace(null)}
            onBeginRoute={
              !isEditing && selectedSearchPlace.contentId
                ? () =>
                    router.push(
                      buildPlaceRouteMapHref({
                        contentId: selectedSearchPlace.contentId ?? "",
                        name: selectedSearchPlace.name,
                        from: `/course/${id}`
                      })
                    )
                : undefined
            }
          />
        ) : isEditing ? (
          /* ── 편집 패널 ── */
          <>
            {/* Edit header — 코스 상세 패널과 동일한 스타일(뒤로가기 + 제목, 나머지 버튼은 하단
                Actions로). 뒤로가기는 하단 "취소" 버튼과 같은 handleCancel을 그대로 쓴다(신규는
                목록으로, 기존은 저장값으로 복원하며 편집 모드만 빠져나감) — 저장하지 않은 변경
                사항 확인(confirm)도 그대로 따라온다. */}
            <div className="border-hairline flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
              <button
                onClick={handleCancel}
                className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100"
                aria-label="뒤로가기"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <h2 className="flex-1 truncate text-sm font-bold text-gray-800">
                {isNew ? "코스 추가" : "코스 편집"}
              </h2>
            </div>

            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* Title edit */}
              <div className="border-hairline-soft border-b px-4 py-3">
                <p className="text-steel mb-1.5 text-xs font-semibold">
                  코스 제목 <span className="text-red-500">*</span>
                </p>
                <input
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value.slice(0, 50))}
                  maxLength={50}
                  placeholder="코스 제목을 입력해 주세요"
                  className={`focus:ring-brand-500 w-full rounded-lg border px-3 py-2 text-sm font-semibold focus:ring-2 focus:outline-none ${
                    showErrors && titleMissing ? "border-red-400 bg-red-50" : "border-hairline"
                  }`}
                />
                <p className="text-steel mt-1 text-right text-xs">{editTitle.length}/50</p>
                {showErrors && titleMissing && (
                  <p className="mt-1 text-xs text-red-500">코스 제목은 필수 항목이에요.</p>
                )}
              </div>

              {/* 공유 여부 */}
              <div className="border-hairline flex items-center justify-between border-b px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-gray-700">공유 여부</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {editIsPrivate ? "나만 볼 수 있어요" : "모두에게 공개돼요"}
                  </p>
                </div>
                <button
                  onClick={() => setEditIsPrivate((v) => !v)}
                  className={`relative h-6 w-10 shrink-0 rounded-full transition-colors ${editIsPrivate ? "bg-gray-200" : "bg-brand-500"}`}
                >
                  <span
                    className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-all duration-200 ${editIsPrivate ? "left-1" : "left-5"}`}
                  />
                </button>
              </div>

              {/* 기간 (시작일 / 종료일) */}
              <div className="border-hairline-soft border-b px-4 py-3">
                <p className="text-steel mb-1.5 text-xs font-semibold">날짜</p>
                <div className="flex items-center gap-2">
                  <DateField
                    value={editStartDate}
                    max={editEndDate || undefined}
                    onChange={handleStartDateChange}
                    ariaLabel="시작일"
                    className="text-slate py-2"
                  />
                  <span className="text-stone shrink-0 text-xs">~</span>
                  <DateField
                    value={editEndDate}
                    min={editStartDate || undefined}
                    onChange={handleEndDateChange}
                    ariaLabel="종료일"
                    className="text-slate py-2"
                  />
                </div>
              </div>

              {/* Day tabs + add day */}
              <div className="border-hairline-soft border-b px-4 py-3">
                <p className="text-steel mb-1.5 text-xs font-semibold">
                  일정
                  {periodSet && (
                    <span className="text-stone ml-1 font-normal">
                      · 날짜에 맞춰 {editDays.length}일이 자동 구성돼요
                    </span>
                  )}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {editDays.map((d) => (
                    <div key={d.day} className="flex items-center gap-1">
                      <button
                        onClick={() => setActiveDay(d.day)}
                        className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                          activeDay === d.day
                            ? "bg-brand-600 text-white"
                            : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                        }`}
                      >
                        Day {d.day}
                      </button>
                      {!periodSet && editDays.length > 1 && (
                        <button
                          onClick={() => {
                            const next = editDays
                              .filter((x) => x.day !== d.day)
                              .map((x, i) => ({ ...x, day: i + 1 }));
                            setEditDays(next);
                            setActiveDay(Math.min(activeDay, next.length));
                          }}
                          className="text-gray-300 transition-colors hover:text-red-400"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  ))}
                  {!periodSet && (
                    <button
                      onClick={() => {
                        const newDay = editDays.length + 1;
                        setEditDays([...editDays, { day: newDay, places: [] }]);
                        setActiveDay(newDay);
                      }}
                      className="text-brand-600 border-brand-200 hover:bg-brand-50 flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors"
                    >
                      <Plus className="h-3 w-3" />
                      일정 추가
                    </button>
                  )}
                </div>
              </div>

              {/* Place list (editable) */}
              <div className="space-y-1.5 px-3 py-3">
                <div className="mb-2 flex items-center justify-between px-1">
                  <p className="text-xs font-semibold text-gray-500">Day {activeDay} 장소</p>
                  <button
                    onClick={() => setPlaceSearchOpen(true)}
                    className="border-brand-300 text-brand-600 hover:bg-brand-50 flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold transition-colors"
                  >
                    <Plus className="h-3 w-3" />
                    장소 추가
                  </button>
                </div>
                {(editDays.find((d) => d.day === activeDay)?.places ?? []).map(
                  (place, idx, arr) => (
                    <div
                      key={`${place.id}-${idx}`}
                      className="flex items-center gap-1.5 rounded-xl bg-gray-50 px-2 py-2"
                    >
                      {/* Up/down — 배경·테두리로 버튼임을 명확히 표시 */}
                      <div className="flex shrink-0 flex-col gap-1">
                        <button
                          disabled={idx === 0}
                          onClick={() =>
                            setEditDays(
                              editDays.map((d) => {
                                if (d.day !== activeDay) return d;
                                const ps = [...d.places];
                                [ps[idx - 1], ps[idx]] = [ps[idx], ps[idx - 1]];
                                return { ...d, places: ps };
                              })
                            )
                          }
                          aria-label="위로 이동"
                          className="hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 rounded-md border border-gray-300 bg-white p-0.5 text-gray-600 shadow-sm transition-colors disabled:opacity-30 disabled:shadow-none disabled:hover:border-gray-300 disabled:hover:bg-white disabled:hover:text-gray-600"
                        >
                          <ChevronUp className="h-3 w-3" aria-hidden="true" />
                        </button>
                        <button
                          disabled={idx === arr.length - 1}
                          onClick={() =>
                            setEditDays(
                              editDays.map((d) => {
                                if (d.day !== activeDay) return d;
                                const ps = [...d.places];
                                [ps[idx], ps[idx + 1]] = [ps[idx + 1], ps[idx]];
                                return { ...d, places: ps };
                              })
                            )
                          }
                          aria-label="아래로 이동"
                          className="hover:border-brand-300 hover:bg-brand-50 hover:text-brand-600 rounded-md border border-gray-300 bg-white p-0.5 text-gray-600 shadow-sm transition-colors disabled:opacity-30 disabled:shadow-none disabled:hover:border-gray-300 disabled:hover:bg-white disabled:hover:text-gray-600"
                        >
                          <ChevronDown className="h-3 w-3" aria-hidden="true" />
                        </button>
                      </div>
                      {/* Number badge */}
                      <div
                        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                        style={{ background: getCategoryColor(place.categoryCode) }}
                        data-speakable
                        aria-label={`${koreanOrdinal(idx + 1)} 장소`}
                      >
                        {idx + 1}
                      </div>
                      {/* Name + start~end 시각(분 없이 시각만) */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-semibold text-gray-800">{place.name}</p>
                        <div className="mt-0.5 flex items-center gap-1">
                          <Select
                            value={String(place.startHour)}
                            ariaLabel={`${place.name} 시작 시각`}
                            hideChevron
                            onChange={(v) =>
                              setEditDays(
                                editDays.map((d) => {
                                  if (d.day !== activeDay) return d;
                                  const updated = d.places.map((p, i) =>
                                    i === idx ? { ...p, startHour: Number(v) } : p
                                  );
                                  return { ...d, places: updated };
                                })
                              )
                            }
                            className="focus:border-brand-400 h-auto w-auto rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-[10px] text-gray-500"
                            options={HOUR_OPTIONS.map((h) => ({
                              value: String(h),
                              label: `${h}시`
                            }))}
                          />
                          <span className="text-[10px] text-gray-400">~</span>
                          <Select
                            value={String(place.endHour)}
                            ariaLabel={`${place.name} 종료 시각`}
                            hideChevron
                            onChange={(v) =>
                              setEditDays(
                                editDays.map((d) => {
                                  if (d.day !== activeDay) return d;
                                  const updated = d.places.map((p, i) =>
                                    i === idx ? { ...p, endHour: Number(v) } : p
                                  );
                                  return { ...d, places: updated };
                                })
                              )
                            }
                            className="focus:border-brand-400 h-auto w-auto rounded border border-gray-200 bg-transparent px-1.5 py-0.5 text-[10px] text-gray-500"
                            options={HOUR_OPTIONS.map((h) => ({
                              value: String(h),
                              label: `${h}시`
                            }))}
                          />
                        </div>
                      </div>
                      {/* Delete */}
                      <button
                        onClick={() =>
                          setEditDays(
                            editDays.map((d) => {
                              if (d.day !== activeDay) return d;
                              return { ...d, places: d.places.filter((_, i) => i !== idx) };
                            })
                          )
                        }
                        className="shrink-0 text-gray-300 transition-colors hover:text-red-400"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>

            {/* Actions — 코스 상세 패널의 Actions 바와 같은 위치·스타일로 하단에 고정. */}
            {saveError && (
              <p className="border-hairline shrink-0 border-t px-4 pt-2 text-xs text-red-500">
                저장 실패: {saveError}
              </p>
            )}
            <div className="border-hairline mb-16 flex shrink-0 gap-2 border-t px-4 py-3 md:mb-0">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-60"
              >
                <X className="h-4 w-4" />
                취소
              </button>
              <button
                onClick={handleReset}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-gray-200 bg-white px-2 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-500 disabled:opacity-60"
              >
                <RotateCcw className="h-4 w-4" />
                초기화
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="bg-brand-600 hover:bg-brand-700 flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-60"
              >
                <Check className="h-4 w-4" />
                {saving ? "저장 중..." : "저장"}
              </button>
            </div>
          </>
        ) : (
          /* ── 보기 패널 ── */
          <>
            {/* Header */}
            <div className="border-hairline flex shrink-0 items-center gap-2 border-b px-3 py-2.5">
              <button
                onClick={() => {
                  const saved = readCourseListReturn();
                  router.push(saved ? `/course?tab=${saved.tab}` : "/course");
                }}
                aria-label="뒤로가기"
                className="rounded-lg p-1.5 text-gray-600 transition-colors hover:bg-gray-100"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              </button>
              <h2 className="flex-1 truncate text-sm font-bold text-gray-800">
                {courseData.title}
              </h2>
            </div>

            {/* 보기 패널 본문 — 전체를 하나의 스크롤 영역으로 묶어서, 위쪽 정보란이 많아도
                항상 아래로 스크롤해서 Actions 버튼까지 도달할 수 있게 한다. */}
            <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
              {/* 등록자 */}
              {!isNew && courseAuthor && (
                <div className="border-hairline border-b px-4 py-3" data-speakable>
                  <p className="mb-1.5 text-xs font-semibold text-gray-700">등록자</p>
                  <CourseAuthorRow
                    authorType={courseAuthor.role}
                    author={courseAuthor.nickname}
                    badgeAfter
                  />
                </div>
              )}

              {/* 등록일 / 수정일 — 아직 저장 전인 AI 미리보기는 등록일이 실제로 없으니 숨긴다.
                  한 줄을 반으로 나눠 값 있는 것만 표시 */}
              {!isNew && !isAiPreview && courseAuthor && (
                <div className="border-hairline flex border-b px-4 py-3">
                  <div className="flex-1">
                    <p className="mb-1.5 text-xs font-semibold text-gray-700">등록일</p>
                    <p className="text-sm text-gray-600">{courseAuthor.registDate}</p>
                  </div>
                  {courseAuthor.updateDate && (
                    <div className="flex-1">
                      <p className="mb-1.5 text-xs font-semibold text-gray-700">수정일</p>
                      <p className="text-sm text-gray-600">{courseAuthor.updateDate}</p>
                    </div>
                  )}
                </div>
              )}

              {/* 해시태그 — 포함된 장소들의 대분류+접근성 종합 상위 3개 */}
              {courseBadges.length > 0 && (
                <div className="border-hairline border-b px-4 py-3" data-speakable>
                  <p className="mb-1.5 text-xs font-semibold text-gray-700">해시태그</p>
                  <div className="flex flex-wrap gap-1.5">
                    {courseBadges.map((b) => (
                      <Badge key={b.label} tone="brand" shape="pill">
                        #{b.label}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* 별점 · 즐겨찾기(별점은 후기 게시판의 course_rating 평균, 즐겨찾기는 tb_course_like 실집계) */}
              {/* AI 추천 미리보기는 아직 저장 전이라 별점/즐겨찾기 개념이 없다 */}
              {!isNew && !isAiPreview && (
                <div className="border-hairline border-b px-4 py-3">
                  <p className="mb-1.5 text-xs font-semibold text-gray-700">별점 · 즐겨찾기</p>
                  <div className="flex items-center gap-3">
                    <div
                      className="flex items-center gap-1"
                      data-speakable
                      aria-label={`별점 ${courseData.rating.toFixed(1)}점`}
                    >
                      <Star
                        className="h-4 w-4 fill-yellow-400 text-yellow-400"
                        aria-hidden="true"
                      />
                      <span className="text-sm font-semibold text-gray-800" aria-hidden="true">
                        {courseData.rating.toFixed(1)}
                      </span>
                    </div>
                    <div
                      className="flex items-center gap-1"
                      data-speakable
                      aria-label={`즐겨찾기 ${likeCount}개`}
                    >
                      <Heart className="h-4 w-4 fill-red-400 text-red-400" aria-hidden="true" />
                      <span className="text-sm font-semibold text-gray-800" aria-hidden="true">
                        {likeCount}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {!isNew && dbCourseLoading ? (
                <div className="flex flex-1 items-center justify-center py-12 text-sm text-gray-400">
                  불러오는 중...
                </div>
              ) : !isNew && !dbCourse ? (
                <div className="flex flex-1 flex-col items-center justify-center gap-1 py-12 text-sm text-gray-400">
                  <p>코스를 찾을 수 없어요</p>
                  {dbCourseError && <p className="text-xs text-gray-300">{dbCourseError}</p>}
                </div>
              ) : (
                <>
                  {/* 공유 여부 (readonly) — AI 추천 미리보기는 아직 저장 전이라 의미가 없다 */}
                  {!isAiPreview && (
                    <div className="border-hairline flex items-center justify-between border-b px-4 py-3">
                      <div>
                        <p className="text-xs font-semibold text-gray-700">공유 여부</p>
                        <p className="mt-0.5 text-xs text-gray-400">
                          {courseData.isPrivate ? "나만 볼 수 있어요" : "모두에게 공개돼요"}
                        </p>
                      </div>
                      <span
                        className={`relative h-6 w-10 shrink-0 rounded-full ${courseData.isPrivate ? "bg-gray-200" : "bg-brand-500"}`}
                      >
                        <span
                          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow ${courseData.isPrivate ? "left-1" : "left-5"}`}
                        />
                      </span>
                    </div>
                  )}

                  {/* 기간 (readonly) — 값이 없어도 항목 자체는 항상 보여준다. */}
                  <div className="border-hairline border-b px-4 py-3">
                    <p className="mb-1.5 text-xs font-semibold text-gray-700">날짜</p>
                    <div className="flex items-center gap-2">
                      <DateField
                        value={courseData.startDate ?? ""}
                        readOnly
                        ariaLabel="시작일"
                        className="text-slate py-2"
                      />
                      <span className="text-stone shrink-0 text-xs">~</span>
                      <DateField
                        value={courseData.endDate ?? ""}
                        readOnly
                        ariaLabel="종료일"
                        className="text-slate py-2"
                      />
                    </div>
                  </div>

                  {/* Day tabs — 코스 편집 폼의 "일정" 섹션과 라벨·버튼 스타일을 맞췄다. */}
                  <div className="border-hairline border-b px-4 py-3">
                    <p className="text-steel mb-1.5 text-xs font-semibold">일정</p>
                    <div className="flex shrink-0 flex-wrap gap-1.5">
                      {courseData.days.map((day) => (
                        <button
                          key={day.day}
                          onClick={() => setActiveDay(day.day)}
                          className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors ${
                            activeDay === day.day
                              ? "bg-brand-600 text-white"
                              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                          }`}
                        >
                          Day {day.day}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Place list */}
                  <div className="space-y-2 px-4 py-3">
                    {currentPlaces.map((place, index) => (
                      <div
                        key={place.id}
                        className="flex cursor-pointer items-start gap-3 rounded-xl bg-gray-50 p-3 transition-colors hover:bg-gray-100"
                        onClick={() => {
                          if (place.lat != null && place.lng != null) setSelectedSearchPlace(place);
                        }}
                      >
                        <div
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                          style={{ background: getCategoryColor(place.categoryCode) }}
                          data-speakable
                          aria-label={`${koreanOrdinal(index + 1)} 장소`}
                        >
                          {index + 1}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-gray-800">
                            {place.name}
                          </p>
                          <p className="mt-0.5 text-xs text-gray-500">
                            {place.startHour}시 ~ {place.endHour}시
                          </p>
                        </div>
                      </div>
                    ))}
                    {currentPlaces.length === 0 && (
                      <p className="py-8 text-center text-sm text-gray-400">
                        이 Day엔 등록된 장소가 없어요
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>

            {/* Actions — 제목/버튼 사이만 스크롤되게, 이 줄은 하단에 고정.
                모바일에서 하단 탭 네비게이션에 가려지지 않게 여백 확보 */}
            {!((!isNew && dbCourseLoading) || (!isNew && !dbCourse)) && (
              <div className="border-hairline mb-16 flex shrink-0 flex-col gap-2 border-t px-4 py-3 md:mb-0">
                {dayGuidePickerOpen ? (
                  <div className="border-hairline bg-surface-soft space-y-2 rounded-xl border p-3">
                    <p className="text-ink text-xs font-semibold">
                      DAY {activeDay} 안내 · 이동 수단
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => void startDayGuide("walk")}
                        className="border-hairline flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2.5 text-xs font-semibold"
                      >
                        <Footprints className="h-3.5 w-3.5" />
                        도보
                      </button>
                      <button
                        type="button"
                        onClick={() => void startDayGuide("car")}
                        className="border-hairline flex items-center justify-center gap-1.5 rounded-lg border bg-white py-2.5 text-xs font-semibold"
                      >
                        <Car className="h-3.5 w-3.5" />
                        자동차
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setDayGuidePickerOpen(false)}
                      className="text-stone w-full text-xs"
                    >
                      취소
                    </button>
                  </div>
                ) : null}

                {dayGuideMode ? (
                  <div className="border-brand-200 bg-brand-50/70 space-y-2 rounded-xl border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-ink text-xs font-semibold">
                          DAY {activeDay} · {dayGuideMode === "walk" ? "도보" : "자동차"}
                          {dayGuideLoading ? " 경로 찾는 중…" : ""}
                        </p>
                        {!dayGuideLoading &&
                        dayGuideDistanceM != null &&
                        dayGuideDurationSec != null ? (
                          <p className="text-stone mt-0.5 text-xs">
                            {dayGuideStops.length}곳 · {formatRouteDistance(dayGuideDistanceM)} ·{" "}
                            {formatRouteDuration(dayGuideDurationSec)}
                            {dayGuideTollFare != null && dayGuideTollFare > 0
                              ? ` · ${formatRouteTollFare(dayGuideTollFare)}`
                              : ""}
                          </p>
                        ) : null}
                        {dayGuideError ? (
                          <p className="text-error mt-1 text-xs">{dayGuideError}</p>
                        ) : null}
                      </div>
                      <button
                        type="button"
                        onClick={clearDayGuide}
                        className="text-stone rounded-full p-1"
                        aria-label="코스 안내 닫기"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    {dayGuideMode === "car" &&
                    dayGuideRouteOptions &&
                    dayGuideRouteOptions.length > 1 ? (
                      <RouteOptionPicker
                        options={dayGuideRouteOptions}
                        selectedId={dayGuideSelectedRouteId}
                        onSelect={handleDayGuideSelectRoute}
                        disabled={dayGuideLoading}
                      />
                    ) : null}
                    {dayGuideShowTrafficLegend ? <TrafficLegend /> : null}
                    <button
                      type="button"
                      disabled={dayGuideStops.length < 2}
                      onClick={() => dayGuideMode && openKakaoMapRoute(dayGuideStops, dayGuideMode)}
                      className="bg-brand-700 hover:bg-brand-800 w-full rounded-lg py-2.5 text-xs font-semibold text-white disabled:opacity-50"
                    >
                      카카오맵에서 안내 시작
                    </button>
                  </div>
                ) : null}

                <div className="flex gap-2">
                  {isOwned ? (
                    <button
                      onClick={() => {
                        clearDayGuide();
                        setIsEditing(true);
                      }}
                      className="bg-brand-600 hover:bg-brand-700 flex min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-semibold whitespace-nowrap text-white transition-colors"
                    >
                      <Pencil className="h-4 w-4 shrink-0" />
                      코스 편집
                    </button>
                  ) : (
                    <button
                      onClick={handleAddToMyCourse}
                      disabled={addingCourse}
                      className="bg-brand-600 hover:bg-brand-700 min-w-0 flex-1 rounded-xl px-2 py-2.5 text-sm font-semibold whitespace-nowrap text-white transition-colors disabled:opacity-60"
                    >
                      {addingCourse ? "추가하는 중..." : "내 코스에 추가"}
                    </button>
                  )}
                  {!isAiPreview && (
                    <>
                      <button
                        onClick={handleToggleFavorite}
                        disabled={favoriteBusy}
                        aria-label={favorited ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                        className={`shrink-0 rounded-xl border px-3 py-2.5 transition-colors disabled:opacity-60 ${favorited ? "border-red-300 bg-red-50" : "border-gray-200 bg-white hover:bg-gray-50"}`}
                      >
                        <Heart
                          className={`h-4 w-4 ${favorited ? "fill-red-500 text-red-500" : "text-gray-700"}`}
                          aria-hidden="true"
                        />
                      </button>
                      <button
                        onClick={handleShareKakao}
                        disabled={sharing}
                        aria-label="카카오톡으로 공유"
                        className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50 disabled:opacity-60"
                      >
                        <Share2 className="h-4 w-4 text-gray-700" aria-hidden="true" />
                      </button>
                    </>
                  )}
                  {isOwned && (
                    <button
                      onClick={handleDeleteCourse}
                      disabled={deleting}
                      aria-label="코스 삭제"
                      className="shrink-0 rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:bg-gray-50 disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4 text-gray-700" aria-hidden="true" />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDayGuidePickerOpen((v) => !v);
                  }}
                  className="border-brand-200 text-brand-800 hover:bg-brand-50 flex w-full items-center justify-center gap-1.5 rounded-xl border bg-white py-2.5 text-sm font-semibold transition-colors"
                  aria-label="코스 안내"
                >
                  <Navigation className="h-4 w-4 shrink-0" />
                  안내
                </button>
              </div>
            )}
          </>
        )}
      </aside>

      {/* ── MAP AREA ── (모바일 편집 시 지도는 그대로 보이고 편집 패널이 하단 시트로 뜸) */}
      <div ref={mapAreaRef} className="relative flex-1 overflow-hidden">
        <KakaoMap
          markers={placeSearchOpen ? searchResultMarkers : mapMarkers}
          selectedId={placeSearchOpen ? ps.searchDetailId : selectedMarkerId}
          onSelect={(id) => {
            if (placeSearchOpen) {
              ps.setSearchDetailId(id);
              return;
            }
            const src = markerSources.find((m) => m.markerId === id);
            if (!src) return;
            setSelectedSearchPlace(src.item);
          }}
          onDeselect={() => {
            if (placeSearchOpen) {
              ps.setSearchDetailId(null);
              return;
            }
            setSelectedSearchPlace(null);
          }}
          path={placeSearchOpen ? [] : (dayGuidePath ?? coursePath)}
          onPathClick={(day) => setActiveDay(day)}
          // "장소 추가" 검색 중엔 코스 경로가 아니라 검색 결과가 카메라를 맡아야 하므로 fitPathKey를
          // 비워서(resetViewTrigger/autoResetViewTrigger가 대신 카메라를 움직인다) 지도 화면과
          // 동일하게 동작하게 한다.
          // 안내 모드가 아니면 처음 코스를 볼 때도 경로 전체가 (바텀시트에 안 가려진 영역 안에)
          // 보이도록 한 번 맞춘다 — 안 그러면 기본 지도 중심에서 시작해 경로가 시트에 가려지거나
          // 화면 밖에 있을 수 있다. mapResetNonce 를 키에 포함해서, 다른 조건이 그대로여도
          // "초기 상태로" 버튼을 누르면 강제로 다시 fit 되게 한다.
          fitPathKey={
            placeSearchOpen
              ? null
              : dayGuideMode && dayGuidePath && !dayGuideLoading
                ? `guide-${activeDay}-${dayGuideMode}-${dayGuideDistanceM ?? "x"}-${dayGuideSelectedRouteId}`
                : mapMarkers.length > 0
                  ? `course-${id}-${mapMarkers.length}-${mapResetNonce}`
                  : null
          }
          pathSummary={
            dayGuideMode &&
            dayGuidePath &&
            !dayGuideLoading &&
            dayGuideDistanceM != null &&
            dayGuideDurationSec != null
              ? {
                  distanceM: dayGuideDistanceM,
                  durationSec: dayGuideDurationSec,
                  tollFare: dayGuideTollFare ?? 0
                }
              : null
          }
          bottomOverlayPx={mapBottomOverlayPx}
          myLocation={myLocation}
          focusMyLocationTrigger={focusMyLocationTrigger}
          resetViewTrigger={placeSearchOpen ? searchMapResetTrigger : 0}
          autoResetViewTrigger={placeSearchOpen ? ps.mapResetTrigger : 0}
          showZoomControl={showZoomControl}
        />

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
              {/* 카카오 검색 결과 마커(장소 추가 검색 시)는 카카오 브랜드 옐로우(#FEE500)로 표시된다 */}
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

        {/* 지도 기능 드롭다운 — 지도 초기화 / 테마 색상 범례 / 내 위치.
            모바일에선 코스 패널이 하단 시트로 뜨므로, 그 시트 바로 위에 버튼이 오도록
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
                onClick={() => {
                  if (placeSearchOpen) {
                    setSearchMapResetTrigger((n) => n + 1);
                    return;
                  }
                  if (dayGuideMode) clearDayGuide();
                  setSelectedSearchPlace(null);
                  setMapResetNonce((n) => n + 1);
                }}
                className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-gray-700 transition-colors hover:bg-gray-50"
              >
                <RotateCcw className="h-4 w-4 shrink-0 text-gray-500" />
                초기화
              </button>
              <button
                type="button"
                onClick={() => {
                  if (myLocationStatus === "active") resetMyLocation();
                  else startMyLocation();
                }}
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
            className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-gray-600 shadow-lg transition-colors hover:bg-gray-50"
            aria-label="지도 기능 목록"
            aria-expanded={mapMenuOpen}
          >
            <MoreVertical className="h-5 w-5" />
          </button>
        </div>
      </div>

      {favoriteNotice && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-gray-900 px-4 py-2.5 text-xs whitespace-nowrap text-white shadow-lg">
          {favoriteNotice}
        </div>
      )}
    </div>
  );
}
