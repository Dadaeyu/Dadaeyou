import assert from "node:assert/strict";
import test from "node:test";

type AccessibilityEvidenceRow = {
  id: string;
  title: string;
  metadata?: {
    accessibility?: Record<string, string>;
  };
};

type AccessibilityEvidenceModule = {
  filterRowsByAccessibilityEvidence?: (
    rows: AccessibilityEvidenceRow[],
    needs: string[]
  ) => AccessibilityEvidenceRow[];
};

async function loadAccessibilityEvidenceModule() {
  let loadedModule: AccessibilityEvidenceModule | null = null;
  let importError: unknown = null;

  try {
    const modulePath = "./accessibilityEvidence.ts";
    loadedModule = (await import(modulePath)) as AccessibilityEvidenceModule;
  } catch (error) {
    importError = error;
    loadedModule = null;
  }

  if (!loadedModule) {
    assert.fail(
      `accessibilityEvidence.ts should be importable${
        importError instanceof Error ? `: ${importError.message}` : ""
      }`
    );
  }

  const filterRowsByAccessibilityEvidence = loadedModule.filterRowsByAccessibilityEvidence;
  assert.equal(
    typeof filterRowsByAccessibilityEvidence,
    "function",
    "accessibilityEvidence.ts should export filterRowsByAccessibilityEvidence"
  );

  return filterRowsByAccessibilityEvidence as NonNullable<
    AccessibilityEvidenceModule["filterRowsByAccessibilityEvidence"]
  >;
}

test("휠체어 요청은 주차장과 화장실 근거만 있는 장소를 제외한다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const parkingAndToiletOnly = row("parking-toilet-only", {
    parking: "장애인 전용 주차구역 있음",
    restroom: "장애인 화장실 있음"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([parkingAndToiletOnly], ["wheelchair"]), []);
});

test("휠체어 요청은 접근로와 출입구 근거가 있는 장소를 남긴다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const routeAndEntrance = row("route-and-entrance", {
    route: "주출입구까지 단차 없는 접근로 있음",
    exit: "주출입구 단차 없음"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([routeAndEntrance], ["wheelchair"]), [
    routeAndEntrance
  ]);
});

test("계단 없이 접근 가능하다는 긍정 안내를 부정 근거로 오인하지 않는다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const stepFreeRoute = row("step-free-route", {
    route: "계단 없이 주출입구까지 휠체어 접근 가능"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([stepFreeRoute], ["wheelchair"]), [
    stepFreeRoute
  ]);
});

test("홈의 계단 없는 이동 조건은 이동 동선 근거가 있는 장소를 남긴다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const routeAndEntrance = row("route-and-entrance", {
    route: "주출입구까지 단차 없는 접근로 있음"
  });
  const toiletOnly = row("toilet-only", {
    restroom: "장애인 화장실 있음"
  });

  assert.deepEqual(
    filterRowsByAccessibilityEvidence([routeAndEntrance, toiletOnly], ["step_free"]),
    [routeAndEntrance]
  );
});

test("장애인 화장실 조건은 화장실 근거가 있는 장소를 남긴다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const toiletOnly = row("toilet-only", {
    restroom: "장애인 화장실 있음"
  });
  const routeOnly = row("route-only", {
    route: "주출입구까지 단차 없는 접근로 있음"
  });

  assert.deepEqual(
    filterRowsByAccessibilityEvidence([toiletOnly, routeOnly], ["accessible_toilet"]),
    [toiletOnly]
  );
});

test("장애인 주차 조건은 주차 근거가 있는 장소를 남긴다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const parkingOnly = row("parking-only", {
    parking: "장애인 전용 주차구역 있음"
  });
  const toiletOnly = row("toilet-only", {
    restroom: "장애인 화장실 있음"
  });

  assert.deepEqual(
    filterRowsByAccessibilityEvidence([parkingOnly, toiletOnly], ["accessible_parking"]),
    [parkingOnly]
  );
});

test("일반 주차와 장애인 화장실 근거를 장애인 주차 근거로 합치지 않는다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const mixedFacilities = row("mixed-facilities", {
    parking: "일반 주차장 있음",
    restroom: "장애인 화장실 있음"
  });

  assert.deepEqual(
    filterRowsByAccessibilityEvidence([mixedFacilities], ["accessible_parking"]),
    []
  );
});

test("일반 화장실만 있는 장소는 장애인 화장실 조건에서 제외한다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const regularToilet = row("regular-toilet", {
    restroom: "일반 화장실 있음"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([regularToilet], ["accessible_toilet"]), []);
});

test("장애인 전용 주차와 장애인 화장실이 명시된 장소만 각각 통과한다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const accessibleParking = row("accessible-parking", {
    parking: "장애인 전용 주차구역 있음"
  });
  const accessibleToilet = row("accessible-toilet", {
    restroom: "장애인 화장실 있음"
  });

  assert.deepEqual(
    filterRowsByAccessibilityEvidence(
      [accessibleParking, accessibleToilet],
      ["accessible_parking"]
    ),
    [accessibleParking]
  );
  assert.deepEqual(
    filterRowsByAccessibilityEvidence([accessibleParking, accessibleToilet], ["accessible_toilet"]),
    [accessibleToilet]
  );
});

test("대중교통 조건은 대중교통 근거가 있는 장소를 남긴다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const transitOnly = row("transit-only", {
    publictransport: "대전역 정류장에서 저상버스 이용 가능"
  });
  const parkingOnly = row("parking-only", {
    parking: "장애인 전용 주차구역 있음"
  });

  assert.deepEqual(
    filterRowsByAccessibilityEvidence([transitOnly, parkingOnly], ["public_transport"]),
    [transitOnly]
  );
});

test("유모차 요청은 유모차 근거만 있고 단차 없는 동선 근거가 없으면 제외한다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const strollerOnly = row("stroller-only", {
    stroller: "유모차 대여 가능"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([strollerOnly], ["stroller"]), []);
});

test("유모차 요청은 유모차 근거와 단차 없는 동선 근거가 함께 있으면 남긴다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const strollerAndStepFree = row("stroller-and-step-free", {
    stroller: "유모차 대여 가능",
    elevator: "엘리베이터 있음"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([strollerAndStepFree], ["stroller"]), [
    strollerAndStepFree
  ]);
});

test("세부 시설 요청은 이동경로 근거가 없어도 해당 시설 근거로 판단한다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const toiletOnly = row("toilet-only", {
    restroom: "장애인 화장실 있음"
  });
  const parkingOnly = row("parking-only", {
    parking: "장애인 전용 주차구역 있음"
  });
  const transitOnly = row("transit-only", {
    publictransport: "저상버스 정류장과 가까움"
  });

  assert.deepEqual(filterRowsByAccessibilityEvidence([toiletOnly], ["accessible_toilet"]), [
    toiletOnly
  ]);
  assert.deepEqual(filterRowsByAccessibilityEvidence([parkingOnly], ["accessible_parking"]), [
    parkingOnly
  ]);
  assert.deepEqual(filterRowsByAccessibilityEvidence([transitOnly], ["public_transport"]), [
    transitOnly
  ]);
  assert.deepEqual(filterRowsByAccessibilityEvidence([toiletOnly], ["step_free"]), []);
});

test("접근성 조건이 없으면 후보 목록을 그대로 유지한다", async () => {
  const filterRowsByAccessibilityEvidence = await loadAccessibilityEvidenceModule();
  const rows = [
    row("first", { parking: "장애인 전용 주차구역 있음" }),
    row("second", { stroller: "유모차 대여 가능" })
  ];

  assert.deepEqual(filterRowsByAccessibilityEvidence(rows, []), rows);
});

function row(id: string, accessibility: Record<string, string>): AccessibilityEvidenceRow {
  return {
    id,
    title: id,
    metadata: {
      accessibility
    }
  };
}
