/** Auth 전용 주소·탈퇴 마커처럼 사람이 고른 닉네임이 아닌 값. */
const GENERATED_NICKNAME_RE = /^(user_[0-9a-f]{8}|deleted_[0-9a-f]+|naver_[A-Za-z0-9_-]{16,})$/i;

export function isGeneratedNickname(nickname: string): boolean {
  const value = nickname.trim();
  if (!value) return true;
  if (GENERATED_NICKNAME_RE.test(value)) return true;
  if (value.toLowerCase().includes("@oauth.dadaeyu.")) return true;
  return false;
}

export function suggestedNicknameFromAuthUser(user: {
  email?: string | null;
  user_metadata?: Record<string, unknown> | null;
}): string {
  const meta = user.user_metadata ?? {};
  for (const candidate of [meta.nickname, meta.name, meta.full_name]) {
    if (typeof candidate !== "string") continue;
    const trimmed = candidate.trim();
    if (trimmed && !isGeneratedNickname(trimmed)) return trimmed;
  }
  return "";
}
