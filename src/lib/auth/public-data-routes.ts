// These handlers return public data without reading or refreshing a user session.
// Keep this exact allowlist in sync with their cache and authorization contracts.
const PUBLIC_DATA_PATHS = new Set([
  "/api/home/courses",
  "/api/home/image",
  "/api/tourism/top-rated-places",
  "/api/codes/filter-options",
  "/api/weather"
]);

export function isPublicDataRequest(method: string, pathname: string): boolean {
  return method === "GET" && PUBLIC_DATA_PATHS.has(pathname);
}
