"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchKakaoPlaces, type SearchPlace } from "@/lib/search/kakaoSearch";

export interface TourismDetail {
  title: string;
  category: string | null;
  categoryCode: string | null; // tb_place.lclssystm1 원본 코드 — 지도 노드/순서아이콘 테마색용
  image: string;
  addr1: string;
  overview: string | null;
  use_time: string | null;
  rest_date: string | null;
  phone: string | null;
  like_count: number;
  accessibility: { category: string; items: { label: string; text: string }[] }[];
}

export interface AreaCode {
  code: string;
  name: string;
}

type SearchRequest = {
  keyword: string;
  revision: number;
};

type SearchResultState = {
  key: string;
  places: SearchPlace[];
  total: number;
};

// 지도 검색 결과 페이지당 개수. /api/search 와 맞춘다.
export const SEARCH_PAGE_SIZE = 50;

type TourismDetailState = {
  contentId: string;
  detail: TourismDetail | null;
};

// DB(tb_place) + 카카오 로컬 검색을 병행 조회하고, 좌표 기준으로 중복을 제거한다.
export function usePlaceSearch({
  accessibility,
  gu,
  dong,
  favoritesOnly,
  headcount,
  dateFrom,
  dateTo,
  themes,
  minRating,
  initialKeyword = ""
}: {
  accessibility: string[];
  gu: string;
  dong: string;
  favoritesOnly: boolean;
  headcount: number;
  dateFrom: string;
  dateTo: string;
  themes: string[];
  minRating: number;
  initialKeyword?: string;
}) {
  const [keyword, setKeyword] = useState(initialKeyword);
  const [searchRequest, setSearchRequest] = useState<SearchRequest>({
    keyword: initialKeyword,
    revision: 0
  });
  const [searchResult, setSearchResult] = useState<SearchResultState>({
    key: "",
    places: [],
    total: 0
  });
  const [searchPage, setSearchPage] = useState(0);
  const [searchDetailId, setSearchDetailId] = useState<string | null>(null);
  const [areaCodes, setAreaCodes] = useState<AreaCode[]>([]);

  // 입력창을 지웠는데 Enter를 안 눌러도, 실제 검색에 쓰이는 키워드를 바로 비워서
  // "예전 검색어 + 새 필터" 조합으로 결과가 좁아지는 걸 막는다.
  const handleKeywordChange = useCallback((next: string) => {
    setKeyword(next);
    if (next.trim() === "") {
      setSearchRequest((current) =>
        current.keyword === "" ? current : { ...current, keyword: "" }
      );
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/area-code", { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) => setAreaCodes(Array.isArray(data) ? data : []))
      .catch((error: unknown) => {
        if (!isAbortError(error)) setAreaCodes([]);
      });

    return () => controller.abort();
  }, []);

  const selectedGuCode = useMemo(
    () => (gu ? areaCodes.find((area) => area.name === gu)?.code : undefined),
    [areaCodes, gu]
  );

  const [dongResult, setDongResult] = useState<{ guCode: string; options: string[] }>({
    guCode: "",
    options: []
  });

  useEffect(() => {
    if (!selectedGuCode) return;

    const controller = new AbortController();
    void fetch(`/api/area-code/dong?gu=${encodeURIComponent(selectedGuCode)}`, {
      signal: controller.signal
    })
      .then((response) => (response.ok ? response.json() : []))
      .then((data) =>
        setDongResult({
          guCode: selectedGuCode,
          options: Array.isArray(data) ? data : []
        })
      )
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setDongResult({ guCode: selectedGuCode, options: [] });
        }
      });

    return () => controller.abort();
  }, [selectedGuCode]);

  const dongOptions = selectedGuCode === dongResult.guCode ? dongResult.options : [];

  const [likedPlaces, setLikedPlaces] = useState<SearchPlace[]>([]);
  const likedIds = useMemo(() => new Set(likedPlaces.map((place) => place.id)), [likedPlaces]);

  // 즐겨찾기 마커(하트) 표시용으로, 필터와 무관하게 내 즐겨찾기 목록을 유지한다.
  // 상세 패널에서 하트를 누른 직후에도 즉시 다시 불러올 수 있도록 콜백으로 노출한다.
  const refreshLiked = useCallback(async () => {
    const liked = await fetchLikedPlaces();
    setLikedPlaces(liked);
    return liked;
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    void fetchLikedPlaces(controller.signal)
      .then(setLikedPlaces)
      .catch((error: unknown) => {
        if (!isAbortError(error)) setLikedPlaces([]);
      });

    return () => controller.abort();
  }, []);

  const [topRatedPlaces, setTopRatedPlaces] = useState<SearchPlace[]>([]);
  const [isLoadingTopRated, setIsLoadingTopRated] = useState(true);

  useEffect(() => {
    const controller = new AbortController();

    void fetchTopRatedPlaces(controller.signal)
      .then(setTopRatedPlaces)
      .catch((error: unknown) => {
        if (!isAbortError(error)) setTopRatedPlaces([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoadingTopRated(false);
      });

    return () => controller.abort();
  }, []);

  // 검색어/필터가 하나라도 켜져 있는지 — 켜져 있는데 결과가 0개면 핫플레이스로 대체하지 않고
  // "결과 없음"을 보여줘야 한다(아무 필터도 안 켰을 때만 핫플레이스가 기본 목록이 된다).
  const hasActiveFilter = useMemo(
    () =>
      Boolean(
        searchRequest.keyword.trim() ||
        accessibility.length > 0 ||
        selectedGuCode ||
        dong ||
        themes.length > 0 ||
        minRating > 0 ||
        headcount > 1 ||
        dateFrom ||
        dateTo ||
        favoritesOnly
      ),
    [
      accessibility,
      dateFrom,
      dateTo,
      dong,
      favoritesOnly,
      headcount,
      minRating,
      searchRequest.keyword,
      selectedGuCode,
      themes
    ]
  );

  const searchKey = useMemo(
    () =>
      JSON.stringify([
        searchRequest.keyword.trim(),
        searchRequest.revision,
        accessibility,
        selectedGuCode ?? "",
        gu,
        dong,
        favoritesOnly,
        themes,
        minRating,
        headcount,
        dateFrom,
        dateTo
      ]),
    [
      accessibility,
      dong,
      favoritesOnly,
      gu,
      searchRequest,
      selectedGuCode,
      themes,
      minRating,
      headcount,
      dateFrom,
      dateTo
    ]
  );

  // 검색어·필터가 바뀔 때마다(첫 마운트 제외) 검색 결과가 도착한 뒤 지도 줌을
  // 대전 전체가 보이는 초기 화면으로 되돌린다.
  const [mapResetTrigger, setMapResetTrigger] = useState(0);
  const isFirstSearchRun = useRef(true);
  const prevSearchKeyRef = useRef(searchKey);

  useEffect(() => {
    const skipReset = isFirstSearchRun.current;
    isFirstSearchRun.current = false;

    // searchKey(검색어·필터)가 바뀐 경우엔 페이지를 1페이지로 되돌린다.
    // 페이지 버튼만 눌러 searchPage 만 바뀐 경우엔 지도 줌도 리셋하지 않는다.
    const isNewSearch = prevSearchKeyRef.current !== searchKey;
    prevSearchKeyRef.current = searchKey;
    const pageToFetch = isNewSearch ? 0 : searchPage;
    if (isNewSearch && searchPage !== 0) setSearchPage(0);

    const controller = new AbortController();

    void fetchCombinedPlaces(
      {
        accessibility,
        dong,
        favoritesOnly,
        gu,
        guCode: selectedGuCode,
        keyword: searchRequest.keyword,
        themes,
        minRating,
        headcount,
        dateFrom,
        dateTo,
        page: pageToFetch
      },
      controller.signal
    )
      .then(({ liked, places, total }) => {
        setSearchResult({ key: searchKey, places, total });
        setSearchDetailId(null);
        if (liked) setLikedPlaces(liked);
        // "결과가 하나라도 지금 화면에 보이면 리셋하지 않는다"는 판단은 여기서 총 결과 개수만
        // 보고는 할 수 없다(27개가 있어도 전부 화면 밖일 수 있음) — 실제 지도 뷰포트를 아는
        // KakaoMap 쪽(autoResetViewTrigger)에서 마커 좌표 기준으로 판단하므로, 여기선 새 검색마다
        // 그냥 트리거만 올린다.
        if (isNewSearch && !skipReset) setMapResetTrigger((count) => count + 1);
      })
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setSearchResult({ key: searchKey, places: [], total: 0 });
          setSearchDetailId(null);
          if (isNewSearch && !skipReset) setMapResetTrigger((count) => count + 1);
        }
      });

    return () => controller.abort();
  }, [
    accessibility,
    dong,
    favoritesOnly,
    gu,
    searchKey,
    searchRequest.keyword,
    selectedGuCode,
    searchPage
  ]);

  const handleSearch = useCallback((nextKeyword: string) => {
    setSearchRequest((current) => ({
      keyword: nextKeyword,
      revision: current.revision + 1
    }));
  }, []);

  const searchPlaces = searchResult.places;
  const isSearching = searchResult.key !== searchKey;

  const searchDetail = searchDetailId
    ? (searchPlaces.find((place) => place.id === searchDetailId) ??
      topRatedPlaces.find((place) => place.id === searchDetailId) ??
      null)
    : null;

  const [tourismDetailResult, setTourismDetailResult] = useState<TourismDetailState | null>(null);

  useEffect(() => {
    if (!searchDetailId || !searchDetail || searchDetail.source === "kakao") return;

    const controller = new AbortController();
    void fetch(`/api/tourism/detail?contentId=${encodeURIComponent(searchDetailId)}`, {
      signal: controller.signal
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("관광지 상세 정보를 불러오지 못했습니다.");
        return (await response.json()) as TourismDetail;
      })
      .then((detail) => setTourismDetailResult({ contentId: searchDetailId, detail }))
      .catch((error: unknown) => {
        if (!isAbortError(error)) {
          setTourismDetailResult({ contentId: searchDetailId, detail: null });
        }
      });

    return () => controller.abort();
  }, [searchDetail, searchDetailId]);

  const isDatabaseDetail = Boolean(
    searchDetailId && searchDetail && searchDetail.source !== "kakao"
  );
  const tourismDetail =
    searchDetailId && tourismDetailResult?.contentId === searchDetailId
      ? tourismDetailResult.detail
      : null;
  const isLoadingDetail = isDatabaseDetail && tourismDetailResult?.contentId !== searchDetailId;

  const focusPlaceById = useCallback(async (contentId: string) => {
    try {
      const response = await fetch(`/api/search?id=${encodeURIComponent(contentId)}`);
      if (!response.ok) return;

      const data = await response.json();
      const found: Omit<SearchPlace, "source"> | undefined = Array.isArray(data)
        ? data[0]
        : undefined;
      if (!found) return;

      const place: SearchPlace = { ...found, source: "db" };
      setSearchResult((current) => ({
        ...current,
        places: [place, ...current.places.filter((item) => item.id !== place.id)]
      }));
      setSearchDetailId(place.id);
    } catch {
      // 게시글 연결 장소를 찾지 못해도 지도 화면 자체는 계속 사용할 수 있다.
    }
  }, []);

  return {
    keyword,
    setKeyword: handleKeywordChange,
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
    topRatedPlaces,
    isLoadingTopRated,
    hasActiveFilter,
    mapResetTrigger,
    searchPage,
    setSearchPage,
    searchTotal: searchResult.total
  };
}

async function fetchLikedPlaces(
  signal?: AbortSignal,
  filters?: {
    guCode?: string;
    dong?: string;
    themes?: string[];
    minRating?: number;
    accessibility?: string[];
    headcount?: number;
    dateFrom?: string;
    dateTo?: string;
  }
): Promise<SearchPlace[]> {
  const params = new URLSearchParams();
  if (filters?.guCode) params.set("gu", filters.guCode);
  if (filters?.dong) params.set("dong", filters.dong);
  if (filters?.themes && filters.themes.length > 0) params.set("themes", filters.themes.join(","));
  if (filters?.minRating && filters.minRating > 0)
    params.set("minRating", String(filters.minRating));
  if (filters?.accessibility && filters.accessibility.length > 0) {
    params.set("accessibility", filters.accessibility.join(","));
  }
  if (filters?.headcount && filters.headcount >= 1)
    params.set("headcount", String(filters.headcount));
  if (filters?.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters?.dateTo) params.set("dateTo", filters.dateTo);
  const query = params.toString();

  const response = await fetch(`/api/tourism/liked${query ? `?${query}` : ""}`, { signal });
  if (!response.ok) return [];

  const liked = await response.json();
  return (Array.isArray(liked) ? liked : []).map((place: Omit<SearchPlace, "source">) => ({
    ...place,
    source: "db" as const
  }));
}

async function fetchTopRatedPlaces(signal?: AbortSignal): Promise<SearchPlace[]> {
  const response = await fetch("/api/tourism/top-rated-places", { signal });
  if (!response.ok) return [];

  const json = await response.json();
  const places: Omit<SearchPlace, "source">[] = Array.isArray(json?.places) ? json.places : [];
  return places.map((place) => ({ ...place, source: "db" as const }));
}

async function fetchCombinedPlaces(
  {
    accessibility,
    dong,
    favoritesOnly,
    gu,
    guCode,
    keyword,
    themes,
    minRating,
    headcount,
    dateFrom,
    dateTo,
    page
  }: {
    accessibility: string[];
    dong: string;
    favoritesOnly: boolean;
    gu: string;
    guCode?: string;
    keyword: string;
    themes: string[];
    minRating: number;
    headcount: number;
    dateFrom: string;
    dateTo: string;
    page: number;
  },
  signal: AbortSignal
) {
  const trimmedKeyword = keyword.trim();

  // "즐겨찾기만 보기"는 일반 검색과 합치지 않는다 — 내 즐겨찾기 중 현재 필터(구/테마/접근성/
  // 별점/인원/일정)에 맞는 것만 보여준다. 카카오 결과도 즐겨찾기가 될 수 없으니 제외한다.
  // (예전엔 즐겨찾기 전체 + 필터링된 일반 검색 결과를 그냥 합쳐서, 필터와 무관한 즐겨찾기와
  // 즐겨찾기하지 않은 장소가 함께 섞여 나왔다.)
  if (favoritesOnly) {
    const liked = await fetchLikedPlaces(signal, {
      guCode,
      dong,
      themes,
      minRating,
      accessibility,
      headcount,
      dateFrom,
      dateTo
    });
    return { places: liked, liked: null as SearchPlace[] | null, total: liked.length };
  }

  const hasNormalQuery = Boolean(
    trimmedKeyword ||
    accessibility.length > 0 ||
    guCode ||
    dong ||
    themes.length > 0 ||
    minRating > 0 ||
    headcount > 1 ||
    dateFrom ||
    dateTo
  );

  if (!hasNormalQuery) {
    return { places: [] as SearchPlace[], liked: null as SearchPlace[] | null, total: 0 };
  }

  const params = new URLSearchParams();
  if (trimmedKeyword) params.set("keyword", trimmedKeyword);
  if (accessibility.length > 0) params.set("accessibility", accessibility.join(","));
  if (guCode) params.set("gu", guCode);
  if (dong) params.set("dong", dong);
  if (themes.length > 0) params.set("themes", themes.join(","));
  if (minRating > 0) params.set("minRating", String(minRating));
  if (headcount >= 1) params.set("headcount", String(headcount));
  if (dateFrom) params.set("dateFrom", dateFrom);
  if (dateTo) params.set("dateTo", dateTo);
  params.set("page", String(page));

  const [databaseResponse, kakaoResults] = await Promise.all([
    fetch(`/api/search?${params}`, { signal }).then(async (response) => {
      if (!response.ok) throw new Error("장소 검색에 실패했습니다.");
      return response.json() as Promise<{
        places: Omit<SearchPlace, "source">[];
        total: number;
      }>;
    }),
    // 카카오 결과는 자체 페이징이 없어(항상 같은 상위 결과) 1페이지에서만 보여준다.
    trimmedKeyword && page === 0
      ? fetchKakaoPlaces(trimmedKeyword, gu || undefined, dong || undefined)
      : Promise.resolve([])
  ]);

  const databasePlaces: SearchPlace[] = (
    Array.isArray(databaseResponse.places) ? databaseResponse.places : []
  ).map((place: Omit<SearchPlace, "source">) => ({ ...place, source: "db" as const }));
  const total = typeof databaseResponse.total === "number" ? databaseResponse.total : 0;

  const coordinateKey = (lat: number, lng: number) => `${lat.toFixed(3)}_${lng.toFixed(3)}`;
  const databaseCoordinates = new Set(
    databasePlaces.map((place) => coordinateKey(place.lat, place.lng))
  );
  const uniqueKakaoPlaces = kakaoResults.filter(
    (place) => !databaseCoordinates.has(coordinateKey(place.lat, place.lng))
  );

  return {
    places: [...databasePlaces, ...uniqueKakaoPlaces],
    liked: null as SearchPlace[] | null,
    total
  };
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}
