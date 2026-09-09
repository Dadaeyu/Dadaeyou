"use client";

// 지도·코스 공용 장소 검색 사이드바.
// 검색 입력 + 필터 토글 + 결과 목록 ↔ 장소 상세 를 한 컴포넌트로 묶는다(표현형).
// 각 화면이 usePlaceSearch/useFilters 를 소유해 값을 넘기고, 지도 화면은 같은 값으로 마커도 그린다.
// 필터 열림 상태와 목록 스크롤 위치는 이 컴포넌트가 내부 보존한다(상세로 갔다 와도 유지).
import { useCallback, useRef, useState } from "react";
import { Search, ChevronLeft } from "lucide-react";
import { FilterToggleSection } from "@/components/search/FilterPanel";
import SearchResultList from "@/components/search/SearchResultList";
import TourismDetailPanel, {
  type PlaceRouteGuideState
} from "@/components/search/TourismDetailPanel";
import { ListPagination } from "@/components/community/ListPagination";
import type { Filters } from "@/components/PlaceFilters";
import type { SearchPlace } from "@/lib/search/kakaoSearch";
import { SEARCH_PAGE_SIZE, type TourismDetail } from "@/hooks/usePlaceSearch";
import type { RouteMode } from "@/lib/kakao/directions";

interface Props {
  // 검색 입력
  keyword: string;
  setKeyword: (v: string) => void;
  onSearch: (kw: string) => void;
  isSearching?: boolean;

  // 필터 (useFilters 결과)
  filters: Filters;
  set: <K extends keyof Filters>(key: K, val: Filters[K]) => void;
  toggleList: (key: "themes" | "accessibility", item: string) => void;
  guOptions: string[];
  dongOptions: string[];
  activeCount: number;
  onResetFilters: () => void;
  defaultFilterOpen?: boolean;

  // 결과 목록
  places: SearchPlace[];
  searchCount: number; // 실제 검색 결과 수
  hasActiveFilter: boolean; // true면 검색/필터가 켜진 상태 — 0개여도 핫플레이스로 대체하지 않는다.
  isLoadingTopRated?: boolean; // 필터 없이 기본으로 보여주는 핫플레이스 최초 로딩 중
  onSelectPlace: (id: string) => void;

  // 검색 결과 페이징 (50개씩) — 넘기지 않으면 페이징 UI를 표시하지 않는다.
  searchPage?: number;
  searchTotal?: number;
  onSearchPageChange?: (page: number) => void;

  // 상세 (usePlaceSearch 결과)
  searchDetail: SearchPlace | null;
  tourismDetail: TourismDetail | null;
  isLoadingDetail: boolean;
  onBackFromDetail: () => void;
  onLikeChange?: () => void;

  // 상세의 "내 코스에 추가" 액션 (넘기면 상세 헤더에 버튼 표시). 현재 상세 장소 대상.
  detailAction?: () => void;

  // 경로안내 (지도 탭)
  onStartRoute?: (mode: RouteMode) => void;
  routeGuide?: PlaceRouteGuideState | null;

  // 사이드바 레벨 뒤로가기 (코스 편집 전용). 있으면 목록 상단에 뒤로 버튼.
  onBack?: () => void;
}

export default function PlaceSearchSidebar({
  keyword,
  setKeyword,
  onSearch,
  isSearching = false,
  filters,
  set,
  toggleList,
  guOptions,
  dongOptions,
  activeCount,
  onResetFilters,
  defaultFilterOpen = false,
  places,
  searchCount,
  hasActiveFilter,
  isLoadingTopRated = false,
  onSelectPlace,
  searchPage = 0,
  searchTotal = 0,
  onSearchPageChange,
  searchDetail,
  tourismDetail,
  isLoadingDetail,
  onBackFromDetail,
  onLikeChange,
  detailAction,
  onStartRoute,
  routeGuide,
  onBack
}: Props) {
  // 필터 열림 상태 · 목록 스크롤 위치를 이 컴포넌트가 보존 (상세로 전환돼도 인스턴스는 유지됨).
  const [filterOpen, setFilterOpen] = useState(defaultFilterOpen);
  const listScrollRef = useRef(0);
  const setListEl = useCallback((el: HTMLDivElement | null) => {
    if (el) el.scrollTop = listScrollRef.current;
  }, []);

  // 상세 화면 — DB/카카오 출처 모두 TourismDetailPanel 이 sp.source 로 분기해 처리한다.
  if (searchDetail) {
    return (
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <TourismDetailPanel
          sp={searchDetail}
          detail={tourismDetail}
          isLoading={isLoadingDetail}
          onBack={onBackFromDetail}
          onLikeChange={onLikeChange}
          onAddToCourse={detailAction}
          onStartRoute={onStartRoute}
          routeGuide={routeGuide}
        />
      </div>
    );
  }

  // 검색 + 필터 + 목록 화면
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {onBack && (
        <div className="shrink-0 border-b border-gray-100">
          <button
            onClick={onBack}
            className="flex w-full items-center gap-1.5 px-3 py-2.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50"
          >
            <ChevronLeft className="h-4 w-4" />
            코스로 돌아가기
          </button>
        </div>
      )}

      {/* 검색 */}
      <div className="shrink-0 border-b border-gray-100 p-3">
        <div className="relative">
          <Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="장소 검색 (Enter)"
            aria-label="장소 검색, 입력 후 엔터"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch(keyword)}
            className="focus:ring-brand-500 w-full rounded-lg border border-gray-200 py-2 pr-4 pl-9 text-sm focus:ring-2 focus:outline-none"
          />
        </div>
      </div>

      {/* 필터 토글 */}
      <FilterToggleSection
        filters={filters}
        set={set}
        toggleList={toggleList}
        guOptions={guOptions}
        dongOptions={dongOptions}
        activeCount={activeCount}
        onReset={onResetFilters}
        open={filterOpen}
        onOpenChange={setFilterOpen}
      />

      {/* 검색 결과 or 후기 평점 상위 장소 */}
      <div
        ref={setListEl}
        onScroll={(e) => {
          listScrollRef.current = e.currentTarget.scrollTop;
        }}
        className="flex-1 overflow-y-auto"
      >
        <div className="sticky top-0 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <span className="text-xs font-semibold tracking-wide text-gray-400 uppercase">
            {hasActiveFilter
              ? `검색 결과 ${Math.max(searchTotal, searchCount)}개`
              : `핫플레이스 ${places.length}개`}
          </span>
        </div>
        {isSearching || (!hasActiveFilter && isLoadingTopRated) ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-gray-400">
            <span className="border-brand-500 h-3.5 w-3.5 animate-spin rounded-full border-2 border-gray-200 border-t-transparent" />
            {hasActiveFilter ? "검색 중..." : "불러오는 중..."}
          </div>
        ) : places.length === 0 && hasActiveFilter ? (
          <div className="flex flex-col items-center justify-center gap-1 py-14 text-center text-gray-400">
            <p className="text-sm font-medium">조건에 맞는 장소가 없어요</p>
            <p className="text-xs">필터를 조정해서 다시 찾아보세요</p>
          </div>
        ) : (
          <SearchResultList places={places} onSelect={onSelectPlace} />
        )}
      </div>

      {/* 페이징 — 목록 스크롤 영역 밖에 고정해, 목록을 내려 스크롤해도 항상 보인다 */}
      {onSearchPageChange && (
        <div className="shrink-0 border-t border-gray-100 bg-white">
          <ListPagination
            page={searchPage}
            total={searchTotal}
            pageSize={SEARCH_PAGE_SIZE}
            onChange={onSearchPageChange}
            compact
          />
        </div>
      )}
    </div>
  );
}
