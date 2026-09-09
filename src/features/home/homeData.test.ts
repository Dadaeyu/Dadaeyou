import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_PRIMARY_NEED_IDS,
  formatDistance,
  getAccessibilityGroups,
  getConfirmedHomeEvidenceForNeeds,
  getHomeEvidenceStatus,
  getHomeRecommendationNeedIds,
  getNeedEvidenceChecks,
  homeNeedIdsToChatNeeds,
  homeNeedIdsToStorageValues,
  isHomePrimaryNeed,
  normalizeHomeNeedSelection,
  placeSatisfiesHomeNeed,
  rankHomePlaces,
  resolveHomeNeedIds,
  selectHomeFestivals,
  selectHomePlacesForDisplay,
  sortHomeEvidenceForNeeds,
  summarizeVisitInfo,
  toggleHomeNeedSelection,
  type RankedHomePlace,
  type HomePlace
} from "./homeData.ts";

const basePlace: HomePlace = {
  id: "place-a",
  title: "문화 공간",
  category: "문화시설",
  address: "대전광역시",
  imageUrl: null,
  latitude: 36.35,
  longitude: 127.38,
  sourceUpdatedAt: "20260701000000",
  overview: "실내 전시 공간",
  hours: "09:00~18:00",
  restDate: null,
  fee: null,
  phone: null,
  parking: null,
  officialUrl: null,
  reservationUrl: null,
  accessibility: [
    { key: "route", label: "접근로", value: "출입구까지 경사로가 있고 단차가 없습니다." },
    { key: "elevator", label: "엘리베이터", value: "주 출입구 옆에 있습니다." },
    { key: "restroom", label: "장애인 화장실", value: "1층에 있습니다." }
  ]
};

test("기존 프로필 값을 홈 도움 조건으로 변환한다", () => {
  assert.deepEqual(resolveHomeNeedIds(["보행", "시각"]), ["step_free", "visual_guidance"]);
  assert.deepEqual(homeNeedIdsToStorageValues(["step_free", "easy_explanation"]), [
    "계단 피하기",
    "쉬운 설명"
  ]);
  assert.deepEqual(
    homeNeedIdsToChatNeeds(["step_free", "short_distance", "hearing_guidance", "easy_explanation"]),
    ["step_free", "short_distance", "hearing_impairment", "easy_explanation"]
  );
  assert.deepEqual(
    homeNeedIdsToChatNeeds(["accessible_toilet", "stroller_friendly", "family_support"]),
    ["accessible_toilet", "stroller"]
  );
  assert.deepEqual(
    homeNeedIdsToChatNeeds(["step_free", "parking_friendly", "public_transport_ready"]),
    ["step_free", "accessible_parking", "public_transport"]
  );
});

test("추천 조건은 필요한 도움 1개와 추가 시설만 유지한다", () => {
  const selected = normalizeHomeNeedSelection([
    "step_free",
    "visual_guidance",
    "short_distance",
    "public_transport_ready",
    "accessible_toilet",
    "parking_friendly",
    "easy_explanation"
  ]);

  assert.deepEqual(HOME_PRIMARY_NEED_IDS, [
    "step_free",
    "visual_guidance",
    "hearing_guidance",
    "stroller_friendly",
    "family_support"
  ]);
  assert.equal(isHomePrimaryNeed("visual_guidance"), true);
  assert.deepEqual(selected, ["visual_guidance", "accessible_toilet"]);
  assert.deepEqual(getHomeRecommendationNeedIds(selected), [
    "visual_guidance",
    "accessible_toilet"
  ]);
});

test("같은 선택 그룹에서는 새 조건으로 교체하고 선택된 조건은 다시 누르면 해제한다", () => {
  const selected = ["step_free", "accessible_toilet"] as const;

  assert.deepEqual(toggleHomeNeedSelection(selected, "parking_friendly"), selected);
  assert.deepEqual(toggleHomeNeedSelection(selected, "hearing_guidance"), [
    "accessible_toilet",
    "hearing_guidance"
  ]);
  assert.deepEqual(toggleHomeNeedSelection(selected, "step_free"), ["accessible_toilet"]);
  assert.deepEqual(toggleHomeNeedSelection(selected, "easy_explanation"), selected);
});

test("화면에 없는 예전 추천 값은 숨은 조건으로 유지하지 않는다", () => {
  assert.deepEqual(
    normalizeHomeNeedSelection([
      "guided_support",
      "short_distance",
      "public_transport_ready",
      "parking_friendly",
      "easy_explanation",
      "family_support"
    ]),
    ["family_support"]
  );
});

test("구체적인 방문 도움은 해당 공개 정보가 있는 장소를 우선한다", () => {
  const fullySupported: HomePlace = {
    ...basePlace,
    id: "fully-supported",
    title: "방문 정보가 확인된 장소",
    accessibility: [
      { key: "route", label: "접근로", value: "출입구까지 경사로가 있고 단차가 없습니다." },
      { key: "restroom", label: "장애인 화장실", value: "1층에 설치되어 있습니다." },
      { key: "parking", label: "장애인 주차", value: "전용 주차구역이 있습니다." },
      { key: "public_transport", label: "대중교통", value: "저상버스를 이용할 수 있습니다." },
      { key: "stroller", label: "유모차", value: "유모차를 대여할 수 있습니다." },
      { key: "lactation_room", label: "수유실", value: "수유실이 마련되어 있습니다." },
      { key: "guide_human", label: "안내 인력", value: "안내 인력이 있습니다." }
    ]
  };
  const unsupported: HomePlace = {
    ...basePlace,
    id: "unsupported",
    title: "방문 정보가 없는 장소",
    accessibility: []
  };

  for (const needId of [
    "accessible_toilet",
    "parking_friendly",
    "public_transport_ready",
    "stroller_friendly",
    "family_support",
    "guided_support"
  ] as const) {
    const [first] = rankHomePlaces([unsupported, fullySupported], [needId], null);
    assert.equal(first.id, "fully-supported");
    assert.deepEqual(first.matchedNeedIds, [needId]);
  }
});

test("버스 노선형 대중교통 설명도 실제 추천 근거로 사용한다", () => {
  const transitPlace: HomePlace = {
    ...basePlace,
    id: "transit-place",
    accessibility: [
      {
        key: "public_transport",
        label: "대중교통",
        value: "606번 버스 예술의전당 정류장 하차"
      }
    ]
  };
  const unsupported: HomePlace = {
    ...basePlace,
    id: "no-transit-place",
    accessibility: []
  };

  const [first] = rankHomePlaces([unsupported, transitPlace], ["public_transport_ready"], null);

  assert.equal(first.id, "transit-place");
  assert.deepEqual(first.matchedNeedIds, ["public_transport_ready"]);
  assert.equal(getHomeEvidenceStatus(transitPlace.accessibility[0]), "available");
});

test("선택한 도움과 실제 접근성 근거가 있는 장소를 우선한다", () => {
  const withoutEvidence: HomePlace = {
    ...basePlace,
    id: "place-b",
    title: "야외 공간",
    accessibility: []
  };
  const [first] = rankHomePlaces([withoutEvidence, basePlace], ["step_free"], null);

  assert.equal(first.id, "place-a");
  assert.deepEqual(first.matchedNeedIds, ["step_free"]);
  assert.equal("score" in first, false);
});

test("필드가 있어도 이용 불가 안내는 추천 근거로 사용하지 않는다", () => {
  const unavailablePlace: HomePlace = {
    ...basePlace,
    id: "place-unavailable",
    title: "엘리베이터 미설치 장소",
    accessibility: [
      { key: "elevator", label: "엘리베이터", value: "엘리베이터가 설치되어 있지 않습니다." },
      { key: "restroom", label: "장애인 화장실", value: "장애인 화장실 없음" }
    ]
  };
  const ranked = rankHomePlaces([unavailablePlace], ["step_free"], null);

  assert.deepEqual(ranked, []);
  assert.equal(
    getHomeEvidenceStatus({ key: "elevator", value: "엘리베이터가 설치되어 있지 않습니다." }),
    "unavailable"
  );
});

test("선택한 추천 조건은 모두 만족해야 하며 관련 없는 장소로 보충하지 않는다", () => {
  const toiletOnly: HomePlace = {
    ...basePlace,
    id: "toilet-only",
    title: "화장실만 있는 장소",
    accessibility: [{ key: "restroom", label: "장애인 화장실", value: "장애인 화장실 있음" }]
  };
  const allMatched: HomePlace = {
    ...basePlace,
    id: "all-matched",
    title: "조건을 모두 만족하는 장소",
    accessibility: [
      { key: "route", label: "접근로", value: "출입구까지 경사로가 있고 단차가 없습니다." },
      { key: "restroom", label: "장애인 화장실", value: "장애인 화장실 있음" }
    ]
  };

  const ranked = rankHomePlaces([toiletOnly, allMatched], ["step_free", "accessible_toilet"], null);
  const selected = selectHomePlacesForDisplay(ranked, {
    needIds: ["step_free", "accessible_toilet"],
    limit: 4
  });

  assert.deepEqual(
    ranked.map((place) => place.id),
    ["all-matched"]
  );
  assert.deepEqual(
    selected.map((place) => place.id),
    ["all-matched"]
  );
});

test("계단 피하기는 엘리베이터나 휠체어 대여만으로 추천하지 않는다", () => {
  const elevatorOnly: HomePlace = {
    ...basePlace,
    id: "elevator-only",
    accessibility: [
      { key: "elevator", label: "엘리베이터", value: "엘리베이터가 있습니다." },
      { key: "wheelchair", label: "휠체어", value: "휠체어 대여 가능합니다." }
    ]
  };
  const explicitRoute: HomePlace = {
    ...basePlace,
    id: "explicit-route",
    accessibility: [
      { key: "route", label: "접근로", value: "출입구까지 경사로가 있고 단차가 없습니다." }
    ]
  };

  assert.equal(placeSatisfiesHomeNeed(elevatorOnly, "step_free"), false);
  assert.equal(placeSatisfiesHomeNeed(explicitRoute, "step_free"), true);
  assert.deepEqual(
    rankHomePlaces([elevatorOnly, explicitRoute], ["step_free"], null).map((place) => place.id),
    ["explicit-route"]
  );
});

test("계단 피하기는 계단·급경사·좁은 길 같은 주의 문구가 있으면 제외한다", () => {
  const cautionPlace: HomePlace = {
    ...basePlace,
    id: "caution-route",
    accessibility: [
      {
        key: "route",
        label: "접근로",
        value: "휠체어 접근 가능하지만 일부 구간에 계단과 급경사가 있습니다."
      }
    ]
  };

  assert.equal(placeSatisfiesHomeNeed(cautionPlace, "step_free"), false);
  assert.deepEqual(rankHomePlaces([cautionPlace], ["step_free"], null), []);
});

test("안전한 출입구가 있어도 접근로에 흙·돌 구간이나 계단이 있으면 제외한다", () => {
  const mixedRoute: HomePlace = {
    ...basePlace,
    id: "mixed-route",
    accessibility: [
      {
        key: "route",
        label: "접근로",
        value: "출입구까지 평지로 되어 있으나 흙(돌) 구간과 계단이 있습니다."
      },
      { key: "exit", label: "출입구", value: "출입구에는 경사로가 있고 턱이 없습니다." }
    ]
  };

  assert.equal(placeSatisfiesHomeNeed(mixedRoute, "step_free"), false);
});

test("대중교통 이동은 실제 노선·정류장 근거가 필요하고 긴 도보 이동은 제외한다", () => {
  const concreteTransit: HomePlace = {
    ...basePlace,
    id: "concrete-transit",
    accessibility: [
      { key: "public_transport", label: "대중교통", value: "618번 버스 한밭수목원 정류장 하차" }
    ]
  };
  const longWalkTransit: HomePlace = {
    ...basePlace,
    id: "long-walk-transit",
    accessibility: [
      { key: "public_transport", label: "대중교통", value: "버스 정류장에서 도보 약 20분" }
    ]
  };
  const genericTransit: HomePlace = {
    ...basePlace,
    id: "generic-transit",
    accessibility: [{ key: "public_transport", label: "대중교통", value: "대중교통 이용 가능" }]
  };

  assert.deepEqual(
    rankHomePlaces(
      [longWalkTransit, genericTransit, concreteTransit],
      ["public_transport_ready"],
      null
    ).map((place) => place.id),
    ["concrete-transit"]
  );
});

test("대중교통 경로가 여러 개면 가장 짧은 도보 경로를 기준으로 판단한다", () => {
  const multipleRoutes: HomePlace = {
    ...basePlace,
    id: "multiple-routes",
    accessibility: [
      {
        key: "public_transport",
        label: "대중교통",
        value: "606번 버스 정류장에서 481m, 지하철역에서는 1.7km"
      }
    ]
  };

  assert.equal(placeSatisfiesHomeNeed(multipleRoutes, "public_transport_ready"), true);
});

test("청각 안내는 시각장애인 녹음도서 같은 DB 이상값을 추천 근거로 쓰지 않는다", () => {
  const anomaly: HomePlace = {
    ...basePlace,
    id: "hearing-anomaly",
    accessibility: [
      {
        key: "hearing_handicap_etc",
        label: "청각장애 기타",
        value: "녹음도서 이용가능(시각장애인실 내)"
      }
    ]
  };
  const captioned: HomePlace = {
    ...basePlace,
    id: "captioned",
    accessibility: [
      { key: "video_guide", label: "영상 안내", value: "자막 안내 영상이 제공됩니다." }
    ]
  };

  assert.equal(placeSatisfiesHomeNeed(anomaly, "hearing_guidance"), false);
  assert.deepEqual(
    rankHomePlaces([anomaly, captioned], ["hearing_guidance"], null).map((place) => place.id),
    ["captioned"]
  );
});

test("시각 안내는 점자·보조견·음성·큰글자·유도 안내 필드를 모두 실제 근거로 본다", () => {
  const visualEvidencePlaces = [
    ["braile_promotion", "점자 홍보물이 비치되어 있습니다."],
    ["guide_system", "시각장애인을 위한 유도 안내 시스템이 있습니다."],
    ["blind_handicap_etc", "촉지도와 음성 안내를 지원합니다."]
  ].map(([key, value], index): HomePlace => ({
    ...basePlace,
    id: `visual-${index}`,
    accessibility: [{ key: key as "braile_promotion", label: "시각 안내", value }]
  }));

  assert.deepEqual(
    rankHomePlaces(visualEvidencePlaces, ["visual_guidance"], null).map((place) => place.id),
    ["visual-0", "visual-1", "visual-2"]
  );
});

test("유모차 동반은 유모차 근거와 무단차 동선을 함께 만족해야 한다", () => {
  const strollerOnly: HomePlace = {
    ...basePlace,
    id: "stroller-only",
    accessibility: [{ key: "stroller", label: "유모차", value: "유모차 대여 가능합니다." }]
  };
  const strollerAndRoute: HomePlace = {
    ...basePlace,
    id: "stroller-and-route",
    accessibility: [
      { key: "stroller", label: "유모차", value: "유모차 대여 가능합니다." },
      { key: "route", label: "접근로", value: "출입구까지 경사로가 있고 단차가 없습니다." }
    ]
  };

  assert.equal(placeSatisfiesHomeNeed(strollerOnly, "stroller_friendly"), false);
  assert.deepEqual(
    rankHomePlaces([strollerOnly, strollerAndRoute], ["stroller_friendly"], null).map(
      (place) => place.id
    ),
    ["stroller-and-route"]
  );
});

test("장애인 주차는 일반 주차 가능 문구가 아니라 전용·교통약자 근거가 있어야 한다", () => {
  const genericParking: HomePlace = {
    ...basePlace,
    id: "generic-parking",
    accessibility: [{ key: "parking", label: "장애인 주차", value: "지상주차장 이용 가능" }]
  };
  const accessibleParking: HomePlace = {
    ...basePlace,
    id: "accessible-parking",
    accessibility: [{ key: "parking", label: "장애인 주차", value: "장애인 전용 주차구역 2대" }]
  };

  assert.equal(placeSatisfiesHomeNeed(genericParking, "parking_friendly"), false);
  assert.deepEqual(
    rankHomePlaces([genericParking, accessibleParking], ["parking_friendly"], null).map(
      (place) => place.id
    ),
    ["accessible-parking"]
  );
});

test("단차나 턱이 없다는 설명은 이용 가능한 근거로 구분한다", () => {
  assert.equal(
    getHomeEvidenceStatus({ key: "route", value: "주 출입구까지 단차가 없습니다." }),
    "available"
  );
});

test("문의나 확인 요청만 있는 안내는 이용 가능 근거로 보지 않는다", () => {
  for (const value of ["전화 문의", "방문 전 문의", "확인 요망", "시설 정보 불명"]) {
    assert.equal(
      getHomeEvidenceStatus({ key: "restroom", value }),
      "unknown",
      `${value}는 확인되지 않은 정보여야 합니다.`
    );
  }
});

test("선택한 조건의 확인 근거와 미확인 항목을 구분한다", () => {
  const checks = getNeedEvidenceChecks(basePlace, ["step_free"]);

  assert.deepEqual(
    checks.map(({ label, status }) => ({ label, status })),
    [{ label: "턱 없는 출입구·접근로", status: "available" }]
  );
});

test("상세 조건 확인도 추천과 같은 엄격한 근거 기준을 사용한다", () => {
  const visualSupport: HomePlace = {
    ...basePlace,
    id: "visual-support-check",
    accessibility: [{ key: "help_dog", label: "보조견", value: "보조견 동반 가능" }]
  };
  const hearingAnomaly: HomePlace = {
    ...basePlace,
    id: "hearing-anomaly-check",
    accessibility: [
      {
        key: "hearing_handicap_etc",
        label: "기타 청각 안내",
        value: "녹음도서 이용가능(시각장애인실 내)"
      }
    ]
  };

  assert.deepEqual(
    getNeedEvidenceChecks(visualSupport, ["visual_guidance"]).map(({ label, status }) => ({
      label,
      status
    })),
    [{ label: "시각 지원 정보", status: "available" }]
  );
  assert.deepEqual(
    getNeedEvidenceChecks(hearingAnomaly, ["hearing_guidance"]).map(({ label, status }) => ({
      label,
      status
    })),
    [{ label: "청각 지원 정보", status: "unknown" }]
  );
});

test("카드와 상세 요약에는 엄격한 추천 판정을 통과한 근거만 제공한다", () => {
  const place: HomePlace = {
    ...basePlace,
    id: "strict-summary-evidence",
    accessibility: [
      {
        key: "hearing_handicap_etc",
        label: "기타 청각 안내",
        value: "녹음도서 이용가능(시각장애인실 내)"
      },
      {
        key: "hearing_handicap_etc",
        label: "기타 청각 안내",
        value: "수화 안내와 자막 비디오 가이드 있음"
      }
    ]
  };

  assert.deepEqual(
    getConfirmedHomeEvidenceForNeeds(place, ["hearing_guidance"]).map((item) => item.value),
    ["수화 안내와 자막 비디오 가이드 있음"]
  );
});

test("접근성 정보는 이동·시각·청각·영유아 목적별로 묶는다", () => {
  const evidence = [
    ...basePlace.accessibility,
    { key: "audio_guide" as const, label: "음성 안내", value: "음성 안내기를 대여할 수 있습니다." },
    { key: "stroller" as const, label: "유모차", value: "유모차를 대여할 수 있습니다." }
  ];
  const groups = getAccessibilityGroups(evidence);

  assert.deepEqual(
    groups.map((group) => group.id),
    ["mobility", "visual", "family"]
  );
  assert.equal(sortHomeEvidenceForNeeds(evidence, ["visual_guidance"])[0]?.key, "audio_guide");
});

test("장소명뿐 아니라 활동과 편의시설 정보도 검색한다", () => {
  assert.equal(rankHomePlaces([basePlace], [], null, "전시").length, 1);
  assert.equal(rankHomePlaces([basePlace], [], null, "화장실").length, 1);
  assert.equal(rankHomePlaces([basePlace], [], null, "수영").length, 0);
});

test("정확한 장소명 검색에는 소개문에 이름만 언급된 주변 장소를 섞지 않는다", () => {
  const exactPlace: HomePlace = {
    ...basePlace,
    id: "forest-center",
    title: "국립대전숲체원"
  };
  const nearbyRestaurant: HomePlace = {
    ...basePlace,
    id: "nearby-restaurant",
    title: "주변 식당",
    overview: "국립대전숲체원 인근에서 식사하기 좋은 곳"
  };

  const ranked = rankHomePlaces([nearbyRestaurant, exactPlace], [], null, "국립대전숲체원");

  assert.deepEqual(
    ranked.map((place) => place.id),
    ["forest-center"]
  );
});

test("일반 검색에서는 제목에 맞는 장소를 소개문에만 언급된 장소보다 먼저 보여준다", () => {
  const titleMatch: HomePlace = {
    ...basePlace,
    id: "park",
    title: "한밭수목원"
  };
  const overviewMatch: HomePlace = {
    ...basePlace,
    id: "restaurant-near-park",
    title: "정원 식당",
    overview: "한밭수목원 근처에서 이용할 수 있는 식당",
    accessibility: [
      ...basePlace.accessibility,
      { key: "parking", label: "주차", value: "주차 가능" }
    ]
  };

  const ranked = rankHomePlaces([overviewMatch, titleMatch], [], null, "수목원");

  assert.equal(ranked[0]?.id, "park");
});

test("실제 좌표가 있을 때만 거리를 계산한다", () => {
  const [ranked] = rankHomePlaces([basePlace], ["short_distance"], { lat: 36.35, lng: 127.38 });

  assert.equal(formatDistance(ranked.distanceMeters), "10m 이내");
});

test("조건 없는 기본 홈은 숙박보다 방문 목적지 후보를 먼저 보여준다", () => {
  const places = [
    { id: "hotel-icc", title: "호텔ICC", category: "숙박" },
    { id: "expo-plaza", title: "대전엑스포시민광장", category: "관광지" },
    { id: "art-museum", title: "대전시립미술관", category: "문화시설" }
  ].map((item): HomePlace => ({
    ...basePlace,
    ...item,
    imageUrl: `https://example.com/${item.id}.jpg`,
    accessibility:
      item.category === "숙박"
        ? [
            ...basePlace.accessibility,
            { key: "parking", label: "장애인 주차", value: "장애인 주차 있음" }
          ]
        : basePlace.accessibility
  }));

  const ranked = rankHomePlaces(places, [], null);

  assert.deepEqual(
    new Set(ranked.slice(0, 2).map((place) => place.category)),
    new Set(["관광지", "문화시설"])
  );
  assert.equal(ranked[2]?.category, "숙박");
  assert.deepEqual(
    new Set(ranked.map((place) => place.id)),
    new Set(places.map((place) => place.id))
  );
});

test("조건 없는 기본 홈 순서는 날짜와 무관하게 안정적이다", () => {
  const places = ["a", "b", "c"].map((id): HomePlace => ({
    ...basePlace,
    id,
    title: `장소 ${id}`,
    imageUrl: `https://example.com/${id}.jpg`
  }));

  const firstRanking = rankHomePlaces(places, [], null).map((place) => place.id);
  const secondRanking = rankHomePlaces(places, [], null).map((place) => place.id);

  assert.deepEqual(firstRanking, secondRanking);
  assert.deepEqual(firstRanking, ["a", "b", "c"]);
});

test("홈 노출 후보는 관련도 티어를 보존하면서 카테고리가 한 종류에 몰리지 않게 고른다", () => {
  const rankedPlaces = [
    rankedPlace("museum-a", "문화시설", ["accessible_toilet"]),
    rankedPlace("museum-b", "문화시설", ["accessible_toilet"]),
    rankedPlace("museum-c", "문화시설", ["accessible_toilet"]),
    rankedPlace("park-a", "관광지", ["accessible_toilet"]),
    rankedPlace("sports-a", "레포츠", ["accessible_toilet"]),
    rankedPlace("hotel-a", "숙박", []),
    rankedPlace("hotel-b", "숙박", []),
    rankedPlace("food-a", "음식점", [])
  ];

  const selected = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: ["accessible_toilet"],
    limit: 6
  });

  assert.deepEqual(
    selected.map((place) => place.id),
    ["museum-a", "park-a", "sports-a", "museum-b", "museum-c", "hotel-a"]
  );
});

test("같은 조건 매칭 수라면 입력 앞쪽의 비방문 카테고리보다 방문 목적지 카테고리를 먼저 고른다", () => {
  const rankedPlaces = [
    rankedPlace("hotel-a", "숙박", ["accessible_toilet"]),
    rankedPlace("food-a", "음식점", ["accessible_toilet"]),
    rankedPlace("museum-a", "문화시설", ["accessible_toilet"]),
    rankedPlace("park-a", "관광지", ["accessible_toilet"])
  ];

  const selected = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: ["accessible_toilet"],
    limit: 2
  });

  assert.deepEqual(
    selected.map((place) => place.id),
    ["museum-a", "park-a"]
  );
});

test("검색어와 가까운순 추천은 정확도와 거리순을 그대로 유지한다", () => {
  const rankedPlaces = [
    rankedPlace("place-c", "문화시설", []),
    rankedPlace("place-a", "관광지", []),
    rankedPlace("place-b", "쇼핑", [])
  ];

  assert.deepEqual(
    selectHomePlacesForDisplay(rankedPlaces, {
      needIds: [],
      query: "미술관",
      limit: 3,
      recommendationSeed: 99
    }).map((place) => place.id),
    ["place-c", "place-a", "place-b"]
  );
  assert.deepEqual(
    selectHomePlacesForDisplay(rankedPlaces, {
      needIds: ["short_distance"],
      limit: 3,
      recommendationSeed: 99
    }).map((place) => place.id),
    ["place-c", "place-a", "place-b"]
  );
});

test("조건 없는 기본 홈은 한국 날짜 기준으로 첫 묶음을 안전하게 순환한다", () => {
  const rankedPlaces = [
    rankedPlace("museum-a", "문화시설", []),
    rankedPlace("museum-b", "문화시설", []),
    rankedPlace("museum-c", "문화시설", []),
    rankedPlace("museum-d", "문화시설", []),
    rankedPlace("park-a", "관광지", []),
    rankedPlace("park-b", "관광지", []),
    rankedPlace("shopping-a", "쇼핑", [])
  ];

  const firstDay = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    now: new Date("2026-08-09T00:00:00+09:00")
  }).map((place) => place.id);
  const nextDay = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    now: new Date("2026-08-10T00:00:00+09:00")
  }).map((place) => place.id);

  assert.notDeepEqual(firstDay, nextDay);
  assert.equal(new Set(firstDay).size, 4);
  assert.equal(new Set(nextDay).size, 4);
});

test("새 방문 seed는 품질 티어 안에서 실제로 다른 장소 묶음을 만든다", () => {
  const rankedPlaces = Array.from({ length: 12 }, (_, index) =>
    rankedPlace(`museum-${index}`, "문화시설", [])
  );

  const firstVisit = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    recommendationSeed: 0
  }).map((place) => place.id);
  const nextVisit = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    recommendationSeed: 1
  }).map((place) => place.id);

  assert.notDeepEqual(firstVisit, nextVisit);
  assert.notDeepEqual(new Set(firstVisit), new Set(nextVisit));
  assert.deepEqual(
    selectHomePlacesForDisplay(rankedPlaces, {
      needIds: [],
      limit: 4,
      recommendationSeed: 1
    }).map((place) => place.id),
    nextVisit
  );
});

test("최근 본 장소는 같은 품질 티어의 새 후보가 있으면 먼저 제외한다", () => {
  const rankedPlaces = Array.from({ length: 12 }, (_, index) =>
    rankedPlace(`park-${index}`, "관광지", [])
  );
  const firstVisit = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    recommendationSeed: 2
  });
  const nextVisit = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    recommendationSeed: 3,
    excludedPlaceIds: firstVisit.map((place) => place.id)
  });

  assert.equal(
    nextVisit.some((place) => firstVisit.some((previous) => previous.id === place.id)),
    false
  );
});

test("새 후보가 부족하면 최근 본 장소를 같은 품질 티어 안에서 안전하게 보충한다", () => {
  const rankedPlaces = [
    rankedPlace("museum-a", "문화시설", []),
    rankedPlace("museum-b", "문화시설", []),
    rankedPlace("park-a", "관광지", [])
  ];

  const selected = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 3,
    recommendationSeed: 4,
    excludedPlaceIds: rankedPlaces.map((place) => place.id)
  });

  assert.equal(selected.length, 3);
  assert.deepEqual(
    new Set(selected.map((place) => place.id)),
    new Set(rankedPlaces.map((place) => place.id))
  );
});

test("지난 축제는 홈 발견 후보에서 제외하고 진행 중이거나 예정된 행사만 남긴다", () => {
  const rankedPlaces = [
    {
      ...rankedPlace("festival-ended", "축제·행사", []),
      eventStartDate: "20251201",
      eventEndDate: "20251231"
    },
    {
      ...rankedPlace("festival-current", "축제·행사", []),
      eventStartDate: "20260801",
      eventEndDate: "20260831"
    },
    {
      ...rankedPlace("festival-upcoming", "축제·행사", []),
      eventStartDate: "20260901",
      eventEndDate: "20260905"
    },
    rankedPlace("museum", "문화시설", [])
  ];

  const selected = selectHomePlacesForDisplay(rankedPlaces, {
    needIds: [],
    limit: 4,
    now: new Date("2026-08-09T12:00:00+09:00")
  });

  assert.equal(
    selected.some((place) => place.id === "festival-ended"),
    false
  );
  assert.deepEqual(
    new Set(selected.map((place) => place.id)),
    new Set(["festival-current", "festival-upcoming", "museum"])
  );
});

test("홈 축제는 종료된 행사를 빼고 진행 중인 행사와 가까운 예정 순으로 고른다", () => {
  const rankedPlaces = [
    {
      ...rankedPlace("festival-later", "축제·행사", []),
      eventStartDate: "20261001",
      eventEndDate: "20261005"
    },
    {
      ...rankedPlace("festival-current", "축제·행사", []),
      eventStartDate: "20260801",
      eventEndDate: "20260831"
    },
    {
      ...rankedPlace("festival-next", "축제·행사", []),
      eventStartDate: "20260901",
      eventEndDate: "20260903"
    },
    {
      ...rankedPlace("festival-ended", "축제·행사", []),
      eventStartDate: "20260701",
      eventEndDate: "20260703"
    },
    rankedPlace("museum", "문화시설", [])
  ];

  const selected = selectHomeFestivals(rankedPlaces, {
    limit: 3,
    now: new Date("2026-08-13T12:00:00+09:00")
  });

  assert.deepEqual(
    selected.map((place) => place.id),
    ["festival-current", "festival-next", "festival-later"]
  );
});

test("긴 이동 피하기는 접근성 필드 수보다 실제 직선거리를 먼저 적용한다", () => {
  const nearbyPlace: HomePlace = {
    ...basePlace,
    id: "place-nearby",
    title: "가까운 장소",
    latitude: 36.3501,
    longitude: 127.3801,
    accessibility: []
  };
  const fartherPlace: HomePlace = {
    ...basePlace,
    id: "place-farther",
    title: "먼 장소",
    latitude: 36.39,
    longitude: 127.42
  };
  const ranked = rankHomePlaces([fartherPlace, nearbyPlace], ["short_distance"], {
    lat: 36.35,
    lng: 127.38
  });

  assert.equal(ranked[0].id, "place-nearby");
  assert.deepEqual(ranked[0].matchedNeedIds, []);
});

test("긴 관광 운영시간을 홈에서 읽기 쉽게 요약한다", () => {
  assert.equal(
    summarizeVisitInfo({
      hours:
        "[전자정보자료실]- 평일 09:00~18:00- 주말 09:00~18:00[일반열람실]- 하절기 07:00~22:00※ 자세한 사항은 홈페이지 참조",
      restDate: null,
      phone: null
    }),
    "운영 09:00~18:00 / 07:00~22:00"
  );
  assert.equal(
    summarizeVisitInfo({ hours: "상시 개방", restDate: null, phone: null }),
    "상시 운영"
  );
});

function rankedPlace(
  id: string,
  category: string,
  matchedNeedIds: RankedHomePlace["matchedNeedIds"]
): RankedHomePlace {
  return {
    ...basePlace,
    id,
    title: id,
    category,
    distanceMeters: null,
    matchedNeedIds
  };
}
