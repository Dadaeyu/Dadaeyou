import type { User, UserIdentity } from "@supabase/supabase-js";
import { isNaverOwnedAccount } from "@/lib/auth/auth-kind";
import { findAuthUserByEmail } from "@/lib/auth/email-availability";
import { isolateNaverAuthEmail } from "@/lib/auth/naver-session";
import {
  inferLinkedOAuthProvider,
  oauthEmailFromUser,
  oauthProfileFromUser,
  type LinkedOAuthProvider
} from "@/lib/auth/split-naver-oauth-helpers";
import { unlinkProviderIdentities } from "@/lib/auth/unlink-identities";
import { createAdminClient } from "@/lib/supabase/admin";

export {
  inferLinkedOAuthProvider,
  oauthEmailFromUser,
  oauthProfileFromUser,
  type LinkedOAuthProvider
} from "@/lib/auth/split-naver-oauth-helpers";

type SessionClient = {
  auth: {
    unlinkIdentity: (identity: UserIdentity) => Promise<{ error: { message: string } | null }>;
    signOut: () => Promise<unknown>;
    verifyOtp: (params: {
      token_hash: string;
      type: "email";
    }) => Promise<{ data: { user: User | null }; error: { message: string } | null }>;
  };
};

/**
 * 카카오 이메일이 네이버 로그인 계정과 같아서 Auth가 한 유저로 묶인 경우,
 * 네이버는 전용 이메일로 남기고 카카오 이메일로 새 세션을 연다.
 * "다시 누르세요" 루프를 만들지 않는다.
 */
export async function completeOAuthAsNewUserFromNaverCollision(
  supabase: SessionClient,
  naverUser: User,
  provider: LinkedOAuthProvider
): Promise<User | null> {
  const email = oauthEmailFromUser(naverUser, provider);
  if (!email) return null;

  const profile = oauthProfileFromUser(naverUser, provider);
  const admin = createAdminClient();

  // 먼저 네이버 Auth 이메일을 치워 haetom@naver.com 같은 주소를 비운 뒤 카카오 identity를 뗀다.
  await isolateNaverAuthEmail(naverUser).catch(() => false);
  await unlinkProviderIdentities(naverUser.id, ["kakao", "google"], supabase).catch(() => ({
    error: null,
    unlinked: 0
  }));

  let { data: afterNaver } = await admin.auth.admin.getUserById(naverUser.id);
  if (afterNaver?.user) {
    await isolateNaverAuthEmail(afterNaver.user).catch(() => false);
    await unlinkProviderIdentities(naverUser.id, ["kakao", "google"], supabase).catch(() => ({
      error: null,
      unlinked: 0
    }));
    afterNaver = (await admin.auth.admin.getUserById(naverUser.id)).data;
  }

  const stillLinked = (afterNaver?.user?.identities ?? []).some(
    (identity) => identity.provider === provider
  );
  if (stillLinked) return null;

  let existing = await findAuthUserByEmail(email).catch(() => null);
  if (existing && isNaverOwnedAccount(existing)) {
    await isolateNaverAuthEmail(existing).catch(() => false);
    existing = await findAuthUserByEmail(email).catch(() => null);
  }
  if (existing && isNaverOwnedAccount(existing)) return null;

  if (!existing) {
    await admin.auth.admin
      .createUser({
        email,
        email_confirm: true,
        user_metadata: {
          nickname: profile.nickname || undefined,
          name: profile.nickname || undefined,
          avatar_url: profile.avatar || undefined,
          picture: profile.avatar || undefined
        },
        app_metadata: {
          provider,
          providers: [provider]
        }
      })
      .catch(() => null);
  }

  const { data: link, error: linkError } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email
  });
  if (linkError || !link?.properties?.hashed_token) return null;

  await supabase.auth.signOut().catch(() => null);
  const { data, error } = await supabase.auth.verifyOtp({
    token_hash: link.properties.hashed_token,
    type: "email"
  });
  if (error || !data.user) return null;
  if (isNaverOwnedAccount(data.user)) return null;

  await admin.auth.admin
    .updateUserById(data.user.id, {
      app_metadata: {
        provider,
        providers: [provider]
      },
      user_metadata: {
        ...data.user.user_metadata,
        nickname: profile.nickname || data.user.user_metadata?.nickname,
        name: profile.nickname || data.user.user_metadata?.name,
        avatar_url: profile.avatar || data.user.user_metadata?.avatar_url,
        naver_id: null
      }
    })
    .catch(() => null);

  return {
    ...data.user,
    app_metadata: {
      ...data.user.app_metadata,
      provider,
      providers: [provider]
    },
    user_metadata: {
      ...data.user.user_metadata,
      naver_id: undefined
    }
  };
}
