const CONTENT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/u;

export type InternalPlaceMapTarget = {
  contentId?: string | null;
  title: string;
};

export function buildInternalPlaceMapHref(place: InternalPlaceMapTarget) {
  const params = new URLSearchParams();
  const contentId = normalizeContentIds([place.contentId ?? ""], 1)[0];

  if (contentId) params.set("contentId", contentId);
  if (place.title.trim()) params.set("query", place.title.trim());
  params.set("mode", "map");

  return `/map?${params.toString()}`;
}

export function buildRelatedCourseQuery(contentIds: string[], limit = 3) {
  const params = new URLSearchParams({
    limit: String(Math.max(1, Math.min(limit, 10))),
    sort: "rating_desc"
  });
  const normalizedContentIds = normalizeContentIds(contentIds);

  if (normalizedContentIds.length) {
    params.set("contentIds", normalizedContentIds.join(","));
  }

  return `/api/courses/shared?${params.toString()}`;
}

export function normalizeContentIds(values: string[], limit = 20) {
  const normalized = values
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value.length <= 64 && CONTENT_ID_PATTERN.test(value));

  return Array.from(new Set(normalized)).slice(0, Math.max(0, limit));
}

export function isCourseRecommendationRequest(message: string) {
  const normalized = message.replace(/\s+/gu, " ").trim();
  return /(코스|동선|여행\s*일정|하루\s*(?:여행|나들이)|루트)/u.test(normalized);
}

export function getKnowledgeContentId(metadata: Record<string, unknown> | null | undefined) {
  if (!metadata) return null;

  const rawValue = metadata.contentid ?? metadata.contentId;
  if (typeof rawValue !== "string" && typeof rawValue !== "number") return null;

  return normalizeContentIds([String(rawValue)], 1)[0] ?? null;
}
