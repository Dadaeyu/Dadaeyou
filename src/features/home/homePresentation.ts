export function buildHomePlaceMapHref(place: { id: string; title: string }) {
  const params = new URLSearchParams();
  const contentId = place.id.trim();
  const query = place.title.trim();

  if (contentId) params.set("contentId", contentId);
  if (query) params.set("query", query);

  return `/map?${params.toString()}`;
}

export function shouldShowHomePlaceImage(source: string | null, failedSource: string | null) {
  return Boolean(source && source !== failedSource);
}

export function buildHomeFallbackCopy({ compact = false }: { compact?: boolean } = {}) {
  if (compact) {
    return {
      title: "사진 준비 중",
      description: null
    };
  }

  return {
    title: "등록된 장소 사진이 없어요",
    description: "주소와 방문 정보는 아래에서 확인할 수 있어요"
  };
}

export function splitHomeRecommendationPlaces<T>(places: readonly T[], limit = 4) {
  const visiblePlaces = places.slice(0, Math.max(limit, 0));
  return {
    featured: visiblePlaces[0] ?? null,
    supporting: visiblePlaces.slice(1)
  };
}

export function normalizeHomeImageSource(source: string | null | undefined): string | null {
  const trimmed = source?.trim();
  if (!trimmed) return null;
  const normalizedSource = trimmed.startsWith("//") ? `https:${trimmed}` : trimmed;
  if (normalizedSource.startsWith("/")) return normalizedSource;

  try {
    const url = new URL(normalizedSource);
    if (url.protocol === "http:" && url.hostname === "tong.visitkorea.or.kr") {
      url.protocol = "https:";
    }
    return url.toString();
  } catch {
    return normalizedSource;
  }
}

const HTML_ENTITY_REPLACEMENTS: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'"
};

export function cleanHomePresentationText(
  value: string | null | undefined,
  options: { label?: string; maxLength?: number } = {}
) {
  if (!value) return "";

  const label = options.label?.trim();
  const normalized = value
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot);|&#39;/gi, (entity) => {
      const replacement = HTML_ENTITY_REPLACEMENTS[entity.toLowerCase()];
      return replacement ?? " ";
    })
    .replace(
      /_\s*(?:(?:무장애|장애인|시각장애인|청각장애인|영유아(?:가족)?)\s*)?편의(?:시설|정보)\s*/giu,
      ""
    )
    .replace(/_/g, " · ")
    .replace(/(\d{1,2}:\d{2})\s*-\s*(?=\d{1,2}월)/gu, "$1\n")
    .replace(/\s*※\s*/gu, "\n")
    .replace(/\s*\[([^\]]+)\]\s*/gu, "\n$1\n")
    .replace(/\s+-\s+(?=[가-힣(\d])/gu, "\n");

  const parts = normalized
    .split(/\n+/u)
    .flatMap((part) => part.split(/\s*[•●○]\s*/u))
    .map((part) =>
      part
        .replace(/^\s*(?:[-*·ㆍ]|※)+\s*/u, "")
        .replace(/\s*(?:[-*·ㆍ]|※)+\s*$/u, "")
        .replace(/\s*:\s*/gu, ": ")
        .replace(/(\d):\s+(\d)/gu, "$1:$2")
        .replace(/\s*\/\s*/gu, " / ")
        .replace(/\s*·\s*/gu, "·")
        .replace(/이용시/gu, "이용 시")
        .replace(/운영중/gu, "운영 중")
        .replace(/제\s+(\d+)장/gu, "제$1장")
        .replace(/\s+/gu, " ")
        .trim()
    )
    .filter(Boolean)
    .map((part) => {
      if (!label) return part;
      return part.replace(new RegExp(`^${escapeRegExp(label)}\\s*[:：-]?\\s*`, "u"), "").trim();
    })
    .filter(Boolean);

  const deduped = [...new Set(parts)];
  const text = deduped.join(" · ").trim();
  const maxLength = options.maxLength ?? 140;

  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

export function summarizeHomeEvidence(value: string) {
  return cleanHomePresentationText(value, { maxLength: 68 });
}

export function formatHomeDetailValue(
  value: string | null | undefined,
  label?: string,
  maxLength = 220
) {
  const text = cleanHomePresentationText(value, { label, maxLength });
  return label === "운영시간" ? removeContradictoryAdmissionDeadline(text) : text;
}

export function shouldShowHomeParkingDetail(value: string | null | undefined) {
  const detail = formatHomeDetailValue(value, "주차");
  if (!detail) return false;
  return !/^(?:(?:일반\s*)?주차(?:장)?\s*)?(?:이용\s*)?(?:가능|있음)$/u.test(detail);
}

export function summarizeHomeFee(value: string | null | undefined) {
  const full = formatHomeDetailValue(value, "이용요금", 1_000);
  const parts = full.split(" · ").filter(Boolean);
  const pricePartCount = parts.filter((part) =>
    /(?:무료|\d[\d,]*(?:원|천원|만원))/u.test(part)
  ).length;
  if (full.length <= 150 && pricePartCount <= 2) return full;

  const summary: string[] = [];
  for (const part of parts) {
    if (!summary.length && /^(?:개인|일반)$/u.test(part)) {
      summary.push(part);
      continue;
    }
    if (/(?:무료|\d[\d,]*(?:원|천원|만원))/u.test(part)) {
      summary.push(summarizeFeePart(part));
    }
    if (summary.filter((part) => /(?:무료|\d[\d,]*(?:원|천원|만원))/u.test(part)).length >= 2) {
      break;
    }
  }

  if (!summary.length) return cleanHomePresentationText(full, { maxLength: 150 });
  return `${summary.join(" · ")} 외`;
}

function summarizeFeePart(value: string) {
  const amounts = [...value.matchAll(/\d[\d,]*(?:원|천원|만원)/gu)];
  const amount = amounts.at(-1);
  if (!amount || amount.index === undefined) return value;

  const rawLabel = value
    .slice(0, amount.index)
    .replace(/\([^)]*\)/gu, "")
    .trim();
  const labelParts = rawLabel.split(/\s*\/\s*/u).filter(Boolean);
  const label = labelParts.length > 1 ? `${labelParts[0]} 등` : rawLabel;
  return `${label} ${amount[0]}`.trim();
}

export function formatHomeEventPeriod(
  startDate: string | null | undefined,
  endDate: string | null | undefined
) {
  const start = formatCompactDate(startDate);
  const end = formatCompactDate(endDate);
  if (start && end) return start === end ? start : `${start} ~ ${end}`;
  if (start) return `${start}부터`;
  if (end) return `${end}까지`;
  return null;
}

function formatCompactDate(value: string | null | undefined) {
  const digits = value?.replace(/\D/g, "").slice(0, 8);
  if (!digits || digits.length !== 8) return null;
  const year = Number(digits.slice(0, 4));
  const month = Number(digits.slice(4, 6));
  const day = Number(digits.slice(6, 8));
  if (!year || month < 1 || month > 12 || day < 1 || day > 31) return null;
  return `${year}. ${month}. ${day}.`;
}

function removeContradictoryAdmissionDeadline(value: string) {
  const ranges = [...value.matchAll(/(\d{1,2}):(\d{2})\s*[~～]\s*(\d{1,2}):(\d{2})/gu)];
  const deadline = value.match(/입장\s*마감\s*(\d{1,2}):(\d{2})(?:\s*까지)?/u);
  if (!ranges.length || !deadline) return value;

  const sameDayClosingTimes = ranges.flatMap((match) => {
    const start = toMinutes(match[1], match[2]);
    const end = toMinutes(match[3], match[4]);
    return start !== null && end !== null && end >= start ? [end] : [];
  });
  const deadlineMinutes = toMinutes(deadline[1], deadline[2]);
  if (!sameDayClosingTimes.length || deadlineMinutes === null) return value;
  if (deadlineMinutes <= Math.max(...sameDayClosingTimes)) return value;

  return value
    .replace(/\s*[([]?\s*입장\s*마감\s*\d{1,2}:\d{2}(?:\s*까지)?\s*[)\]]?/u, "")
    .replace(/\s+/gu, " ")
    .trim();
}

function toMinutes(hourValue: string, minuteValue: string) {
  const hour = Number(hourValue);
  const minute = Number(minuteValue);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
