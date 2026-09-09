export const HOME_NEED_OPTIONS = [
  {
    id: "step_free",
    label: "계단 없는 이동",
    description: "턱 없는 출입구나 경사로가 확인된 장소만 표시",
    storageValue: "계단 피하기",
    group: "mobility"
  },
  {
    id: "short_distance",
    label: "가까운 곳부터",
    description: "현재 위치에서 가까운 순서 우선",
    storageValue: "긴 이동 피하기",
    group: "mobility"
  },
  {
    id: "visual_guidance",
    label: "시각 지원",
    description: "점자·음성·보조견 지원 정보가 확인된 장소만 표시",
    storageValue: "시각 안내",
    group: "support"
  },
  {
    id: "hearing_guidance",
    label: "청각 지원",
    description: "수어·자막·보청 지원 정보가 확인된 장소만 표시",
    storageValue: "청각 안내",
    group: "support"
  },
  {
    id: "easy_explanation",
    label: "설명 간단히",
    description: "핵심 정보만 짧게 표시",
    storageValue: "쉬운 설명",
    group: "support"
  },
  {
    id: "accessible_toilet",
    label: "장애인 화장실",
    description: "장애인 화장실 정보가 확인된 장소만 표시",
    storageValue: "장애인 화장실",
    group: "mobility"
  },
  {
    id: "parking_friendly",
    label: "장애인 주차",
    description: "장애인 전용 주차 정보가 확인된 장소만 표시",
    storageValue: "장애인 주차",
    group: "mobility"
  },
  {
    id: "public_transport_ready",
    label: "대중교통 접근",
    description: "노선·정류장 정보가 확인되고 긴 도보 이동으로 표시된 장소는 제외",
    storageValue: "대중교통 이동",
    group: "mobility"
  },
  {
    id: "stroller_friendly",
    label: "유모차 이동",
    description: "유모차 정보와 턱 없는 출입이 함께 확인된 장소만 표시",
    storageValue: "유모차 동반",
    group: "support"
  },
  {
    id: "family_support",
    label: "영유아 동반",
    description: "수유실·아기의자·기저귀 교환 정보가 확인된 장소만 표시",
    storageValue: "영유아 동반",
    group: "support"
  },
  {
    id: "guided_support",
    label: "안내 지원",
    description: "안내 인력·보조견 지원 여부를 우선",
    storageValue: "안내 지원",
    group: "support"
  }
] as const;

export type HomeNeedId = (typeof HOME_NEED_OPTIONS)[number]["id"];

export const HOME_PRIMARY_NEED_IDS = [
  "step_free",
  "visual_guidance",
  "hearing_guidance",
  "stroller_friendly",
  "family_support"
] as const satisfies readonly HomeNeedId[];

const HOME_OPTIONAL_RECOMMENDATION_NEED_IDS = [
  "accessible_toilet"
] as const satisfies readonly HomeNeedId[];

export function isHomePrimaryNeed(needId: HomeNeedId) {
  return HOME_PRIMARY_NEED_IDS.includes(needId as (typeof HOME_PRIMARY_NEED_IDS)[number]);
}

function isHomeOptionalRecommendationNeed(needId: HomeNeedId) {
  return HOME_OPTIONAL_RECOMMENDATION_NEED_IDS.includes(
    needId as (typeof HOME_OPTIONAL_RECOMMENDATION_NEED_IDS)[number]
  );
}

export function normalizeHomeNeedSelection(needIds: readonly HomeNeedId[]): HomeNeedId[] {
  const normalized: HomeNeedId[] = [];

  for (const needId of new Set(needIds)) {
    if (isHomePrimaryNeed(needId)) {
      const previousPrimaryIndex = normalized.findIndex(isHomePrimaryNeed);
      if (previousPrimaryIndex >= 0) normalized.splice(previousPrimaryIndex, 1);
      normalized.push(needId);
      continue;
    }
    if (!isHomeOptionalRecommendationNeed(needId)) continue;
    normalized.push(needId);
  }

  return normalized;
}

export function getHomeRecommendationNeedIds(needIds: readonly HomeNeedId[]): HomeNeedId[] {
  return normalizeHomeNeedSelection(needIds);
}

export function toggleHomeNeedSelection(
  currentNeedIds: readonly HomeNeedId[],
  needId: HomeNeedId
): HomeNeedId[] {
  const normalized = normalizeHomeNeedSelection(currentNeedIds);
  if (normalized.includes(needId)) {
    return normalized.filter((currentNeedId) => currentNeedId !== needId);
  }
  if (isHomePrimaryNeed(needId)) {
    return [...normalized.filter((currentNeedId) => !isHomePrimaryNeed(currentNeedId)), needId];
  }
  if (!isHomeOptionalRecommendationNeed(needId)) return normalized;
  return [...normalized, needId];
}

export type HomeAccessibilityKey =
  | "parking"
  | "route"
  | "public_transport"
  | "ticket_office"
  | "promotion"
  | "wheelchair"
  | "exit"
  | "elevator"
  | "restroom"
  | "auditorium"
  | "room_info"
  | "handicap_etc"
  | "braile_block"
  | "help_dog"
  | "guide_human"
  | "audio_guide"
  | "big_print"
  | "braile_promotion"
  | "guide_system"
  | "blind_handicap_etc"
  | "sign_guide"
  | "video_guide"
  | "hearing_room"
  | "hearing_handicap_etc"
  | "stroller"
  | "lactation_room"
  | "baby_spare_chair"
  | "infants_family_etc";

export interface HomeAccessibilityEvidence {
  key: HomeAccessibilityKey;
  label: string;
  value: string;
}

export type HomeEvidenceStatus = "available" | "unavailable" | "unknown";

export type HomeAccessibilityGroupId = "mobility" | "visual" | "hearing" | "family";

export interface HomeAccessibilityGroup {
  id: HomeAccessibilityGroupId;
  label: string;
  description: string;
  evidence: HomeAccessibilityEvidence[];
}

export interface HomeNeedEvidenceCheck {
  id: string;
  label: string;
  status: HomeEvidenceStatus;
  evidence: HomeAccessibilityEvidence[];
}

export interface HomePlace {
  id: string;
  title: string;
  category: string | null;
  address: string | null;
  imageUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  sourceUpdatedAt: string | null;
  overview: string | null;
  hours: string | null;
  restDate: string | null;
  fee: string | null;
  phone: string | null;
  parking: string | null;
  officialUrl: string | null;
  reservationUrl: string | null;
  eventStartDate?: string | null;
  eventEndDate?: string | null;
  accessibility: HomeAccessibilityEvidence[];
}

export interface RankedHomePlace extends HomePlace {
  distanceMeters: number | null;
  matchedNeedIds: HomeNeedId[];
}

export interface HomeDataResponse {
  places: RankedHomePlace[];
  festivals: RankedHomePlace[];
  source: string;
}

export interface HomeLocation {
  lat: number;
  lng: number;
}

export interface SelectHomePlaceOptions {
  needIds: readonly HomeNeedId[];
  query?: string;
  limit?: number;
  now?: Date;
  recommendationSeed?: number;
  excludedPlaceIds?: readonly string[];
}

const DEFAULT_DISCOVERY_VISIT_CATEGORIES = new Set([
  "관광지",
  "문화시설",
  "축제·행사",
  "여행코스",
  "레포츠"
]);

const LEGACY_NEED_MAP: Record<string, HomeNeedId[]> = {
  보행: ["step_free"],
  시각: ["visual_guidance"],
  청각: ["hearing_guidance"],
  wheelchair: ["step_free"],
  mobility_access: ["step_free"],
  visual_impairment: ["visual_guidance"],
  hearing_impairment: ["hearing_guidance"]
};

const EVIDENCE_KEYS_BY_NEED: Record<HomeNeedId, HomeAccessibilityKey[]> = {
  step_free: ["route", "exit"],
  short_distance: [],
  visual_guidance: [
    "braile_block",
    "help_dog",
    "guide_human",
    "audio_guide",
    "big_print",
    "braile_promotion",
    "guide_system",
    "blind_handicap_etc"
  ],
  hearing_guidance: ["sign_guide", "video_guide", "hearing_room", "hearing_handicap_etc"],
  easy_explanation: [],
  accessible_toilet: ["restroom"],
  stroller_friendly: ["stroller"],
  family_support: ["lactation_room", "baby_spare_chair", "infants_family_etc"],
  guided_support: ["guide_human", "help_dog"],
  parking_friendly: ["parking"],
  public_transport_ready: ["public_transport"]
};

const FILTER_EVIDENCE_KEYS = new Set<HomeAccessibilityKey>(
  Object.values(EVIDENCE_KEYS_BY_NEED).flat()
);

const ACCESSIBILITY_GROUPS: Array<{
  id: HomeAccessibilityGroupId;
  label: string;
  description: string;
  keys: HomeAccessibilityKey[];
}> = [
  {
    id: "mobility",
    label: "이동과 시설",
    description: "접근로, 출입구, 엘리베이터, 화장실처럼 이동에 필요한 정보",
    keys: [
      "parking",
      "route",
      "public_transport",
      "ticket_office",
      "promotion",
      "wheelchair",
      "exit",
      "elevator",
      "restroom",
      "auditorium",
      "room_info",
      "handicap_etc"
    ]
  },
  {
    id: "visual",
    label: "시각 지원",
    description: "점자, 음성, 안내 인력처럼 시각 정보 이용을 돕는 지원",
    keys: [
      "braile_block",
      "help_dog",
      "guide_human",
      "audio_guide",
      "big_print",
      "braile_promotion",
      "guide_system",
      "blind_handicap_etc"
    ]
  },
  {
    id: "hearing",
    label: "청각 지원",
    description: "수어, 자막, 청각 지원 객실처럼 청각 정보 이용을 돕는 지원",
    keys: ["sign_guide", "video_guide", "hearing_room", "hearing_handicap_etc"]
  },
  {
    id: "family",
    label: "영유아 동반",
    description: "유모차, 수유실, 아기의자처럼 영유아 동반에 필요한 정보",
    keys: ["stroller", "lactation_room", "baby_spare_chair", "infants_family_etc"]
  }
];

const NEED_EVIDENCE_CHECKS: Partial<
  Record<HomeNeedId, Array<{ id: string; label: string; keys: HomeAccessibilityKey[] }>>
> = {
  step_free: [
    {
      id: "step-free-entry",
      label: "턱 없는 출입구·접근로",
      keys: ["route", "exit"]
    }
  ],
  visual_guidance: [
    {
      id: "visual-support",
      label: "시각 지원 정보",
      keys: [
        "braile_block",
        "help_dog",
        "guide_human",
        "audio_guide",
        "big_print",
        "braile_promotion",
        "guide_system",
        "blind_handicap_etc"
      ]
    }
  ],
  hearing_guidance: [
    {
      id: "hearing-guide",
      label: "청각 지원 정보",
      keys: ["sign_guide", "video_guide", "hearing_room", "hearing_handicap_etc"]
    }
  ],
  accessible_toilet: [
    {
      id: "accessible-toilet",
      label: "장애인 화장실",
      keys: ["restroom"]
    }
  ],
  stroller_friendly: [
    {
      id: "stroller-friendly",
      label: "유모차 이용 정보",
      keys: ["stroller"]
    },
    {
      id: "stroller-step-free",
      label: "턱 없는 출입구·접근로",
      keys: ["route", "exit"]
    }
  ],
  family_support: [
    {
      id: "family-support",
      label: "영유아 동반 편의",
      keys: ["lactation_room", "baby_spare_chair", "infants_family_etc"]
    }
  ],
  guided_support: [
    {
      id: "guided-support",
      label: "안내 동반",
      keys: ["guide_human", "help_dog"]
    }
  ],
  parking_friendly: [
    {
      id: "parking-friendly",
      label: "장애인 주차",
      keys: ["parking"]
    }
  ],
  public_transport_ready: [
    {
      id: "public-transport",
      label: "대중교통 접근",
      keys: ["public_transport"]
    }
  ]
};

export function resolveHomeNeedIds(values: readonly string[] | null | undefined): HomeNeedId[] {
  if (!values?.length) return [];

  const ids = new Set<HomeNeedId>();
  for (const value of values) {
    const option = HOME_NEED_OPTIONS.find(
      (item) => item.storageValue === value || item.id === value
    );
    if (option) {
      ids.add(option.id);
      continue;
    }
    for (const legacyId of LEGACY_NEED_MAP[value] ?? []) ids.add(legacyId);
  }
  return [...ids];
}

export function homeNeedIdsToStorageValues(ids: readonly HomeNeedId[]): string[] {
  return ids.flatMap((id) => {
    const value = HOME_NEED_OPTIONS.find((option) => option.id === id)?.storageValue;
    return value ? [value] : [];
  });
}

export function homeNeedIdsToChatNeeds(ids: readonly HomeNeedId[]): string[] {
  const values = new Set<string>();
  for (const id of ids) {
    if (id === "step_free") values.add("step_free");
    if (id === "short_distance") values.add("short_distance");
    if (id === "visual_guidance") values.add("visual_impairment");
    if (id === "hearing_guidance") values.add("hearing_impairment");
    if (id === "easy_explanation") values.add("easy_explanation");
    if (id === "accessible_toilet") values.add("accessible_toilet");
    if (id === "stroller_friendly") values.add("stroller");
    if (id === "family_support") values.add("stroller");
    if (id === "guided_support") values.add("visual_impairment");
    if (id === "parking_friendly") values.add("accessible_parking");
    if (id === "public_transport_ready") values.add("public_transport");
  }
  return [...values];
}

export function rankHomePlaces(
  places: readonly HomePlace[],
  needIds: readonly HomeNeedId[],
  location: HomeLocation | null,
  query = ""
): RankedHomePlace[] {
  const normalizedQuery = normalizeSearchText(query);
  const isDefaultDiscovery = !normalizedQuery && !needIds.length && !location;
  const evidenceNeedIds = getStrictFilterNeedIds(needIds);
  const queryMatches = places.filter(
    (place) =>
      (!normalizedQuery || placeMatchesQuery(place, normalizedQuery)) &&
      evidenceNeedIds.every((needId) => placeSatisfiesHomeNeed(place, needId))
  );
  const exactTitleMatches = normalizedQuery
    ? queryMatches.filter((place) => normalizeSearchText(place.title) === normalizedQuery)
    : [];
  const candidates = exactTitleMatches.length ? exactTitleMatches : queryMatches;

  return candidates
    .map((place) => {
      const availableEvidence = place.accessibility.filter(
        (item) => getHomeEvidenceStatus(item) === "available"
      );
      const matchedNeedIds = needIds.filter((needId) => {
        if (needId === "short_distance") return false;
        if (needId === "easy_explanation") return false;
        return placeSatisfiesHomeNeed(place, needId);
      });
      const distanceMeters =
        location && hasCoordinates(place) ? distanceBetween(location, place) : null;
      const matchedEvidenceCount = availableEvidence.filter((item) =>
        needIds.some(
          (needId) =>
            EVIDENCE_KEYS_BY_NEED[needId].includes(item.key) &&
            evidenceSatisfiesHomeNeed(place, item, needId)
        )
      ).length;
      const completeness = [
        place.imageUrl,
        place.address,
        place.hours,
        place.phone,
        place.overview
      ].filter(Boolean).length;
      const discoveryCategoryPriority =
        place.category && DEFAULT_DISCOVERY_VISIT_CATEGORIES.has(place.category) ? 1 : 0;
      const queryMatchPriority = normalizedQuery
        ? getQueryMatchPriority(place, normalizedQuery)
        : 0;

      return {
        place,
        distanceMeters,
        matchedNeedIds,
        matchedEvidenceCount,
        availableEvidenceCount: availableEvidence.length,
        completeness,
        discoveryCategoryPriority,
        queryMatchPriority
      };
    })
    .sort((a, b) => {
      if (needIds.includes("short_distance")) {
        const distanceOrder = compareKnownDistances(a.distanceMeters, b.distanceMeters);
        if (distanceOrder !== 0) return distanceOrder;
      }
      if (b.queryMatchPriority !== a.queryMatchPriority) {
        return b.queryMatchPriority - a.queryMatchPriority;
      }
      if (b.matchedNeedIds.length !== a.matchedNeedIds.length) {
        return b.matchedNeedIds.length - a.matchedNeedIds.length;
      }
      if (b.matchedEvidenceCount !== a.matchedEvidenceCount) {
        return b.matchedEvidenceCount - a.matchedEvidenceCount;
      }
      if (isDefaultDiscovery && b.discoveryCategoryPriority !== a.discoveryCategoryPriority) {
        return b.discoveryCategoryPriority - a.discoveryCategoryPriority;
      }
      if (b.availableEvidenceCount !== a.availableEvidenceCount) {
        return b.availableEvidenceCount - a.availableEvidenceCount;
      }
      if (b.completeness !== a.completeness) return b.completeness - a.completeness;
      return a.place.title.localeCompare(b.place.title, "ko");
    })
    .map(({ place, distanceMeters, matchedNeedIds }) => ({
      ...place,
      distanceMeters,
      matchedNeedIds
    }));
}

export function selectHomePlacesForDisplay(
  rankedPlaces: readonly RankedHomePlace[],
  {
    needIds,
    query = "",
    limit = 16,
    now = new Date(),
    recommendationSeed,
    excludedPlaceIds = []
  }: SelectHomePlaceOptions
): RankedHomePlace[] {
  const normalizedQuery = normalizeSearchText(query);
  const evidenceNeedIds = getStrictFilterNeedIds(needIds);
  const evidenceMatchedPlaces = rankedPlaces.filter((place) =>
    evidenceNeedIds.every((needId) => placeSatisfiesHomeNeed(place, needId))
  );
  const eligiblePlaces = normalizedQuery
    ? evidenceMatchedPlaces
    : evidenceMatchedPlaces.filter((place) => !isPastEvent(place, now));
  const shouldPreserveRanking = normalizedQuery || needIds.includes("short_distance");
  if (shouldPreserveRanking) return eligiblePlaces.slice(0, limit);

  const isDefaultDiscovery = !needIds.length;
  const explicitRecommendationSeed = normalizeRecommendationSeed(recommendationSeed);
  const selectionSeed =
    explicitRecommendationSeed ?? (isDefaultDiscovery ? getKoreaDateSeed(now) : 0);
  const rotateTopCandidateCount =
    explicitRecommendationSeed === null ? (isDefaultDiscovery ? 3 : 0) : 8;
  const excludedPlaceIdSet = new Set(excludedPlaceIds);
  const selected: RankedHomePlace[] = [];
  const tieredPlaces = groupPlacesByRelevanceTier(eligiblePlaces);

  for (const tierPlaces of tieredPlaces) {
    const freshPlaces = tierPlaces.filter((place) => !excludedPlaceIdSet.has(place.id));
    const repeatedPlaces = tierPlaces.filter((place) => excludedPlaceIdSet.has(place.id));
    const diversifiedTier = [
      ...spreadPlacesByCategory(freshPlaces, {
        rotateCategoriesBy: selectionSeed,
        rotateTopCandidatesBy: selectionSeed,
        rotateTopCandidateCount
      }),
      ...spreadPlacesByCategory(repeatedPlaces, {
        rotateCategoriesBy: selectionSeed + 1,
        rotateTopCandidatesBy: selectionSeed + 1,
        rotateTopCandidateCount
      })
    ];
    selected.push(...diversifiedTier);
    if (selected.length >= limit) return selected.slice(0, limit);
  }

  return selected;
}

export function selectHomeFestivals(
  rankedPlaces: readonly RankedHomePlace[],
  { limit = 3, now = new Date() }: { limit?: number; now?: Date } = {}
): RankedHomePlace[] {
  const today = getKoreaDateSeed(now);
  const safeLimit = Math.max(0, Math.floor(limit));

  return rankedPlaces
    .filter((place) => place.category === "축제·행사" && !isPastEvent(place, now))
    .sort((a, b) => {
      const aStart = getHomeEventDateSeed(a.eventStartDate);
      const bStart = getHomeEventDateSeed(b.eventStartDate);
      const aEnd = getHomeEventDateSeed(a.eventEndDate);
      const bEnd = getHomeEventDateSeed(b.eventEndDate);
      const aIsCurrent = aStart !== null && aStart <= today && (aEnd === null || aEnd >= today);
      const bIsCurrent = bStart !== null && bStart <= today && (bEnd === null || bEnd >= today);

      if (aIsCurrent !== bIsCurrent) return aIsCurrent ? -1 : 1;
      if (aStart !== null && bStart !== null && aStart !== bStart) return aStart - bStart;
      if (aStart !== null) return -1;
      if (bStart !== null) return 1;
      return a.title.localeCompare(b.title, "ko");
    })
    .slice(0, safeLimit);
}

export function placeSatisfiesHomeNeed(
  place: Pick<HomePlace, "accessibility">,
  needId: HomeNeedId
): boolean {
  if (needId === "short_distance" || needId === "easy_explanation") return true;
  if (needId === "step_free") {
    const accessEvidence = place.accessibility.filter((evidence) =>
      EVIDENCE_KEYS_BY_NEED.step_free.includes(evidence.key)
    );
    if (
      accessEvidence.some((evidence) => hasStepFreeCaution(normalizeEvidenceText(evidence.value)))
    ) {
      return false;
    }
    return accessEvidence.some((evidence) =>
      evidenceSatisfiesHomeNeed(place, evidence, "step_free")
    );
  }
  if (needId === "stroller_friendly") {
    return (
      place.accessibility.some((evidence) =>
        evidenceSatisfiesHomeNeed(place, evidence, "stroller_friendly")
      ) && placeSatisfiesHomeNeed(place, "step_free")
    );
  }
  return place.accessibility.some((evidence) => evidenceSatisfiesHomeNeed(place, evidence, needId));
}

export function getConfirmedHomeEvidenceForNeeds(
  place: Pick<HomePlace, "accessibility">,
  needIds: readonly HomeNeedId[]
): HomeAccessibilityEvidence[] {
  const strictNeedIds = getStrictFilterNeedIds(needIds);
  return place.accessibility.filter((evidence) =>
    strictNeedIds.some((needId) => {
      if (
        needId === "stroller_friendly" &&
        (["route", "exit"] as HomeAccessibilityKey[]).includes(evidence.key)
      ) {
        return evidenceSatisfiesHomeNeed(place, evidence, "step_free");
      }
      return evidenceSatisfiesHomeNeed(place, evidence, needId);
    })
  );
}

function getStrictFilterNeedIds(needIds: readonly HomeNeedId[]) {
  return needIds.filter((needId) => needId !== "short_distance" && needId !== "easy_explanation");
}

function evidenceSatisfiesHomeNeed(
  place: Pick<HomePlace, "accessibility">,
  evidence: HomeAccessibilityEvidence,
  needId: HomeNeedId
): boolean {
  if (!EVIDENCE_KEYS_BY_NEED[needId].includes(evidence.key)) return false;
  if (getHomeEvidenceStatus(evidence) !== "available") return false;
  const value = normalizeEvidenceText(evidence.value);
  const labelAndValue = normalizeEvidenceText(`${evidence.label} ${evidence.value}`);

  if (needId === "step_free") return isStrictStepFreeEvidence(evidence.key, value);
  if (needId === "public_transport_ready") return isStrictPublicTransportEvidence(value);
  if (needId === "visual_guidance") return isStrictVisualEvidence(evidence.key, value);
  if (needId === "hearing_guidance") return isStrictHearingEvidence(evidence.key, value);
  if (needId === "stroller_friendly") {
    return (
      /유모차/u.test(labelAndValue) &&
      /(대여|이용|이동|반입|보관|가능|있(?:음|습니다|다)|구비|비치)/u.test(value) &&
      placeSatisfiesHomeNeed(place, "step_free")
    );
  }
  if (needId === "family_support") {
    return /(수유|유아|영유아|아기|아동|기저귀|가족|어린이|아기의자|유아용)/u.test(labelAndValue);
  }
  if (needId === "parking_friendly") return isStrictAccessibleParkingEvidence(value);
  // 관광공사 무장애 전용 `restroom` 필드는 층·위치만 적힌 경우도 실제 시설 근거다.
  if (needId === "accessible_toilet") return true;
  if (needId === "guided_support") {
    return (
      /(안내|해설|보조견|안내견|동반)/u.test(labelAndValue) &&
      /(가능|있(?:음|습니다|다)|지원|동반|운영|배치)/u.test(value)
    );
  }
  return false;
}

function isStrictStepFreeEvidence(key: HomeAccessibilityKey, value: string) {
  if (!["route", "exit"].includes(key)) return false;
  if (hasStepFreeCaution(value)) return false;
  return /((단차|턱|계단)\s*(?:가|이)?\s*(?:0\s*(?:cm|㎝)?|없(?:음|습니다|다|어|으며|고))|무단차|문턱\s*없|경사로|휠체어.*(?:이용|접근|진입|통행|이동).*(?:가능|쉬움|용이)|(?:이동경로|접근로|출입구|통로).*(?:넓|평탄|가능|쉬움|용이)|내부\s*턱\s*없)/u.test(
    value
  );
}

function hasStepFreeCaution(value: string) {
  const withoutNegatedHazards = value
    .replace(
      /(계단|급경사|가파른\s*경사|비탈|턱|단차)\s*(?:가|이)?\s*(?:0\s*(?:cm|㎝)?|없(?:음|습니다|다|어|으며|고))/gu,
      " "
    )
    .replace(
      /없(?:음|습니다|다|어|으며|고)[^.]{0,12}(계단|급경사|가파른\s*경사|비탈|턱|단차)/gu,
      " "
    );
  return /(계단|급경사|가파른|비탈|흙\s*(?:\([^)]*\))?\s*구간|흙길|자갈|쇄석|돌\s*구간|돌길|석재|노면\s*불량|좁|협소|높(?:은|이)?\s*턱|단차\s*(?:있|높|발생))/u.test(
    withoutNegatedHazards
  );
}

function isStrictPublicTransportEvidence(value: string) {
  if (
    !/(버스|저상버스|지하철|도시철도|기차|열차|역|정류장|노선|\d+\s*번|승강장|KTX|SRT)/iu.test(
      value
    )
  ) {
    return false;
  }
  return !hasTooLongTransitWalk(value);
}

function hasTooLongTransitWalk(value: string) {
  const statedWalks: boolean[] = [];
  const walkMinuteMatches = value.matchAll(/(?:도보|걸어서)\s*(?:약\s*)?(\d+(?:\.\d+)?)\s*분/gu);
  for (const match of walkMinuteMatches) {
    statedWalks.push(Number(match[1]) <= 15);
  }

  const reversedWalkMinuteMatches = value.matchAll(
    /(?:도보|걸어서)[^\d]{0,6}(\d+(?:\.\d+)?)\s*분|(?<!\d)(\d+(?:\.\d+)?)\s*분\s*(?:도보|거리)/gu
  );
  for (const match of reversedWalkMinuteMatches) {
    const minutes = Number(match[1] ?? match[2]);
    const duplicateForwardMatch = match[1] && /(?:도보|걸어서)\s*(?:약\s*)?\d/u.test(match[0]);
    if (!duplicateForwardMatch) statedWalks.push(minutes <= 15);
  }

  const walkKmMatches = value.matchAll(/(?<!\d)(\d+(?:\.\d+)?)\s*km/giu);
  for (const match of walkKmMatches) {
    statedWalks.push(Number(match[1]) <= 1);
  }

  const walkMeterMatches = value.matchAll(/(?<![\d.])(\d{2,})\s*m(?![a-z])/giu);
  for (const match of walkMeterMatches) {
    statedWalks.push(Number(match[1]) <= 1000);
  }

  return statedWalks.length > 0 && !statedWalks.some(Boolean);
}

function isStrictVisualEvidence(key: HomeAccessibilityKey, value: string) {
  if (key === "help_dog")
    return /(보조견|안내견|동반).*(가능|있(?:음|습니다|다)|허용)/u.test(value);
  if (key === "guide_human")
    return /(안내|해설|인력|직원).*(가능|있(?:음|습니다|다)|지원|배치|운영)/u.test(value);
  if (key === "audio_guide") return /(음성|오디오|소리).*(안내|해설|지원|대여|가능)/u.test(value);
  if (key === "big_print") return /(큰\s*글자|확대|대활자)/u.test(value);
  if (key === "blind_handicap_etc") {
    return /(점자|보조견|안내견|음성|오디오|큰\s*글자|대활자|촉지|시각|유도|안내\s*(?:가능|지원))/u.test(
      value
    );
  }
  return /(점자|촉지|유도|안내|설치|있(?:음|습니다|다)|가능|지원|비치|제공)/u.test(value);
}

function isStrictHearingEvidence(key: HomeAccessibilityKey, value: string) {
  if (key === "sign_guide")
    return /(수어|수화).*(안내|통역|지원|가능|있(?:음|습니다|다))/u.test(value);
  if (key === "video_guide")
    return /(자막|수어|수화|문자\s*안내|영상).*(안내|지원|가능|있(?:음|습니다|다)|제공)/u.test(
      value
    );
  if (key === "hearing_room") return /(청각|보청|텔레코일|안내불빛|진동|문자\s*안내)/u.test(value);
  return /(수어|수화|자막|보청|텔레코일|청각|안내불빛|진동|문자\s*안내)/u.test(value);
}

function isStrictAccessibleParkingEvidence(value: string) {
  if (!/(장애인|휠체어|교통약자|전용|우선|배려|입구|출입구|가까|인근|\d+\s*대)/u.test(value)) {
    return false;
  }
  return (
    /(장애인|휠체어|교통약자|전용|우선|배려)/u.test(value) ||
    /(입구|출입구|가까|인근).*\d+\s*대/u.test(value)
  );
}

function normalizeEvidenceText(value: string) {
  return value
    .replace(/<br\s*\/?>/giu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getHomeEvidenceStatus(
  evidence: Pick<HomeAccessibilityEvidence, "key" | "value">
): HomeEvidenceStatus {
  const value = evidence.value.replace(/\s+/g, " ").trim();
  if (!value) return "unknown";

  const safeAbsence =
    /(단차|턱|높이\s*차이|계단)\s*(?:가|이)?\s*(?:0\s*(?:cm|㎝)?|없(?:음|습니다|다|어|으며|고))/u;
  if (safeAbsence.test(value)) return "available";

  const negative =
    /(미설치|미제공|운영하지|지원하지|이용\s*(?:이\s*)?불가|접근\s*(?:이\s*)?불가|진입\s*(?:이\s*)?불가|확인\s*(?:이\s*)?불가|이용하기\s*어려|접근하기\s*어려|없(?:음|습니다|다)|설치되어\s*있지|마련되어\s*있지)/u;
  if (negative.test(value)) return "unavailable";

  const uncertain = /(미확인|확인\s*(?:필요|요망)|문의|알\s*수\s*없|불명|미정|정보\s*(?:없|부족))/u;
  if (uncertain.test(value)) return "unknown";

  const positive =
    /(접근\s*가능|진입\s*가능|이용\s*가능|대여\s*가능|설치|구비|비치|보유|완비|마련|경사로|승강기|엘리베이터|장애인\s*(?:전용\s*)?(?:화장실|주차)|있(?:음|습니다|다))/u;
  if (positive.test(value)) return "available";

  // 한국관광공사 무장애 필드는 기능별 전용 칸이라, 부정 표현이 아닌 설명문 자체가 근거다.
  if (FILTER_EVIDENCE_KEYS.has(evidence.key)) return "available";

  return "unknown";
}

export function getAccessibilityGroups(
  evidence: readonly HomeAccessibilityEvidence[]
): HomeAccessibilityGroup[] {
  return ACCESSIBILITY_GROUPS.flatMap((group) => {
    const groupEvidence = evidence.filter((item) => group.keys.includes(item.key));
    return groupEvidence.length
      ? [
          {
            id: group.id,
            label: group.label,
            description: group.description,
            evidence: groupEvidence
          }
        ]
      : [];
  });
}

export function getNeedEvidenceChecks(
  place: Pick<HomePlace, "accessibility">,
  needIds: readonly HomeNeedId[]
): HomeNeedEvidenceCheck[] {
  const seen = new Set<string>();
  return needIds.flatMap((needId) =>
    (NEED_EVIDENCE_CHECKS[needId] ?? []).flatMap((check) => {
      if (seen.has(check.id)) return [];
      seen.add(check.id);
      const evidence = place.accessibility.filter((item) => check.keys.includes(item.key));
      const strictNeedId =
        needId === "stroller_friendly" && check.id === "stroller-step-free" ? "step_free" : needId;
      const hasConfirmedEvidence = evidence.some((item) =>
        evidenceSatisfiesHomeNeed(place, item, strictNeedId)
      );
      const statuses = evidence.map(getHomeEvidenceStatus);
      const status: HomeEvidenceStatus = hasConfirmedEvidence
        ? "available"
        : statuses.length > 0 && statuses.every((item) => item === "unavailable")
          ? "unavailable"
          : "unknown";
      return [{ id: check.id, label: check.label, status, evidence }];
    })
  );
}

export function sortHomeEvidenceForNeeds(
  evidence: readonly HomeAccessibilityEvidence[],
  needIds: readonly HomeNeedId[]
): HomeAccessibilityEvidence[] {
  const priorityKeys = new Set<HomeAccessibilityKey>();
  for (const needId of needIds) {
    for (const key of EVIDENCE_KEYS_BY_NEED[needId]) priorityKeys.add(key);
  }
  const statusOrder: Record<HomeEvidenceStatus, number> = {
    available: 0,
    unknown: 1,
    unavailable: 2
  };
  return [...evidence].sort((a, b) => {
    const priorityOrder = Number(priorityKeys.has(b.key)) - Number(priorityKeys.has(a.key));
    if (priorityOrder !== 0) return priorityOrder;
    return statusOrder[getHomeEvidenceStatus(a)] - statusOrder[getHomeEvidenceStatus(b)];
  });
}

export function formatDistance(distanceMeters: number | null): string | null {
  if (distanceMeters === null || !Number.isFinite(distanceMeters)) return null;
  if (distanceMeters < 10) return "10m 이내";
  if (distanceMeters < 1000) return `${Math.round(distanceMeters / 10) * 10}m`;
  return `${(distanceMeters / 1000).toFixed(distanceMeters < 10_000 ? 1 : 0)}km`;
}

export function formatSourceDate(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (digits.length < 8) return null;
  const year = digits.slice(0, 4);
  const month = digits.slice(4, 6);
  const day = digits.slice(6, 8);
  if (!Number(year) || !Number(month) || !Number(day)) return null;
  return `${year}.${month}.${day}`;
}

export function summarizeVisitInfo(
  place: Pick<HomePlace, "hours" | "restDate" | "phone">
): string | null {
  if (place.hours) {
    const plainHours = place.hours
      .replace(/\[[^\]]+\]/g, " ")
      .replace(/※.*$/u, " ")
      .replace(/\s+/g, " ")
      .trim();
    const timeRanges = [
      ...new Set(plainHours.match(/\d{1,2}:\d{2}\s*[~～-]\s*\d{1,2}:\d{2}/g) ?? [])
    ];

    if (timeRanges.length) {
      return `운영 ${timeRanges.slice(0, 2).join(" / ")}${timeRanges.length > 2 ? " 외" : ""}`;
    }

    if (/상시\s*(개방|운영)|연중\s*무휴/u.test(plainHours)) return "상시 운영";
    return shortenText(plainHours, 48);
  }

  if (place.restDate) return `휴무 ${shortenText(place.restDate, 42)}`;
  if (place.phone) return `문의 ${shortenText(place.phone, 42)}`;
  return null;
}

function shortenText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}…`;
}

function normalizeSearchText(value: string) {
  return value.toLocaleLowerCase("ko").replace(/\s+/g, "");
}

function placeMatchesQuery(place: HomePlace, query: string) {
  return [
    place.title,
    place.category,
    place.address,
    place.overview,
    ...place.accessibility.flatMap((item) => [item.label, item.value])
  ]
    .filter((value): value is string => Boolean(value))
    .some((value) => normalizeSearchText(value).includes(query));
}

function getQueryMatchPriority(place: HomePlace, query: string) {
  const title = normalizeSearchText(place.title);
  if (title === query) return 4;
  if (title.includes(query)) return 3;
  if (place.category && normalizeSearchText(place.category).includes(query)) return 2;
  if (place.address && normalizeSearchText(place.address).includes(query)) return 1;
  return 0;
}

function hasCoordinates(place: HomePlace): place is HomePlace & {
  latitude: number;
  longitude: number;
} {
  return Number.isFinite(place.latitude) && Number.isFinite(place.longitude);
}

function compareKnownDistances(a: number | null, b: number | null) {
  if (a !== null && b !== null) return a - b;
  if (a !== null) return -1;
  if (b !== null) return 1;
  return 0;
}

function groupPlacesByRelevanceTier(places: readonly RankedHomePlace[]): RankedHomePlace[][] {
  const tiers = new Map<
    string,
    { matchedNeedCount: number; discoveryCategoryPriority: number; places: RankedHomePlace[] }
  >();
  for (const place of places) {
    const discoveryCategoryPriority =
      place.category && DEFAULT_DISCOVERY_VISIT_CATEGORIES.has(place.category) ? 1 : 0;
    const matchedNeedCount = place.matchedNeedIds.length;
    const tierKey = `${matchedNeedCount}:${discoveryCategoryPriority}`;
    const tier = tiers.get(tierKey);
    if (tier) {
      tier.places.push(place);
    } else {
      tiers.set(tierKey, { matchedNeedCount, discoveryCategoryPriority, places: [place] });
    }
  }
  return [...tiers.values()]
    .sort(
      (a, b) =>
        b.matchedNeedCount - a.matchedNeedCount ||
        b.discoveryCategoryPriority - a.discoveryCategoryPriority
    )
    .map((tier) => tier.places);
}

function spreadPlacesByCategory(
  places: readonly RankedHomePlace[],
  {
    rotateCategoriesBy,
    rotateTopCandidatesBy,
    rotateTopCandidateCount
  }: {
    rotateCategoriesBy: number;
    rotateTopCandidatesBy: number;
    rotateTopCandidateCount: number;
  }
): RankedHomePlace[] {
  const buckets = new Map<string, RankedHomePlace[]>();
  for (const place of places) {
    const category = place.category?.trim() || "기타";
    const bucket = buckets.get(category);
    if (bucket) {
      bucket.push(place);
    } else {
      buckets.set(category, [place]);
    }
  }

  const categories = rotateList([...buckets.keys()], rotateCategoriesBy);
  for (const category of categories) {
    const bucket = buckets.get(category);
    if (!bucket || rotateTopCandidateCount <= 1) continue;
    buckets.set(
      category,
      rotateListHead(
        bucket,
        rotateTopCandidatesBy,
        Math.min(rotateTopCandidateCount, bucket.length)
      )
    );
  }

  const spread: RankedHomePlace[] = [];
  while (spread.length < places.length) {
    let added = false;
    for (const category of categories) {
      const bucket = buckets.get(category);
      const nextPlace = bucket?.shift();
      if (!nextPlace) continue;
      spread.push(nextPlace);
      added = true;
    }
    if (!added) break;
  }
  return spread;
}

function rotateList<T>(values: readonly T[], seed: number): T[] {
  if (values.length <= 1) return [...values];
  const offset = Math.abs(seed) % values.length;
  return [...values.slice(offset), ...values.slice(0, offset)];
}

function rotateListHead<T>(values: readonly T[], seed: number, count: number): T[] {
  if (count <= 1) return [...values];
  return [...rotateList(values.slice(0, count), seed), ...values.slice(count)];
}

function normalizeRecommendationSeed(seed: number | undefined): number | null {
  if (seed === undefined || !Number.isSafeInteger(seed) || seed < 0) return null;
  return seed % 0x1_0000_0000;
}

function getKoreaDateSeed(date: Date): number {
  const koreanDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
  return Number(koreanDate.replace(/\D/g, "")) || 0;
}

function isPastEvent(place: RankedHomePlace, now: Date) {
  if (place.category !== "축제·행사") return false;
  const eventEndDate = place.eventEndDate?.replace(/\D/g, "").slice(0, 8);
  if (!eventEndDate || eventEndDate.length !== 8) return false;
  return Number(eventEndDate) < getKoreaDateSeed(now);
}

function getHomeEventDateSeed(value: string | null | undefined): number | null {
  const digits = value?.replace(/\D/g, "").slice(0, 8);
  if (!digits || digits.length !== 8) return null;
  const seed = Number(digits);
  return Number.isFinite(seed) && seed > 0 ? seed : null;
}

function distanceBetween(from: HomeLocation, to: { latitude: number; longitude: number }): number {
  const earthRadius = 6_371_000;
  const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
  const lat1 = toRadians(from.lat);
  const lat2 = toRadians(to.latitude);
  const deltaLat = toRadians(to.latitude - from.lat);
  const deltaLng = toRadians(to.longitude - from.lng);
  const a =
    Math.sin(deltaLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return Math.round(earthRadius * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
