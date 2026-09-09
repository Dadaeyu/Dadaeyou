type AccessibilityEvidenceRow = {
  metadata?: {
    accessibility?: Record<string, unknown>;
  } | null;
};

const MOBILITY_NEEDS = new Set([
  "wheelchair",
  "mobility_access",
  "step_free",
  "elderly",
  "short_distance"
]);

export function filterRowsByAccessibilityEvidence<T extends AccessibilityEvidenceRow>(
  rows: readonly T[],
  needs: readonly string[]
) {
  const effectiveNeeds = needs.filter((need) => need !== "easy_explanation");
  if (!effectiveNeeds.length) return [...rows];

  return rows.filter((row) => effectiveNeeds.every((need) => rowSupportsNeed(row, need)));
}

function rowSupportsNeed(row: AccessibilityEvidenceRow, need: string) {
  const entries = getAccessibilityEntries(row);

  if (MOBILITY_NEEDS.has(need)) {
    return hasMobilityRouteEvidence(entries);
  }

  if (need === "stroller") {
    return hasPositive(entries, ["stroller", "유모차"]) && hasMobilityRouteEvidence(entries);
  }

  if (need === "accessible_toilet") {
    return hasPositiveEntryMatchingAll(entries, [
      ["restroom", "toilet", "화장실"],
      ["장애인", "교통약자", "휠체어", "무장애", "접근 가능", "accessible"]
    ]);
  }

  if (need === "accessible_parking") {
    return hasPositiveEntryMatchingAll(entries, [
      ["parking", "주차"],
      ["장애인", "전용", "교통약자", "휠체어", "무장애", "accessible"]
    ]);
  }

  if (need === "public_transport") {
    return hasPositive(entries, [
      "publictransport",
      "public_transport",
      "bus",
      "station",
      "대중교통",
      "버스",
      "정류장",
      "저상버스"
    ]);
  }

  if (need === "visual_impairment") {
    return hasPositive(entries, [
      "braille",
      "tactile",
      "audio",
      "guide",
      "점자",
      "촉지",
      "음성",
      "보조견",
      "안내요원",
      "유도"
    ]);
  }

  if (need === "hearing_impairment") {
    return hasPositive(entries, ["sign", "caption", "hearing", "수어", "자막", "청각"]);
  }

  return true;
}

function getAccessibilityEntries(row: AccessibilityEvidenceRow) {
  const accessibility = row.metadata?.accessibility;
  if (!accessibility || typeof accessibility !== "object") return [];

  return Object.entries(accessibility)
    .map(([key, value]) => `${key} ${typeof value === "string" ? value : ""}`.trim())
    .filter(Boolean);
}

function hasMobilityRouteEvidence(entries: string[]) {
  return hasPositive(entries, [
    "route",
    "exit",
    "entrance",
    "elevator",
    "wheelchair",
    "접근로",
    "출입",
    "입구",
    "엘리베이터",
    "휠체어",
    "단차 없음",
    "턱 없음",
    "무단차"
  ]);
}

function hasPositive(entries: string[], patterns: string[]) {
  return entries.some((entry) => {
    const normalized = entry.toLocaleLowerCase("ko-KR");
    if (isNegativeAccessibilityText(normalized)) return false;
    return patterns.some((pattern) => normalized.includes(pattern.toLocaleLowerCase("ko-KR")));
  });
}

function hasPositiveEntryMatchingAll(entries: string[], patternGroups: string[][]) {
  return entries.some((entry) => {
    const normalized = entry.toLocaleLowerCase("ko-KR");
    if (isNegativeAccessibilityText(normalized)) return false;

    return patternGroups.every((patterns) =>
      patterns.some((pattern) => normalized.includes(pattern.toLocaleLowerCase("ko-KR")))
    );
  });
}

function isNegativeAccessibilityText(value: string) {
  const withoutPositiveStepFreePhrases = value
    .replace(/계단\s*없이/gu, "")
    .replace(/(?:계단|턱|단차)(?:이나|와|과|,)?\s*(?:이\s*)?없(?:음|이|어요|습니다|다)?/gu, "");

  return /없음|불가|미설치|없다|어려움|곤란|협소|계단|급경사|문의|확인\s*필요/u.test(
    withoutPositiveStepFreePhrases
  );
}
