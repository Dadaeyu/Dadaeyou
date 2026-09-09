import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { resolveAuthDestination } from "@/lib/auth/post-login";
import { resolveNaverUserinfo } from "@/lib/auth/naver-userinfo";
import {
  exchangeNaverCode,
  NAVER_OAUTH_NEXT_COOKIE,
  NAVER_OAUTH_STATE_COOKIE,
  resolveNaverAuthEmail
} from "@/lib/auth/naver-oauth";
import { isGeneratedNickname } from "@/lib/auth/display-nickname";
import { establishSessionForEmail, retireWithdrawnNaverUser } from "@/lib/auth/naver-session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureMemberExists } from "@/lib/supabase/ensure-member";
import { T } from "@/lib/supabase/tables";

function loginFail(origin: string): NextResponse {
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}

function humanProfileName(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed || isGeneratedNickname(trimmed)) return undefined;
  return trimmed;
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const oauthError = searchParams.get("error");

  const cookieStore = await cookies();
  const savedState = cookieStore.get(NAVER_OAUTH_STATE_COOKIE)?.value;
  const next = cookieStore.get(NAVER_OAUTH_NEXT_COOKIE)?.value ?? "/";

  if (oauthError || !code || !state || !savedState || state !== savedState) {
    return loginFail(origin);
  }

  try {
    const accessToken = await exchangeNaverCode(code, state);
    const profileResult = await resolveNaverUserinfo({
      authorization: `Bearer ${accessToken}`
    });

    if (profileResult.kind !== "ok") {
      return loginFail(origin);
    }

    const profile = profileResult.profile;
    const sub = String(profile.sub);
    const email = resolveNaverAuthEmail(sub, profile.email);
    const profileEmail =
      typeof profile.email === "string" ? profile.email.trim().toLowerCase() : undefined;
    const nickname = humanProfileName(profile.nickname) ?? humanProfileName(profile.name);
    const name = humanProfileName(profile.name) ?? nickname;
    const avatarUrl = typeof profile.profile_image === "string" ? profile.profile_image : undefined;

    const sessionMeta = {
      nickname,
      name,
      avatar_url: avatarUrl,
      naver_id: sub,
      profileEmail
    };

    let user = await establishSessionForEmail(email, sessionMeta);

    const admin = createAdminClient();
    let { data: member } = await admin
      .from(T.members)
      .select("status")
      .eq("id", user.id)
      .maybeSingle();

    if (member?.status === "withdrawn") {
      await retireWithdrawnNaverUser(user).catch(() => {});
      const supabase = await createClient();
      await supabase.auth.signOut();
      user = await establishSessionForEmail(email, sessionMeta);
      ({ data: member } = await admin
        .from(T.members)
        .select("status")
        .eq("id", user.id)
        .maybeSingle());
      if (member?.status === "withdrawn") {
        await supabase.auth.signOut();
        return loginFail(origin);
      }
    }

    try {
      await ensureMemberExists(user);
    } catch {
      // 온보딩 / ensure-member 에서 재시도
    }

    const supabase = await createClient();
    const destination = await resolveAuthDestination(supabase, user.id, next);
    const response = NextResponse.redirect(`${origin}${destination}`);
    response.cookies.delete(NAVER_OAUTH_STATE_COOKIE);
    response.cookies.delete(NAVER_OAUTH_NEXT_COOKIE);
    return response;
  } catch {
    return loginFail(origin);
  }
}
