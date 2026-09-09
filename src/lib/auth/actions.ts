import { createClient } from "@/lib/supabase/client";
import { resolveAuthDestination } from "@/lib/auth/post-login";
import { getSafeNextPath } from "@/lib/auth/paths";
import { normalizeEmail } from "@/lib/auth/email";

export { normalizeEmail } from "@/lib/auth/email";

export type OAuthProvider = "google" | "kakao" | "naver";

const OAUTH_PROVIDERS: Record<OAuthProvider, string> = {
  google: "google",
  kakao: "kakao",
  naver: "custom:naver"
};

export interface SignUpProfile {
  nickname: string;
  theme_preferences?: string[];
  accessibility_needs?: string[];
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = createClient();
  return supabase.auth.signInWithPassword({
    email: normalizeEmail(email),
    password
  });
}

function isEmailSendFailure(message: string | undefined) {
  return !!message?.includes("Error sending confirmation email");
}

export async function signUpWithEmail(
  email: string,
  password: string,
  profile: SignUpProfile,
  next?: string
) {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) {
    return {
      data: { user: null, session: null },
      error: { message: 'Email address "" is invalid', name: "AuthApiError", status: 400 }
    } as Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["signUp"]>>;
  }

  const supabase = createClient();
  const safeNext = getSafeNextPath(next, "/mypage");
  const redirectTo = new URL("/auth/confirm", window.location.origin);
  redirectTo.searchParams.set("next", safeNext);

  const result = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: {
        nickname: profile.nickname,
        ...(profile.theme_preferences?.length
          ? { theme_preferences: profile.theme_preferences }
          : {}),
        ...(profile.accessibility_needs?.length
          ? { accessibility_needs: profile.accessibility_needs }
          : {})
      },
      emailRedirectTo: redirectTo.toString()
    }
  });

  if (!result.error) {
    const linkRes = await fetch("/api/auth/confirm-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: normalizedEmail, next: safeNext })
    });
    const linkData = (await linkRes.json().catch(() => ({}))) as {
      confirmLink?: string;
      message?: string;
    };
    if (linkRes.ok && linkData.confirmLink) {
      sessionStorage.setItem("devConfirmationLink", linkData.confirmLink);
      if (linkData.message) {
        sessionStorage.setItem("devConfirmationNotice", linkData.message);
      }
    }
    return result;
  }

  if (isEmailSendFailure(result.error.message) && process.env.NODE_ENV === "development") {
    const res = await fetch("/api/auth/signup-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: normalizedEmail,
        password,
        profile,
        next: safeNext,
        devLinkOnly: true
      })
    });

    const data = (await res.json().catch(() => ({}))) as {
      devLink?: string;
      message?: string;
    };

    if (res.ok && data.devLink) {
      sessionStorage.setItem("devConfirmationLink", data.devLink);
      if (data.message) {
        sessionStorage.setItem("devConfirmationNotice", data.message);
      }

      return {
        data: { user: { email: normalizedEmail } as never, session: null },
        error: null
      } as Awaited<ReturnType<ReturnType<typeof createClient>["auth"]["signUp"]>>;
    }
  }

  return result;
}

export async function resendSignupConfirmation(email: string) {
  const normalizedEmail = normalizeEmail(email);

  const gateRes = await fetch("/api/auth/resend-signup-confirmation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: normalizedEmail })
  });

  const gateData = (await gateRes.json().catch(() => ({}))) as {
    error?: string;
    code?: string;
    retryAfterMs?: number;
    proceed?: boolean;
    confirmLink?: string;
  };

  if (!gateRes.ok) {
    return {
      data: null,
      error: {
        message: gateData.error ?? "요청에 실패했습니다.",
        code: gateData.code,
        retryAfterMs: gateData.retryAfterMs
      }
    };
  }

  const supabase = createClient();
  const redirectTo = new URL("/auth/confirm", window.location.origin);
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: normalizedEmail,
    options: { emailRedirectTo: redirectTo.toString() }
  });

  const linkNotice =
    "인증 메일을 보냈습니다. 메일 링크가 동작하지 않으면 아래 링크를 사용해 주세요.";

  if (!error) {
    return {
      data: {
        ok: true,
        sent: true as const,
        devLink: gateData.confirmLink,
        message: gateData.confirmLink ? linkNotice : undefined
      },
      error: null
    };
  }

  if (isEmailSendFailure(error.message)) {
    if (gateData.confirmLink) {
      return {
        data: {
          ok: true,
          sent: false as const,
          devLink: gateData.confirmLink,
          message: "메일 발송에 실패했습니다. 아래 링크로 인증해 주세요."
        },
        error: null
      };
    }

    if (process.env.NODE_ENV === "development") {
      const devRes = await fetch("/api/auth/resend-signup-confirmation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail, devLinkOnly: true })
      });

      const devData = (await devRes.json().catch(() => ({}))) as {
        devLink?: string;
        message?: string;
        error?: string;
        code?: string;
      };

      if (devRes.ok && devData.devLink) {
        return { data: devData, error: null };
      }

      if (!devRes.ok) {
        return {
          data: null,
          error: {
            message: devData.error ?? "요청에 실패했습니다.",
            code: devData.code
          }
        };
      }
    }
  }

  return {
    data: null,
    error: {
      message: error.message,
      code: error.code
    }
  };
}

export async function resetPasswordForEmail(email: string) {
  const supabase = createClient();
  return supabase.auth.resetPasswordForEmail(normalizeEmail(email), {
    redirectTo: `${window.location.origin}/auth/reset-password`
  });
}

export async function updatePassword(newPassword: string) {
  const supabase = createClient();
  return supabase.auth.updateUser({ password: newPassword });
}

export async function signInWithOAuth(provider: OAuthProvider, next?: string) {
  const supabase = createClient();
  // 기존 세션이 있으면 카카오·구글 identity가 그 계정에 붙는다. 소셜은 항상 새 로그인으로 시작한다.
  await supabase.auth.signOut().catch(() => {});

  if (provider === "naver") {
    const url = new URL("/auth/naver", window.location.origin);
    if (next) url.searchParams.set("next", next);
    window.location.assign(url.toString());
    return {
      data: { provider: "naver", url: url.toString() },
      error: null
    } as { data: { provider: string; url: string }; error: null };
  }

  const redirectTo = new URL("/auth/callback", window.location.origin);
  redirectTo.searchParams.set("provider", provider);
  if (next) redirectTo.searchParams.set("next", next);

  const options: {
    redirectTo: string;
    queryParams?: Record<string, string>;
  } = {
    redirectTo: redirectTo.toString()
  };

  if (provider === "kakao") {
    // prompt=login: 카카오에 이미 로그인돼 있어도 계정 재선택/재로그인
    options.queryParams = { lang: "ko", prompt: "login" };
  } else if (provider === "google") {
    options.queryParams = { prompt: "select_account" };
  }

  return supabase.auth.signInWithOAuth({
    provider: OAUTH_PROVIDERS[provider] as never,
    options
  });
}

export { getSafeNextPath } from "@/lib/auth/paths";

/** members·preferences 보장 (metadata 테마 → tb_user_preferences 동기화 포함) */
export async function callEnsureMember(): Promise<boolean> {
  const res = await fetch("/api/auth/ensure-member", { method: "POST" });
  return res.ok;
}

/** 이메일 로그인 후 온보딩 필요 여부에 따라 이동 경로 반환 */
export async function resolvePostLoginPath(next: string): Promise<string> {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return getSafeNextPath(next);

  await callEnsureMember();

  return resolveAuthDestination(supabase, user.id, next);
}

export { isOAuthUser, hasEmailPasswordAuth } from "@/lib/auth/auth-kind";
