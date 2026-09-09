export const NAVER_OAUTH_STATE_COOKIE = "naver_oauth_state";
export const NAVER_OAUTH_NEXT_COOKIE = "naver_oauth_next";

export function getNaverOAuthConfig() {
  const clientId = process.env.NAVER_CLIENT_ID?.trim();
  const clientSecret = process.env.NAVER_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("NAVER_CLIENT_ID 또는 NAVER_CLIENT_SECRET이 설정되지 않았습니다.");
  }
  return { clientId, clientSecret };
}

export function getNaverRedirectUri(origin: string): string {
  return `${origin}/auth/naver/callback`;
}

export function buildNaverAuthorizeUrl(origin: string, state: string): string {
  const { clientId } = getNaverOAuthConfig();
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId,
    redirect_uri: getNaverRedirectUri(origin),
    state,
    auth_type: "reauthenticate"
  });
  return `https://nid.naver.com/oauth2.0/authorize?${params}`;
}

export async function exchangeNaverCode(code: string, state: string): Promise<string> {
  const { clientId, clientSecret } = getNaverOAuthConfig();
  const response = await fetch("https://nid.naver.com/oauth2.0/token", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded;charset=utf-8"
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: clientId,
      client_secret: clientSecret,
      code,
      state
    })
  });

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description ?? data.error ?? "naver_token_failed");
  }

  return data.access_token;
}

/** Auth users.email 전용. 카카오·구글·이메일 가입과 절대 겹치지 않게 네이버 id로만 만든다. */
export function naverAuthEmail(sub: string) {
  return `naver_${String(sub).trim()}@oauth.dadaeyu.invalid`;
}

export function resolveNaverAuthEmail(sub: string, _email?: unknown): string {
  return naverAuthEmail(sub);
}
