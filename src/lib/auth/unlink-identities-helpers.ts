const LOCAL_PROVIDERS = new Set(["email", "phone"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type IdentityLike = {
  id?: string | null;
  identity_id?: string | null;
  provider?: string | null;
};

export function withdrawnPlaceholderEmail(userId: string) {
  return `deleted_${userId.replace(/-/g, "")}@withdrawn.local`;
}

export function isSocialAuthIdentity(identity: IdentityLike) {
  const provider = identity.provider ?? "";
  return Boolean(provider) && !LOCAL_PROVIDERS.has(provider);
}

export function socialIdentitiesOf(user: { identities?: IdentityLike[] | null }) {
  return (user.identities ?? []).filter(isSocialAuthIdentity);
}

/**
 * GoTrue DELETE path는 identity row UUID만 받는다.
 * identity.id는 카카오 provider_id(숫자 문자열)라서 넘기면 404가 난다.
 */
export function identityUuidCandidates(identity: IdentityLike): string[] {
  const found: string[] = [];
  for (const value of [identity.identity_id, identity.id]) {
    const trimmed = value?.trim() ?? "";
    if (UUID_RE.test(trimmed) && !found.includes(trimmed)) found.push(trimmed);
  }
  return found;
}

export function socialIdentityUuid(identity: IdentityLike): string | null {
  return identityUuidCandidates(identity)[0] ?? null;
}
