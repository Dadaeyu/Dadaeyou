export const HOME_IMAGE_REMOTE_HOST = "tong.visitkorea.or.kr";
export const HOME_IMAGE_MAX_BYTES = 8 * 1024 * 1024;
export const HOME_IMAGE_QUALITY = 70;

export function resolveHomeImageDelivery(source: string): {
  src: string;
  unoptimized: boolean;
} {
  if (source.startsWith("/") || source.startsWith("data:") || source.startsWith("blob:")) {
    return {
      src: source,
      unoptimized: source.startsWith("data:") || source.startsWith("blob:")
    };
  }

  try {
    const url = new URL(source);
    if (
      url.protocol === "https:" &&
      url.hostname === HOME_IMAGE_REMOTE_HOST &&
      url.port === "" &&
      url.username === "" &&
      url.password === ""
    ) {
      return { src: source, unoptimized: false };
    }
  } catch {
    // The existing proxy policy owns malformed and unsupported source failures.
  }

  return {
    src: `/api/home/image?src=${encodeURIComponent(source)}`,
    unoptimized: false
  };
}
