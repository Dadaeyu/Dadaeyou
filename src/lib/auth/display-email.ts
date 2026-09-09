type EmailUser = {
  email?: string | null;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: Record<string, unknown> | null;
} | null;

const PUBLIC_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isInternalAuthEmail(email: string): boolean {
  const value = email.trim().toLowerCase();
  if (!value) return false;
  if (value.endsWith("@oauth.dadaeyu.invalid") || value.endsWith("@oauth.dadaeyu.local")) {
    return true;
  }
  if (value.endsWith("@withdrawn.local")) return true;
  if (value.startsWith("naver_") && !value.includes("@")) return true;
  return false;
}

function publicEmail(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  if (!trimmed || isInternalAuthEmail(trimmed)) return "";
  if (!PUBLIC_EMAIL_RE.test(trimmed)) return "";
  return trimmed;
}

function isNaverUser(user: EmailUser): boolean {
  if (!user) return false;
  const naverId = user.user_metadata?.naver_id;
  if (typeof naverId === "string" && naverId.trim() && !naverId.startsWith("withdrawn:")) {
    return true;
  }
  if (isInternalAuthEmail(user.email ?? "")) return true;
  return user.app_metadata?.provider === "naver";
}

/** 마이페이지 등에 보여줄 이메일. Auth 전용 네이버 주소는 노출하지 않는다. */
export function displayEmailFromAuthUser(user: EmailUser): string {
  if (!user) return "";

  const profileEmail = publicEmail(user.user_metadata?.profile_email);
  if (profileEmail) return profileEmail;

  const authEmail = publicEmail(user.email);
  if (authEmail) return authEmail;

  if (isNaverUser(user)) return "네이버 로그인";

  const provider = user.app_metadata?.provider;
  if (provider === "kakao") return "카카오 로그인";
  if (provider === "google") return "구글 로그인";

  return (user.email ?? "").trim();
}
