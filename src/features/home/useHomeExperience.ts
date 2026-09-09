"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import {
  buildHomeRequestKey,
  createHomeRecommendationSeed,
  getCriteriaScopedHomeResponse,
  getOwnerScopedHomeResponse,
  mergeRecentHomePlaceIds,
  parseRecentHomePlaceIds
} from "@/features/home/homeExperienceState";
import {
  getHomeRecommendationNeedIds,
  normalizeHomeNeedSelection,
  resolveHomeNeedIds,
  toggleHomeNeedSelection,
  type HomeDataResponse,
  type HomeNeedId,
  type RankedHomePlace
} from "@/features/home/homeData";

type HomeLoadState = "loading" | "ready" | "empty" | "error";
type HomeResponseState = {
  ownerId: string | null;
  key: string;
  criteriaKey: string;
  data: HomeDataResponse | null;
  loadState: Exclude<HomeLoadState, "loading">;
  loadError: string | null;
};
type HomeDiscoveryState = {
  ownerScope: string;
  seed: number;
  excludedPlaceIds: string[];
};

const HOME_RECENT_PLACE_STORAGE_KEY = "dadaeyu.home.recentPlaces.v1";
const HOME_RECOMMENDATION_SEED_RANGE = 0x1_0000_0000;

export function useHomeExperience() {
  const auth = useAuth();
  const [needSelection, setNeedSelection] = useState<{
    ownerId: string | null;
    needIds: HomeNeedId[];
  } | null>(null);
  const [responseState, setResponseState] = useState<HomeResponseState | null>(null);
  const [requestNeedState, setRequestNeedState] = useState<{
    ownerId: string | null;
    key: string;
  } | null>(null);
  const [discoveryState, setDiscoveryState] = useState<HomeDiscoveryState | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [selectedPlace, setSelectedPlace] = useState<RankedHomePlace | null>(null);
  const placeTriggerRef = useRef<HTMLElement | null>(null);
  const homeRequestRef = useRef<{
    key: string;
    controller: AbortController;
  } | null>(null);
  const initializedDiscoveryOwnerRef = useRef<string | null>(null);

  const ownerId = auth.user?.id ?? null;
  const ownerScope = ownerId ?? "guest";
  const recentPlaceStorageKey = `${HOME_RECENT_PLACE_STORAGE_KEY}:${ownerScope}`;
  const savedNeedIds = useMemo(
    () => normalizeHomeNeedSelection(resolveHomeNeedIds(auth.preferences?.accessibility_needs)),
    [auth.preferences?.accessibility_needs]
  );
  const selectedNeedIds = useMemo(
    () =>
      normalizeHomeNeedSelection(
        needSelection?.ownerId === ownerId ? needSelection.needIds : savedNeedIds
      ),
    [needSelection, ownerId, savedNeedIds]
  );
  const selectedNeedKey = getHomeRecommendationNeedIds(selectedNeedIds).join(",");

  useEffect(() => {
    if (auth.loading || initializedDiscoveryOwnerRef.current === ownerScope) return;
    initializedDiscoveryOwnerRef.current = ownerScope;
    let excludedPlaceIds: string[] = [];
    try {
      excludedPlaceIds = parseRecentHomePlaceIds(
        window.sessionStorage.getItem(recentPlaceStorageKey)
      );
    } catch {
      // 브라우저 저장소를 사용할 수 없어도 추천 자체는 정상적으로 동작한다.
    }
    setDiscoveryState({
      ownerScope,
      seed: createHomeRecommendationSeed(),
      excludedPlaceIds
    });
  }, [auth.loading, ownerScope, recentPlaceStorageKey]);

  useEffect(() => {
    if (auth.loading) return;
    const ownerChanged = requestNeedState?.ownerId !== ownerId;
    const timer = window.setTimeout(
      () => setRequestNeedState({ ownerId, key: selectedNeedKey }),
      ownerChanged ? 0 : 180
    );
    return () => window.clearTimeout(timer);
  }, [auth.loading, ownerId, requestNeedState?.ownerId, selectedNeedKey]);

  const requestNeedKey = requestNeedState?.ownerId === ownerId ? requestNeedState.key : null;
  const isRequestNeedCurrent = requestNeedKey !== null && requestNeedKey === selectedNeedKey;
  const currentDiscoveryState = discoveryState?.ownerScope === ownerScope ? discoveryState : null;
  const criteriaKey = requestNeedKey === null ? null : JSON.stringify([requestNeedKey]);
  const requestUrl = useMemo(() => {
    if (auth.loading || requestNeedKey === null || !currentDiscoveryState) return null;
    const params = new URLSearchParams();
    if (requestNeedKey) params.set("needs", requestNeedKey);
    params.set("seed", String(currentDiscoveryState.seed));
    if (currentDiscoveryState.excludedPlaceIds.length) {
      params.set("exclude", currentDiscoveryState.excludedPlaceIds.join(","));
    }
    return `/api/home?${params.toString()}`;
  }, [auth.loading, currentDiscoveryState, requestNeedKey]);
  const requestKey = buildHomeRequestKey(ownerId, requestUrl, retryKey);

  useEffect(() => {
    if (!requestUrl || !requestKey || !criteriaKey) return;
    if (
      homeRequestRef.current?.key === requestKey &&
      !homeRequestRef.current.controller.signal.aborted
    ) {
      return;
    }

    homeRequestRef.current?.controller.abort();
    const controller = new AbortController();
    homeRequestRef.current = { key: requestKey, controller };

    fetch(requestUrl, { signal: controller.signal })
      .then(async (response) => {
        const body = (await response.json().catch(() => null)) as
          HomeDataResponse | { message?: string } | null;
        if (!response.ok || !body || !("places" in body)) {
          throw new Error(
            body && "message" in body && body.message
              ? body.message
              : "관광정보를 불러오지 못했습니다."
          );
        }
        if (homeRequestRef.current?.key !== requestKey) return;
        try {
          const storedPlaceIds = parseRecentHomePlaceIds(
            window.sessionStorage.getItem(recentPlaceStorageKey)
          );
          const nextPlaceIds = mergeRecentHomePlaceIds(
            storedPlaceIds,
            body.places.map((place) => place.id)
          );
          window.sessionStorage.setItem(recentPlaceStorageKey, JSON.stringify(nextPlaceIds));
        } catch {
          // 저장소가 차단된 환경에서는 현재 방문 동안의 순환만 유지한다.
        }
        setResponseState({
          ownerId,
          key: requestKey,
          criteriaKey,
          data: body,
          loadState: body.places.length ? "ready" : "empty",
          loadError: null
        });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        if (homeRequestRef.current?.key !== requestKey) return;
        setResponseState({
          ownerId,
          key: requestKey,
          criteriaKey,
          data: null,
          loadState: "error",
          loadError: error instanceof Error ? error.message : "관광정보를 불러오지 못했습니다."
        });
      });
  }, [criteriaKey, ownerId, recentPlaceStorageKey, requestKey, requestUrl]);

  useEffect(
    () => () => {
      homeRequestRef.current?.controller.abort();
    },
    []
  );

  const ownerResponseState = getOwnerScopedHomeResponse(responseState, ownerId);
  const criteriaResponseState = getCriteriaScopedHomeResponse(responseState, ownerId, criteriaKey);
  const currentResponse =
    requestKey && ownerResponseState?.key === requestKey ? ownerResponseState : null;
  const data =
    requestKey && isRequestNeedCurrent
      ? currentResponse
        ? currentResponse.data
        : (criteriaResponseState?.data ?? null)
      : null;
  const loadState: HomeLoadState =
    requestKey && isRequestNeedCurrent ? (currentResponse?.loadState ?? "loading") : "loading";
  const loadError = currentResponse?.loadError ?? null;
  const isRefreshing = loadState === "loading" && Boolean(data?.places.length);

  const toggleNeed = useCallback(
    (needId: HomeNeedId) => {
      setNeedSelection({
        ownerId,
        needIds: toggleHomeNeedSelection(selectedNeedIds, needId)
      });
    },
    [ownerId, selectedNeedIds]
  );

  const clearNeeds = useCallback(() => {
    setNeedSelection({ ownerId, needIds: [] });
  }, [ownerId]);

  const refreshRecommendations = useCallback(() => {
    const currentPlaceIds = data?.places.map((place) => place.id) ?? [];
    setDiscoveryState((currentState) => {
      if (!currentState || currentState.ownerScope !== ownerScope) return currentState;
      const generatedSeed = createHomeRecommendationSeed();
      return {
        ownerScope,
        seed:
          generatedSeed === currentState.seed
            ? (generatedSeed + 1) % HOME_RECOMMENDATION_SEED_RANGE
            : generatedSeed,
        excludedPlaceIds: mergeRecentHomePlaceIds(currentState.excludedPlaceIds, currentPlaceIds)
      };
    });
  }, [data, ownerScope]);

  const openPlace = useCallback((place: RankedHomePlace, trigger: HTMLElement) => {
    placeTriggerRef.current = trigger;
    setSelectedPlace(place);
  }, []);

  const closePlace = useCallback(() => {
    setSelectedPlace(null);
    window.requestAnimationFrame(() => {
      if (placeTriggerRef.current?.isConnected) placeTriggerRef.current.focus();
    });
  }, []);

  return useMemo(
    () => ({
      auth,
      selectedNeedIds,
      toggleNeed,
      clearNeeds,
      refreshRecommendations,
      data,
      loadState,
      loadError,
      isRefreshing,
      retry: () => {
        setRetryKey((value) => value + 1);
      },
      selectedPlace,
      openPlace,
      closePlace
    }),
    [
      auth,
      selectedNeedIds,
      toggleNeed,
      clearNeeds,
      refreshRecommendations,
      data,
      loadState,
      loadError,
      isRefreshing,
      selectedPlace,
      openPlace,
      closePlace
    ]
  );
}

export type HomeExperience = ReturnType<typeof useHomeExperience>;
