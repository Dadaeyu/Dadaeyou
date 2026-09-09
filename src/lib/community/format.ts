export function formatCommunityDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

export function formatCommunityDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd} ${hh}:${min}`;
}

// 화면 읽어주기(TTS)용. "13:12"처럼 콜론/마침표로 된 표기는 브라우저 음성엔진이
// 비율("13대12")이나 소수점으로 잘못 읽는 경우가 있어, "시/분" 단위를 풀어서 읽힌다.
export function formatCommunityDateTimeForSpeech(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = d.getMonth() + 1;
  const dd = d.getDate();
  const hh = d.getHours();
  const min = d.getMinutes();
  return `${yyyy}년 ${mm}월 ${dd}일 ${hh}시 ${min}분`;
}

export function renderMultilineText(content: string) {
  return content.split(/\r?\n/).filter((line, i, arr) => line.length > 0 || i < arr.length - 1);
}

export function looksLikeHtml(content: string): boolean {
  return /<[a-z][\s\S]*>/i.test(content);
}

// isEmptyRichText 등 다른 export는 DOMPurify가 필요 없다. isomorphic-dompurify는
// 로드만 해도 서버에서 jsdom을 물고 들어와 무거우니(+환경에 따라 깨지기도 함),
// 실제로 HTML을 sanitize할 때만 지연 로드한다.
export function sanitizeCommunityHtml(html: string): string {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require("isomorphic-dompurify") as typeof import("isomorphic-dompurify");
  return DOMPurify.sanitize(html, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ["target", "rel", "class", "width", "height", "style", "data-width"]
  });
}

export function isEmptyRichText(html: string): boolean {
  // 이미지만 있는 본문도 유효한 리치 콘텐츠로 본다
  if (/<(img|video|iframe)\b/i.test(html)) return false;
  const text = html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return text.length === 0;
}
