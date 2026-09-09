import type { User } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizeEmail } from "@/lib/auth/email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmailFormat(email: string): boolean {
  const normalized = normalizeEmail(email);
  return normalized.length > 3 && EMAIL_RE.test(normalized);
}

async function findAuthUser(match: (user: User) => boolean) {
  const admin = createAdminClient();
  const perPage = 200;
  let page = 1;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const users = data.users ?? [];
    const found = users.find(match);
    if (found) return found;
    if (users.length < perPage) break;
    page += 1;
  }

  return null;
}

export async function findAuthUserByEmail(email: string) {
  const normalized = normalizeEmail(email);
  if (!isValidEmailFormat(normalized)) return null;
  return findAuthUser((user) => normalizeEmail(user.email ?? "") === normalized);
}

export async function findAuthUserByNaverId(naverId: string) {
  const id = naverId.trim();
  if (!id) return null;
  return findAuthUser((user) => user.user_metadata?.naver_id === id);
}

/** Auth(users)에 동일 이메일이 없으면 true */
export async function isEmailAvailable(email: string): Promise<boolean> {
  const normalized = normalizeEmail(email);
  if (!isValidEmailFormat(normalized)) return false;
  const existing = await findAuthUserByEmail(normalized);
  return !existing;
}
