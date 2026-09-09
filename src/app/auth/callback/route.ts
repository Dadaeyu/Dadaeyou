import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isEmailOtpType, resolvePostAuthRedirect } from "@/lib/auth/finish-auth-callback";
import { isNaverOwnedAccount } from "@/lib/auth/auth-kind";
import {
  completeOAuthAsNewUserFromNaverCollision,
  inferLinkedOAuthProvider
} from "@/lib/auth/split-naver-oauth";
import { createAdminClient } from "@/lib/supabase/admin";
import { T } from "@/lib/supabase/tables";
import { unlinkAuthIdentities, unlinkWithdrawnOAuthIdentities } from "@/lib/auth/unlink-identities";

type CookieToSet = {
  name: string;
  value: string;
  options?: Parameters<NextResponse["cookies"]["set"]>[2];
};

function loginErrorRedirect(
  origin: string,
  searchParams: URLSearchParams,
  reason?: string
): NextResponse {
  const errorCode = searchParams.get("error_code") ?? "";
  const errorDescription = (searchParams.get("error_description") ?? "").toLowerCase();

  if (errorCode === "email_address_not_provided" || errorDescription.includes("email")) {
    return NextResponse.redirect(`${origin}/login?error=email_not_provided`);
  }

  if (errorDescription.includes("provider id")) {
    return NextResponse.redirect(`${origin}/login?error=naver_provider_id`);
  }

  const looksBanned =
    errorCode === "user_banned" ||
    errorDescription.includes("banned") ||
    errorDescription.includes("disabled") ||
    errorDescription.includes("already");

  const params = new URLSearchParams({
    error: looksBanned ? "social_rejoin" : "auth_callback_failed"
  });
  if (reason) params.set("reason", reason);
  return NextResponse.redirect(`${origin}/login?${params.toString()}`);
}

function isBannedSessionError(error: { message: string; code?: string }) {
  const text = `${error.code ?? ""} ${error.message}`.toLowerCase();
  return text.includes("banned") || text.includes("disabled") || text.includes("user_banned");
}

function redirectWithCookies(url: string, cookiesToSet: CookieToSet[]) {
  const response = NextResponse.redirect(url);
  for (const { name, value, options } of cookiesToSet) {
    response.cookies.set(name, value, options);
  }
  return response;
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");
  const oauthError = searchParams.get("error");

  if (oauthError) {
    await unlinkWithdrawnOAuthIdentities().catch(() => {});
    return loginErrorRedirect(origin, searchParams);
  }

  // 이메일 token_hash 링크 — 확인 페이지에서 버튼으로 인증
  if (tokenHash && isEmailOtpType(type)) {
    const confirmUrl = new URL("/auth/confirm", origin);
    confirmUrl.searchParams.set("token_hash", tokenHash);
    confirmUrl.searchParams.set("type", type);
    if (next) confirmUrl.searchParams.set("next", next);
    return NextResponse.redirect(confirmUrl.toString());
  }

  if (!code) {
    return loginErrorRedirect(origin, searchParams, "missing_params");
  }

  const cookiesToSet: CookieToSet[] = [];
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(setCookies) {
          cookiesToSet.push(...setCookies);
        }
      }
    }
  );

  let sessionError: { message: string; code?: string } | null = null;

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  sessionError = error;

  if (sessionError) {
    const { released } = await unlinkWithdrawnOAuthIdentities().catch(() => ({
      released: 0
    }));
    const errorParam =
      released > 0 || isBannedSessionError(sessionError) ? "social_rejoin" : "auth_callback_failed";
    return redirectWithCookies(
      `${origin}/login?error=${errorParam}&reason=${encodeURIComponent(sessionError.code ?? "exchange_failed")}`,
      cookiesToSet
    );
  }

  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return redirectWithCookies(
      `${origin}/login?error=auth_callback_failed&reason=no_user`,
      cookiesToSet
    );
  }

  const admin = createAdminClient();
  const { data: member } = await admin
    .from(T.members)
    .select("status")
    .eq("id", user.id)
    .maybeSingle();

  if (member?.status === "withdrawn") {
    await unlinkAuthIdentities(user.id).catch(() => {});
    await supabase.auth.signOut();
    return redirectWithCookies(`${origin}/login?error=social_rejoin`, cookiesToSet);
  }

  const { data: authUserData } = await admin.auth.admin.getUserById(user.id);
  const authUser = authUserData?.user ?? user;

  // 카카오 이메일이 @naver.com 이면 예전 네이버 로그인 계정과 같은 주소로 묶인다.
  // 안내만 반복하지 않고, 이 요청에서 카카오(또는 구글) 새 세션을 연다.
  if (isNaverOwnedAccount(authUser)) {
    const provider = inferLinkedOAuthProvider(authUser, searchParams.get("provider"));
    const splitUser = await completeOAuthAsNewUserFromNaverCollision(
      supabase,
      authUser,
      provider
    ).catch(() => null);

    if (splitUser) {
      const destination = await resolvePostAuthRedirect(supabase, splitUser, next);
      return redirectWithCookies(`${origin}${destination}`, cookiesToSet);
    }

    await supabase.auth.signOut();
    return redirectWithCookies(`${origin}/login?error=social_provider_mismatch`, cookiesToSet);
  }

  const destination = await resolvePostAuthRedirect(supabase, user, next);
  return redirectWithCookies(`${origin}${destination}`, cookiesToSet);
}
