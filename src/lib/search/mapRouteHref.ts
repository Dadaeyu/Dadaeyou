const COURSE_RETURN_PATH = /^\/course\/[a-zA-Z0-9_-]+$/u;

export function parseCourseReturnPath(value: string | null | undefined): string | null {
  const path = value?.trim() ?? "";
  return COURSE_RETURN_PATH.test(path) ? path : null;
}

export function buildPlaceRouteMapHref(place: { contentId: string; name: string; from?: string }) {
  const params = new URLSearchParams();
  const contentId = place.contentId.trim();
  const name = place.name.trim();
  const from = parseCourseReturnPath(place.from);

  if (contentId) params.set("contentId", contentId);
  if (name) params.set("query", name);
  params.set("route", "1");
  if (from) params.set("from", from);

  return `/map?${params.toString()}`;
}
