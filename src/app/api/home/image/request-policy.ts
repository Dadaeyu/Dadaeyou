import {
  HOME_IMAGE_MAX_BYTES,
  HOME_IMAGE_REMOTE_HOST
} from "../../../../features/home/homeImage.ts";

export const ALLOWED_IMAGE_HOSTS = new Set([HOME_IMAGE_REMOTE_HOST]);
export const ALLOWED_IMAGE_CONTENT_TYPES = new Set([
  "image/avif",
  "image/bmp",
  "image/gif",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp"
]);
export const MAX_IMAGE_BYTES = HOME_IMAGE_MAX_BYTES;

export type HomeImagePolicyFailure = {
  message: string;
  status: number;
};

export function validateHomeImageSource(
  source: string | null
): { ok: true; url: URL } | ({ ok: false } & HomeImagePolicyFailure) {
  if (!source) {
    return { ok: false, message: "이미지 주소가 없습니다.", status: 400 };
  }

  let imageUrl: URL;
  try {
    imageUrl = new URL(source);
  } catch {
    return { ok: false, message: "올바르지 않은 이미지 주소입니다.", status: 400 };
  }

  if (imageUrl.protocol !== "https:" || !ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname)) {
    return { ok: false, message: "허용되지 않은 이미지 주소입니다.", status: 403 };
  }

  return { ok: true, url: imageUrl };
}

export function validateHomeImageFinalUrl(
  originalUrl: URL,
  finalUrl: string
): HomeImagePolicyFailure | null {
  if (!finalUrl) return null;

  let imageUrl: URL;
  try {
    imageUrl = new URL(finalUrl);
  } catch {
    return { message: "이미지를 불러올 수 없습니다.", status: 502 };
  }

  if (imageUrl.href === originalUrl.href) return null;
  if (imageUrl.protocol === "https:" && ALLOWED_IMAGE_HOSTS.has(imageUrl.hostname)) return null;

  return { message: "허용되지 않은 이미지 주소입니다.", status: 403 };
}

export function validateHomeImageResponse({
  contentLength,
  contentType,
  hasBody,
  ok
}: {
  contentLength: number;
  contentType: string;
  hasBody: boolean;
  ok: boolean;
}): HomeImagePolicyFailure | null {
  if (
    !ok ||
    !ALLOWED_IMAGE_CONTENT_TYPES.has(normalizeContentType(contentType)) ||
    (contentLength > 0 && contentLength > MAX_IMAGE_BYTES) ||
    !hasBody
  ) {
    return { message: "이미지를 불러올 수 없습니다.", status: 502 };
  }

  return null;
}

export async function readHomeImageBody(
  body: ReadableStream<Uint8Array>,
  maxBytes = MAX_IMAGE_BYTES
): Promise<{ ok: true; bytes: ArrayBuffer } | ({ ok: false } & HomeImagePolicyFailure)> {
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel().catch(() => undefined);
        return { ok: false, message: "이미지 크기가 너무 큽니다.", status: 413 };
      }

      chunks.push(value);
    }

    const buffer = new ArrayBuffer(totalBytes);
    const bytes = new Uint8Array(buffer);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }

    return { ok: true, bytes: buffer };
  } finally {
    reader.releaseLock();
  }
}

function normalizeContentType(contentType: string) {
  return contentType.split(";", 1)[0].trim().toLocaleLowerCase();
}
