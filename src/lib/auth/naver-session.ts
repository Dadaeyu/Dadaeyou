import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { isNaverOAuthUser } from "@/lib/auth/auth-kind";
import { normalizeEmail } from "@/lib/auth/email";
import { findAuthUserByEmail, findAuthUserByNaverId } from "@/lib/auth/email-availability";
import { naverAuthEmail } from "@/lib/auth/naver-oauth";
import { isUnusableNaverAuthUser, retiredNaverIdMarker } from "@/lib/auth/naver-session-helpers";
import { unlinkAuthIdentities } from "@/lib/auth/unlink-identities";
import { T } from "@/lib/supabase/tables";

type NaverSessionMetadata = {
  nickname?: string;
  name?: string;
  avatar_url?: string;
  naver_id?: string;
  profileEmail?: string;
};

/** 탈퇴 계정의 naver_id·이메일을 풀어 같은 네이버 계정으로 바로 신규 가입할 수 있게 한다. */
export async function retireWithdrawnNaverUser(user: User): Promise<void> {
  const admin = createAdminClient();
  await unlinkAuthIdentities(user.id).catch(() => null);
  await admin.auth.admin
    .updateUserById(user.id, {
      email: `deleted_${user.id.replace(/-/g, "")}@withdrawn.local`,
      ban_duration: "876000h",
      user_metadata: {
        ...user.user_metadata,
        naver_id: retiredNaverIdMarker(user.id),
        withdrawn: true
      }
    })
    .catch(() => null);
}

async function findExistingNaverUser(authEmail: string, naverId: string, profileEmail: string) {
  const byEmail = await findAuthUserByEmail(authEmail).catch(() => null);
  if (byEmail) return byEmail;

  const byNaverId = naverId ? await findAuthUserByNaverId(naverId).catch(() => null) : null;
  if (byNaverId) return byNaverId;

  if (profileEmail && profileEmail !== authEmail) {
    const byProfile = await findAuthUserByEmail(profileEmail).catch(() => null);
    // 같은 이메일의 카카오·구글·이메일 계정은 네이버 세션으로 쓰지 않는다.
    if (byProfile && isNaverOAuthUser(byProfile)) return byProfile;
  }

  return null;
}

export async function establishSessionForEmail(
  email: string,
  metadata?: NaverSessionMetadata,
  attempt = 0
): Promise<User> {
  const admin = createAdminClient();
  const naverId = metadata?.naver_id?.trim() || "";
  const authEmail = naverId ? naverAuthEmail(naverId) : email;
  const profileEmail = metadata?.profileEmail ? normalizeEmail(metadata.profileEmail) : "";

  const retiredIds = new Set<string>();
  let existing: User | null = null;

  for (let i = 0; i < 8; i += 1) {
    const found = await findExistingNaverUser(authEmail, naverId, profileEmail);
    if (!found || retiredIds.has(found.id)) {
      existing = null;
      break;
    }

    const { data: member } = await admin
      .from(T.members)
      .select("status")
      .eq("id", found.id)
      .maybeSingle();

    if (isUnusableNaverAuthUser(found, member?.status)) {
      retiredIds.add(found.id);
      await retireWithdrawnNaverUser(found);
      existing = null;
      continue;
    }

    existing = found;
    break;
  }

  if (existing && normalizeEmail(existing.email ?? "") !== authEmail) {
    await admin.auth.admin
      .updateUserById(existing.id, {
        email: authEmail,
        email_confirm: true
      })
      .catch(() => null);
  }

  if (!existing) {
    const { error: createError } = await admin.auth.admin.createUser({
      email: authEmail,
      email_confirm: true,
      user_metadata: {
        nickname: metadata?.nickname,
        name: metadata?.name,
        avatar_url: metadata?.avatar_url,
        naver_id: metadata?.naver_id,
        ...(profileEmail ? { profile_email: profileEmail } : {})
      },
      app_metadata: {
        provider: "naver",
        providers: ["naver"]
      }
    });
    if (createError && !/already|registered|exists/i.test(createError.message)) {
      throw new Error(createError.message);
    }
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: authEmail
  });

  if (linkError || !link?.properties?.hashed_token) {
    throw new Error(linkError?.message ?? "session_link_failed");
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email"
  });

  if (error || !data.user) {
    throw new Error(error?.message ?? "session_verify_failed");
  }

  const { data: sessionMember } = await admin
    .from(T.members)
    .select("status")
    .eq("id", data.user.id)
    .maybeSingle();

  if (isUnusableNaverAuthUser(data.user, sessionMember?.status)) {
    await retireWithdrawnNaverUser(data.user);
    await supabase.auth.signOut().catch(() => null);
    if (attempt >= 1) {
      throw new Error("withdrawn_naver_session_retired");
    }
    return establishSessionForEmail(email, metadata, attempt + 1);
  }

  // 매직링크 세션은 identities/provider가 email로 덮일 수 있어 네이버 표시를 다시 고정한다.
  await admin.auth.admin
    .updateUserById(data.user.id, {
      app_metadata: {
        provider: "naver",
        providers: ["naver"]
      },
      user_metadata: {
        ...data.user.user_metadata,
        nickname: metadata?.nickname ?? data.user.user_metadata?.nickname,
        name: metadata?.name ?? data.user.user_metadata?.name,
        avatar_url: metadata?.avatar_url ?? data.user.user_metadata?.avatar_url,
        naver_id: metadata?.naver_id ?? data.user.user_metadata?.naver_id,
        ...(profileEmail ? { profile_email: profileEmail } : {})
      }
    })
    .catch(() => null);

  return {
    ...data.user,
    app_metadata: {
      ...data.user.app_metadata,
      provider: "naver",
      providers: ["naver"]
    },
    user_metadata: {
      ...data.user.user_metadata,
      nickname: metadata?.nickname ?? data.user.user_metadata?.nickname,
      name: metadata?.name ?? data.user.user_metadata?.name,
      avatar_url: metadata?.avatar_url ?? data.user.user_metadata?.avatar_url,
      naver_id: metadata?.naver_id ?? data.user.user_metadata?.naver_id,
      ...(profileEmail ? { profile_email: profileEmail } : {})
    }
  };
}

export function naverIsolationEmails(user: User): string[] {
  const naverId =
    typeof user.user_metadata?.naver_id === "string" ? user.user_metadata.naver_id.trim() : "";
  const compactId = user.id.replace(/-/g, "");
  const emails = [
    naverId ? naverAuthEmail(naverId) : "",
    naverId ? `naver_${naverId}@oauth.dadaeyu.local` : "",
    `naver_${compactId}@oauth.dadaeyu.local`
  ];
  return [...new Set(emails.filter(Boolean).map((email) => normalizeEmail(email)))];
}

/** 카카오·구글과 이메일이 겹치지 않도록 네이버 Auth 이메일을 전용 주소로 옮긴다. */
export async function isolateNaverAuthEmail(user: User): Promise<boolean> {
  const current = normalizeEmail(user.email ?? "");
  const candidates = naverIsolationEmails(user);
  if (candidates.includes(current)) return false;

  const admin = createAdminClient();
  const naverId =
    typeof user.user_metadata?.naver_id === "string" ? user.user_metadata.naver_id.trim() : "";
  const password = `Wd_${crypto.randomUUID()}!aA1`;

  for (const email of candidates) {
    const { error } = await admin.auth.admin.updateUserById(user.id, {
      email,
      password,
      email_confirm: true,
      user_metadata: {
        ...user.user_metadata,
        ...(naverId ? { naver_id: naverId } : {}),
        ...(user.email ? { profile_email: user.email } : {})
      }
    });
    if (!error) return true;
  }

  return false;
}
