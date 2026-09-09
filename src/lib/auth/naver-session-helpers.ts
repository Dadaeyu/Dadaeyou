export function retiredNaverIdMarker(userId: string): string {
  return `withdrawn:${userId.replace(/-/g, "")}`;
}

/** 탈퇴·차단된 Auth 유저는 네이버 재로그인에 재사용하지 않는다. */
export function isUnusableNaverAuthUser(
  user: {
    email?: string | null;
    banned_until?: string | null;
    user_metadata?: Record<string, unknown> | null;
  },
  memberStatus?: string | null
): boolean {
  if (memberStatus === "withdrawn") return true;
  if (user.user_metadata?.withdrawn === true) return true;

  const email = (user.email ?? "").trim().toLowerCase();
  if (email.endsWith("@withdrawn.local")) return true;

  const naverId = user.user_metadata?.naver_id;
  if (typeof naverId === "string" && naverId.startsWith("withdrawn:")) return true;

  if (user.banned_until) {
    const until = Date.parse(user.banned_until);
    if (!Number.isNaN(until) && until > Date.now()) return true;
  }

  return false;
}
