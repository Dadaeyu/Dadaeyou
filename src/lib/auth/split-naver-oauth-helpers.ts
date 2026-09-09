import type { User } from "@supabase/supabase-js";
import { normalizeEmail } from "./email.ts";

export type LinkedOAuthProvider = "kakao" | "google";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function stringMeta(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function inferLinkedOAuthProvider(
  user: Pick<User, "identities">,
  hinted?: string | null
): LinkedOAuthProvider {
  if (hinted === "google" || hinted === "kakao") return hinted;
  const social = (user.identities ?? []).filter(
    (identity) => identity.provider === "kakao" || identity.provider === "google"
  );
  social.sort((a, b) => (b.last_sign_in_at ?? "").localeCompare(a.last_sign_in_at ?? ""));
  return social[0]?.provider === "google" ? "google" : "kakao";
}

/** 카카오 이메일이 @naver.com 이어도 그건 카카오 계정 이메일일 뿐이다. */
export function oauthEmailFromUser(
  user: Pick<User, "email" | "identities">,
  provider: LinkedOAuthProvider
): string | null {
  const identity = user.identities?.find((item) => item.provider === provider);
  const fromIdentity = stringMeta(identity?.identity_data?.email);
  const email = normalizeEmail(fromIdentity || user.email || "");
  return email.length > 3 && EMAIL_RE.test(email) ? email : null;
}

export function oauthProfileFromUser(
  user: Pick<User, "user_metadata" | "identities">,
  provider: LinkedOAuthProvider
) {
  const identity = user.identities?.find((item) => item.provider === provider);
  const data = identity?.identity_data ?? {};
  const nickname =
    stringMeta(data.nickname) ||
    stringMeta(data.name) ||
    stringMeta(data.full_name) ||
    stringMeta(user.user_metadata?.nickname) ||
    stringMeta(user.user_metadata?.name);
  const avatar =
    stringMeta(data.picture) ||
    stringMeta(data.avatar_url) ||
    stringMeta(user.user_metadata?.avatar_url) ||
    stringMeta(user.user_metadata?.picture);
  return { nickname, avatar };
}
