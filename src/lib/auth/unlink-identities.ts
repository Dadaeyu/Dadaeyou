import type { User, UserIdentity } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAdminSupabaseConfig } from "@/lib/supabase/config";
import { T } from "@/lib/supabase/tables";
import {
  identityUuidCandidates,
  socialIdentitiesOf,
  socialIdentityUuid,
  withdrawnPlaceholderEmail
} from "@/lib/auth/unlink-identities-helpers";

export {
  identityUuidCandidates,
  isSocialAuthIdentity,
  socialIdentitiesOf,
  socialIdentityUuid,
  withdrawnPlaceholderEmail,
  type IdentityLike
} from "@/lib/auth/unlink-identities-helpers";

function authApiBase(url: string) {
  return url.replace(/\/$/, "").replace(/\/rest\/v1$/i, "");
}

async function deleteIdentity(userId: string, identityId: string) {
  const config = getAdminSupabaseConfig();
  if (!config.isConfigured) {
    return { ok: false as const, status: 500, body: "admin_config_missing" };
  }

  const response = await fetch(
    `${authApiBase(config.url)}/auth/v1/admin/users/${userId}/identities/${identityId}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${config.key}`,
        apikey: config.key
      }
    }
  );

  if (response.ok) {
    return { ok: true as const, status: response.status, body: "" };
  }

  return {
    ok: false as const,
    status: response.status,
    body: await response.text().catch(() => "")
  };
}

async function loadUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    return { user: null as User | null, error: error?.message ?? "user_not_found" };
  }
  return { user: data.user, error: null };
}

/** 마지막 소셜 identity 삭제가 거절되지 않도록 이메일 identity를 먼저 붙인다. */
async function ensurePlaceholderEmailIdentity(
  admin: ReturnType<typeof createAdminClient>,
  user: User
) {
  const email = withdrawnPlaceholderEmail(user.id);
  const password = `Wd_${crypto.randomUUID()}!aA1`;
  const { error } = await admin.auth.admin.updateUserById(user.id, {
    email,
    password,
    email_confirm: true,
    ban_duration: "none"
  });
  return error?.message ?? null;
}

async function rebanWithdrawnUser(admin: ReturnType<typeof createAdminClient>, userId: string) {
  await admin.auth.admin.updateUserById(userId, { ban_duration: "876000h" }).catch(() => null);
}

/**
 * 탈퇴 계정의 카카오·구글 등 소셜 identity를 풀어 같은 소셜로 신규 가입할 수 있게 한다.
 * 이메일·전화번호 identity는 남긴다(마지막 identity 삭제 제한).
 */
export async function unlinkAuthIdentities(
  userId: string
): Promise<{ error: string | null; unlinked: number }> {
  const admin = createAdminClient();
  const loaded = await loadUser(admin, userId);
  if (!loaded.user) {
    return { error: loaded.error, unlinked: 0 };
  }

  const initialSocial = socialIdentitiesOf(loaded.user);
  if (initialSocial.length === 0) {
    return { error: null, unlinked: 0 };
  }

  let shouldReban = true;
  try {
    await ensurePlaceholderEmailIdentity(admin, loaded.user);

    const afterEnsure = await loadUser(admin, userId);
    const social = afterEnsure.user ? socialIdentitiesOf(afterEnsure.user) : initialSocial;

    for (const identity of social) {
      const identityId = socialIdentityUuid(identity);
      if (!identityId) continue;
      await deleteIdentity(userId, identityId);
    }

    const afterDelete = await loadUser(admin, userId);
    const remaining = afterDelete.user ? socialIdentitiesOf(afterDelete.user) : social;

    if (remaining.length === 0) {
      return { error: null, unlinked: initialSocial.length };
    }

    // 마지막 identity 제한 등으로 DELETE가 막히면 soft-delete로 provider_id를 비식별화한다.
    const { error: softDeleteError } = await admin.auth.admin.deleteUser(userId, true);
    if (softDeleteError) {
      return {
        error: softDeleteError.message || "oauth_identity_still_linked",
        unlinked: 0
      };
    }

    shouldReban = false;
    return { error: null, unlinked: initialSocial.length };
  } finally {
    if (shouldReban) await rebanWithdrawnUser(admin, userId);
  }
}

type SessionUnlinkClient = {
  auth: {
    unlinkIdentity: (identity: UserIdentity) => Promise<{ error: { message: string } | null }>;
  };
};

async function deleteIdentityCandidates(
  userId: string,
  identity: { identity_id?: string | null; id?: string | null }
) {
  for (const identityId of identityUuidCandidates(identity)) {
    const result = await deleteIdentity(userId, identityId);
    if (result.ok) return;
  }
}

/** 활성 계정에서 지정 소셜 identity만 제거한다. 탈퇴 처리·ban은 하지 않는다. */
export async function unlinkProviderIdentities(
  userId: string,
  providers: string[],
  session?: SessionUnlinkClient
): Promise<{ error: string | null; unlinked: number }> {
  const wanted = new Set(providers.filter(Boolean));
  if (wanted.size === 0) return { error: null, unlinked: 0 };

  const admin = createAdminClient();
  const loaded = await loadUser(admin, userId);
  if (!loaded.user) return { error: loaded.error, unlinked: 0 };

  let identities = loaded.user.identities ?? [];
  let targets = identities.filter((identity) => wanted.has(identity.provider ?? ""));
  if (targets.length === 0) return { error: null, unlinked: 0 };

  const hasKeeper = identities.some((identity) => !wanted.has(identity.provider ?? ""));
  if (!hasKeeper) {
    await admin.auth.admin.updateUserById(userId, {
      email: `naver_${userId.replace(/-/g, "")}@oauth.dadaeyu.local`,
      password: `Wd_${crypto.randomUUID()}!aA1`,
      email_confirm: true
    });
    const refreshed = await loadUser(admin, userId);
    identities = refreshed.user?.identities ?? identities;
    targets = identities.filter((identity) => wanted.has(identity.provider ?? ""));
  }

  for (const identity of targets) {
    if (session) {
      await session.auth.unlinkIdentity(identity as UserIdentity).catch(() => {});
    }
    await deleteIdentityCandidates(userId, identity);
  }

  const after = await loadUser(admin, userId);
  const remaining = (after.user?.identities ?? []).filter((identity) =>
    wanted.has(identity.provider ?? "")
  );
  if (remaining.length > 0) {
    return { error: "oauth_identity_still_linked", unlinked: 0 };
  }

  return { error: null, unlinked: targets.length };
}

/** 이미 탈퇴한 계정에 묶인 소셜 identity를 일괄 해제 (재가입 1회 실패 복구용) */
export async function unlinkWithdrawnOAuthIdentities(): Promise<{ released: number }> {
  const admin = createAdminClient();
  const { data: members, error } = await admin
    .from(T.members)
    .select("id")
    .eq("status", "withdrawn")
    .limit(200);

  if (error || !members?.length) return { released: 0 };

  let released = 0;
  for (const member of members) {
    try {
      const result = await unlinkAuthIdentities(member.id);
      if (!result.error && result.unlinked > 0) released += 1;
    } catch {
      // 한 계정 실패가 나머지 복구를 막지 않게 한다.
    }
  }

  return { released };
}
