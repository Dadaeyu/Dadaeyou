const HTML_ENTITIES: Record<string, string> = {
  amp: "&",
  apos: "'",
  gt: ">",
  lt: "<",
  nbsp: " ",
  quot: '"'
};

export function formatChatDisplayText(value: string) {
  return decodeHtmlEntities(value)
    .replace(/\r\n?/g, "\n")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/<\/(?:article|div|h[1-6]|li|ol|p|section|ul)\s*>/giu, "\n")
    .replace(/<[^>]+>/gu, "")
    .replace(/[\t ]+\n/gu, "\n")
    .replace(/\n[\t ]+/gu, "\n")
    .replace(/[\t ]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function formatChatAccessibilityText(value: string) {
  return formatChatDisplayText(value)
    .replace(/_(?:무장애|시각장애인|청각장애인|지체장애인)?\s*편의시설/gu, "")
    .replace(/동반가능/gu, "동반 가능")
    .replace(/대여가능/gu, "대여 가능")
    .replace(/문화시설 부지 넓음/gu, "문화시설 부지가 넓어요")
    .replace(/이동경로 폭 넓음/gu, "이동 경로가 넓어요")
    .replace(
      /문화시설 특성상 휠체어, 전동 스쿠터 사용자 이용 쉬움/gu,
      "휠체어와 전동 스쿠터 이용자가 이동하기 쉬워요"
    )
    .replace(/내부 턱 없음/gu, "내부에 턱이 없어요")
    .replace(/대중교통 이용 가능\s*:\s*/gu, "대중교통: ")
    .replace(/저상버스 운행\s*:\s*/gu, "저상버스: ")
    .replace(/장애인 전용 주차구역 주차 대수\s*:\s*/gu, "장애인 전용 주차구역: ")
    .replace(/여유공간 있음/gu, "여유 공간이 있어요")
    .replace(/문화시설까지의 거리\s*:\s*/gu, "문화시설까지 ")
    .replace(/_/gu, " ")
    .replace(/[\t ]{2,}/gu, " ")
    .trim();
}

export function getPublicChatSourceLabel(source: string | null | undefined) {
  if (!source?.trim()) return null;

  const normalized = source.toLocaleLowerCase("ko-KR");
  if (
    normalized.includes("tourapi") ||
    normalized.includes("korwithservice") ||
    normalized.includes("한국관광공사")
  ) {
    return "한국관광공사 관광·무장애 여행정보";
  }

  if (
    normalized.includes("daejeon") ||
    normalized.includes("public_toilet") ||
    normalized.includes("accessible_parking") ||
    normalized.includes("culture_tour") ||
    normalized.includes("대전시") ||
    normalized.includes("대전광역시")
  ) {
    return "대전시 공공데이터";
  }

  return null;
}

export function uniqueChatSuggestions(values: string[], limit = 4) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean))).slice(0, limit);
}

export function shouldReturnChatPlaceCards({
  intent,
  isFollowUp,
  hasPlaces
}: {
  intent: "recommend_place" | "check_accessibility" | "ask_info";
  isFollowUp: boolean;
  hasPlaces: boolean;
}) {
  if (!hasPlaces) return false;
  if (intent === "recommend_place") return true;
  return !isFollowUp;
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x[\da-f]+|#\d+|amp|apos|gt|lt|nbsp|quot);/giu, (_, entity: string) => {
    const normalized = entity.toLocaleLowerCase("en-US");
    if (normalized.startsWith("#x")) {
      return decodeCodePoint(Number.parseInt(normalized.slice(2), 16));
    }
    if (normalized.startsWith("#")) {
      return decodeCodePoint(Number.parseInt(normalized.slice(1), 10));
    }
    return HTML_ENTITIES[normalized] ?? "";
  });
}

function decodeCodePoint(value: number) {
  if (!Number.isInteger(value) || value < 0 || value > 0x10ffff) return "";

  try {
    return String.fromCodePoint(value);
  } catch {
    return "";
  }
}
