"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { callEnsureMember } from "@/lib/auth/actions";
import { fetchMember, fetchUserPreferences } from "@/lib/supabase/member";
import type { DbMember, DbUserPreferences } from "@/lib/supabase/types";
import { getPublicSupabaseConfig } from "@/lib/supabase/config";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  member: DbMember | null;
  preferences: DbUserPreferences | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
  /** 접근성 등 일부 필드만 로컬 preferences 캐시에 반영 */
  patchPreferences: (patch: Partial<DbUserPreferences>) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);
const PUBLIC_SUPABASE_CONFIGURED = getPublicSupabaseConfig().isConfigured;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [member, setMember] = useState<DbMember | null>(null);
  const [preferences, setPreferences] = useState<DbUserPreferences | null>(null);
  const [loading, setLoading] = useState(PUBLIC_SUPABASE_CONFIGURED);
  const activeUserIdRef = useRef<string | null>(null);
  const loadGenerationRef = useRef(0);
  /** signOut 직후 늦게 도착하는 INITIAL_SESSION/TOKEN_REFRESHED가 user를 다시 심지 못하게 */
  const suppressStaleSessionRef = useRef(false);

  const clearAuthState = useCallback(() => {
    activeUserIdRef.current = null;
    loadGenerationRef.current += 1;
    setUser(null);
    setSession(null);
    setMember(null);
    setPreferences(null);
  }, []);

  const loadUserData = useCallback(
    async (userId: string) => {
      const generation = (loadGenerationRef.current += 1);
      activeUserIdRef.current = userId;

      await callEnsureMember().catch(() => {});

      const [m, prefs] = await Promise.all([
        fetchMember(userId).catch(() => null),
        fetchUserPreferences(userId).catch(() => null)
      ]);

      if (activeUserIdRef.current !== userId || loadGenerationRef.current !== generation) {
        return;
      }

      if (m?.status === "withdrawn") {
        suppressStaleSessionRef.current = true;
        const supabase = createClient();
        await supabase.auth.signOut().catch(() => {});
        if (activeUserIdRef.current !== userId || loadGenerationRef.current !== generation) {
          return;
        }
        clearAuthState();
        return;
      }

      setMember(m);
      setPreferences(prefs);
    },
    [clearAuthState]
  );

  const refreshMember = useCallback(async () => {
    if (!user) return;
    await loadUserData(user.id);
  }, [user, loadUserData]);

  const patchPreferences = useCallback((patch: Partial<DbUserPreferences>) => {
    setPreferences((prev) =>
      prev ? { ...prev, ...patch, updated_at: new Date().toISOString() } : prev
    );
  }, []);

  useEffect(() => {
    if (!PUBLIC_SUPABASE_CONFIGURED) return;

    const supabase = createClient();
    const sessionGeneration = loadGenerationRef.current;
    let isActive = true;

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      if (!isActive || loadGenerationRef.current !== sessionGeneration) return;
      if (suppressStaleSessionRef.current && s?.user) return;

      setSession(s);
      setUser(s?.user ?? null);
      if (s?.user) {
        loadUserData(s.user.id).finally(() => setLoading(false));
      } else {
        clearAuthState();
        setLoading(false);
      }
    });

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, s) => {
      if (s?.user) {
        // 의도적 로그아웃 이후에는 실제 SIGNED_IN 전까지 옛 세션을 무시한다.
        if (suppressStaleSessionRef.current && event !== "SIGNED_IN") {
          return;
        }
        suppressStaleSessionRef.current = false;
        setSession(s);
        setUser(s.user);
        loadUserData(s.user.id).finally(() => setLoading(false));
        return;
      }

      clearAuthState();
      setLoading(false);
    });

    return () => {
      isActive = false;
      subscription.unsubscribe();
    };
  }, [clearAuthState, loadUserData]);

  const signOut = useCallback(async () => {
    if (!PUBLIC_SUPABASE_CONFIGURED) return;
    suppressStaleSessionRef.current = true;
    clearAuthState();
    const supabase = createClient();
    await supabase.auth.signOut();
  }, [clearAuthState]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      member,
      preferences,
      loading,
      signOut,
      refreshMember,
      patchPreferences
    }),
    [user, session, member, preferences, loading, signOut, refreshMember, patchPreferences]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}

export function useOptionalAuth() {
  return useContext(AuthContext);
}
