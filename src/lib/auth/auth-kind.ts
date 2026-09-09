/** 소셜(카카오·구글·네이버 등) 로그인 계정 여부. 이메일은 있어도 비밀번호가 없을 수 있다. */
export type AuthKindUser = {
  email?: string | null;
  identities?: { provider: string }[] | null;
  app_metadata?: { provider?: string; providers?: string[] };
  user_metadata?: Record<string, unknown> | null;
} | null;

function isOAuthProviderName(provider: string) {
  return provider !== "email";
}

function naverIdOf(user: AuthKindUser): string {
  const value = user?.user_metadata?.naver_id;
  return typeof value === "string" ? value.trim() : "";
}

function isNaverAuthEmail(email: string) {
  const value = email.toLowerCase();
  return (
    value.startsWith("naver_") &&
    (value.endsWith("@oauth.dadaeyu.invalid") || value.endsWith("@oauth.dadaeyu.local"))
  );
}

/** 네이버는 매직링크로 세션을 만들어서 identities가 email로 보일 수 있다. */
export function isNaverOAuthUser(user: AuthKindUser): boolean {
  if (!user) return false;
  if (naverIdOf(user)) return true;
  if (isNaverAuthEmail(user.email ?? "")) return true;
  const providers = user.app_metadata?.providers ?? [];
  const provider = user.app_metadata?.provider;
  return provider === "naver" || providers.includes("naver");
}

/**
 * 카카오·구글 콜백이 네이버 원계정에 붙었는지.
 * providers에 naver가 섞여 있는 것만으로는 카카오 전용 계정을 네이버로 오인하지 않는다.
 */
export function isNaverOwnedAccount(user: AuthKindUser): boolean {
  if (!user) return false;
  if (naverIdOf(user)) return true;
  if (isNaverAuthEmail(user.email ?? "")) return true;
  return user.app_metadata?.provider === "naver";
}

export function isOAuthUser(user: AuthKindUser): boolean {
  if (!user) return false;
  if (isNaverOAuthUser(user)) return true;
  const identities = user.identities ?? [];
  if (identities.some((identity) => isOAuthProviderName(identity.provider))) return true;
  const providers = user.app_metadata?.providers ?? [];
  if (providers.some((provider) => isOAuthProviderName(provider))) return true;
  const provider = user.app_metadata?.provider;
  return !!provider && isOAuthProviderName(provider);
}

/**
 * 이메일+비밀번호로 가입한 계정인지.
 * 소셜 계정은 이메일이 저장돼 있어도 비밀번호가 없으므로 false.
 * identities가 비어 있어도 이메일 값만으로 email 가입으로 보지 않는다.
 */
export function hasEmailPasswordAuth(user: AuthKindUser): boolean {
  if (!user) return false;
  if (isOAuthUser(user)) return false;

  const identities = user.identities ?? [];
  if (identities.length > 0) {
    return identities.some((identity) => identity.provider === "email");
  }

  const providers = user.app_metadata?.providers ?? [];
  if (providers.length > 0) {
    return (
      providers.includes("email") && !providers.some((provider) => isOAuthProviderName(provider))
    );
  }

  return user.app_metadata?.provider === "email";
}
