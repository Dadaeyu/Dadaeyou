import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";

const source = await readFile(new URL("./AuthContext.tsx", import.meta.url), "utf8");

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
};

type SessionMock = {
  user: {
    id: string;
    email: string;
  };
};

type MemberMock = {
  id: string;
  auth_user_id: string;
  nickname: string;
  status: "active" | "withdrawn";
};

type PreferencesMock = {
  user_id: string;
  accessibility_profile: {
    mobility: string[];
  };
};

type AuthStateCallback = (event: string, session: SessionMock | null) => void;

type AuthContextValueMock = {
  user: SessionMock["user"] | null;
  session: SessionMock | null;
  member: MemberMock | null;
  preferences: PreferencesMock | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshMember: () => Promise<void>;
  patchPreferences: (patch: Partial<PreferencesMock>) => void;
};

type AuthProviderMock = (props: { children: null }) => unknown;

function createDeferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

function sessionFor(userId: string): SessionMock {
  return {
    user: {
      id: userId,
      email: `${userId}@example.test`
    }
  };
}

function memberFor(userId: string, nickname: string): MemberMock {
  return {
    id: `member-${userId}`,
    auth_user_id: userId,
    nickname,
    status: "active"
  };
}

function preferencesFor(userId: string): PreferencesMock {
  return {
    user_id: userId,
    accessibility_profile: {
      mobility: []
    }
  };
}

function depsChanged(prev: unknown[] | undefined, next: unknown[] | undefined) {
  if (!prev || !next || prev.length !== next.length) return true;
  return next.some((value, index) => !Object.is(value, prev[index]));
}

class AuthProviderHarness {
  private AuthProvider!: AuthProviderMock;
  private effectsToRun: number[] = [];
  private readonly getSessionDeferred: Deferred<{ data: { session: SessionMock | null } }>;
  private hookIndex = 0;
  private hooks: unknown[] = [];
  private pendingRender = false;

  readonly authCallbacks: AuthStateCallback[] = [];
  readonly fetchMemberCalls: string[] = [];
  readonly fetchPreferencesCalls: string[] = [];
  readonly memberRequests = new Map<string, Deferred<MemberMock | null>>();
  readonly preferencesRequests = new Map<string, Deferred<PreferencesMock | null>>();
  readonly signOutCalls: number[] = [];

  value: AuthContextValueMock | null = null;

  constructor(getSessionDeferred: Deferred<{ data: { session: SessionMock | null } }>) {
    this.getSessionDeferred = getSessionDeferred;
    this.loadAuthProvider();
    this.render();
  }

  private readonly react = {
    createContext: (defaultValue: unknown) => {
      const context = {
        _currentValue: defaultValue,
        Provider: ({ value, children }: { value: unknown; children: unknown }) => {
          context._currentValue = value;
          this.value = value as AuthContextValueMock;
          return children;
        }
      };
      return context;
    },
    useCallback: <T extends (...args: unknown[]) => unknown>(
      callback: T,
      deps: unknown[] | undefined
    ) => this.useMemo(() => callback, deps),
    useContext: (context: { _currentValue: unknown }) => context._currentValue,
    useEffect: (effect: () => void | (() => void), deps: unknown[] | undefined) => {
      const index = this.hookIndex++;
      const state = this.hooks[index] as
        | { deps: unknown[] | undefined; cleanup?: () => void; effect: () => void | (() => void) }
        | undefined;
      if (!state || depsChanged(state.deps, deps)) {
        this.hooks[index] = { deps, cleanup: state?.cleanup, effect };
        this.effectsToRun.push(index);
      }
    },
    useMemo: <T>(factory: () => T, deps: unknown[] | undefined) => this.useMemo(factory, deps),
    useRef: <T>(initialValue: T) => {
      const index = this.hookIndex++;
      if (!this.hooks[index]) {
        this.hooks[index] = { current: initialValue };
      }
      return this.hooks[index] as { current: T };
    },
    useState: <T>(initialValue: T) => {
      const index = this.hookIndex++;
      if (!(index in this.hooks)) {
        this.hooks[index] =
          typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
      }
      const setState = (nextValue: T | ((previous: T) => T)) => {
        const previous = this.hooks[index] as T;
        const next =
          typeof nextValue === "function" ? (nextValue as (previous: T) => T)(previous) : nextValue;
        this.hooks[index] = next;
        this.pendingRender = true;
      };
      return [this.hooks[index], setState] as const;
    }
  };

  private readonly jsxRuntime = {
    Fragment: Symbol.for("AuthProviderHarness.Fragment"),
    jsx: (type: unknown, props: Record<string, unknown>) => ({ type, props }),
    jsxs: (type: unknown, props: Record<string, unknown>) => ({ type, props })
  };

  private useMemo<T>(factory: () => T, deps: unknown[] | undefined): T {
    const index = this.hookIndex++;
    const state = this.hooks[index] as { deps: unknown[] | undefined; value: T } | undefined;
    if (!state || depsChanged(state.deps, deps)) {
      const value = factory();
      this.hooks[index] = { deps, value };
      return value;
    }
    return state.value;
  }

  private loadAuthProvider() {
    const compiled = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022
      },
      fileName: "AuthContext.tsx"
    }).outputText;

    const supabaseClient = {
      auth: {
        getSession: () => this.getSessionDeferred.promise,
        onAuthStateChange: (callback: AuthStateCallback) => {
          this.authCallbacks.push(callback);
          return {
            data: {
              subscription: {
                unsubscribe: () => {}
              }
            }
          };
        },
        signOut: async () => {
          this.signOutCalls.push(Date.now());
        }
      }
    };

    const authModule = { exports: {} as { AuthProvider?: AuthProviderMock } };
    const context = vm.createContext({
      exports: authModule.exports,
      module: authModule,
      require: (id: string) => {
        if (id === "react") return this.react;
        if (id === "react/jsx-runtime") return this.jsxRuntime;
        if (id === "@/lib/supabase/client") return { createClient: () => supabaseClient };
        if (id === "@/lib/auth/actions") return { callEnsureMember: async () => {} };
        if (id === "@/lib/supabase/member") {
          return {
            fetchMember: (userId: string) => {
              this.fetchMemberCalls.push(userId);
              const request = createDeferred<MemberMock | null>();
              this.memberRequests.set(userId, request);
              return request.promise;
            },
            fetchUserPreferences: (userId: string) => {
              this.fetchPreferencesCalls.push(userId);
              const request = createDeferred<PreferencesMock | null>();
              this.preferencesRequests.set(userId, request);
              return request.promise;
            }
          };
        }
        if (id === "@/lib/supabase/config") {
          return {
            getPublicSupabaseConfig: () => ({ isConfigured: true })
          };
        }
        if (id === "@/lib/supabase/types") return {};
        throw new Error(`Unexpected import in AuthContext test: ${id}`);
      }
    });

    vm.runInContext(compiled, context);
    assert.ok(authModule.exports.AuthProvider);
    this.AuthProvider = authModule.exports.AuthProvider;
  }

  render() {
    this.pendingRender = false;
    this.hookIndex = 0;
    this.effectsToRun = [];
    const tree = this.AuthProvider({ children: null });
    this.processElement(tree);

    const effects = [...this.effectsToRun];
    this.effectsToRun = [];
    for (const index of effects) {
      const state = this.hooks[index] as {
        cleanup?: () => void;
        effect: () => void | (() => void);
      };
      state.cleanup?.();
      const cleanup = state.effect();
      if (typeof cleanup === "function") state.cleanup = cleanup;
    }
  }

  async flush(cycles = 12) {
    for (let i = 0; i < cycles; i += 1) {
      await Promise.resolve();
      if (this.pendingRender) {
        this.render();
      }
    }
    if (this.pendingRender) {
      this.render();
    }
  }

  emitAuthState(session: SessionMock | null) {
    assert.equal(this.authCallbacks.length, 1);
    this.authCallbacks[0](session ? "SIGNED_IN" : "SIGNED_OUT", session);
  }

  private processElement(element: unknown) {
    if (!element) return;
    if (Array.isArray(element)) {
      element.forEach((child) => this.processElement(child));
      return;
    }
    if (typeof element !== "object") return;
    const node = element as { type?: unknown; props?: Record<string, unknown> };
    if (node.type === this.jsxRuntime.Fragment) {
      this.processElement(node.props?.children);
      return;
    }
    if (typeof node.type === "function") {
      this.processElement(node.type(node.props ?? {}));
    }
  }
}

test("탈퇴 상태 회원의 남은 클라이언트 세션을 종료한다", () => {
  assert.match(source, /m\?\.status === ["']withdrawn["']/u);
  assert.match(source, /auth\.signOut\(\)/u);
  assert.match(source, /setUser\(null\)/u);
  assert.match(source, /setSession\(null\)/u);
});

test("로그아웃 직전 시작된 회원 정보 요청은 로그아웃 이후 상태를 다시 채우지 않는다", () => {
  assert.match(source, /activeUserIdRef/u);
  assert.match(source, /loadGenerationRef/u);
  assert.match(source, /if \(\s*activeUserIdRef\.current !== userId/u);
  assert.match(source, /loadGenerationRef\.current \+= 1/u);
});

test("로그아웃 뒤 늦게 도착한 초기 세션 응답을 무시한다", () => {
  assert.match(source, /const sessionGeneration = loadGenerationRef\.current/u);
  assert.match(
    source,
    /getSession\(\)\.then\([\s\S]*loadGenerationRef\.current !== sessionGeneration[\s\S]*return/u
  );
});

test("로그아웃 후 늦게 도착한 member와 preferences가 개인정보를 복원하지 않는다", async () => {
  const getSession = createDeferred<{ data: { session: SessionMock | null } }>();
  const harness = new AuthProviderHarness(getSession);

  getSession.resolve({ data: { session: sessionFor("user-a") } });
  await harness.flush();

  assert.equal(harness.value?.user?.id, "user-a");
  assert.deepEqual(harness.fetchMemberCalls, ["user-a"]);
  assert.deepEqual(harness.fetchPreferencesCalls, ["user-a"]);

  await harness.value?.signOut();
  await harness.flush();

  assert.equal(harness.value?.user, null);
  assert.equal(harness.value?.member, null);
  assert.equal(harness.value?.preferences, null);

  harness.memberRequests.get("user-a")?.resolve(memberFor("user-a", "이전 사용자"));
  harness.preferencesRequests.get("user-a")?.resolve(preferencesFor("user-a"));
  await harness.flush();

  assert.equal(harness.value?.user, null);
  assert.equal(harness.value?.session, null);
  assert.equal(harness.value?.member, null);
  assert.equal(harness.value?.preferences, null);
});

test("로그아웃 완료 뒤 늦게 도착한 getSession이 user와 member를 다시 채우지 않는다", async () => {
  const getSession = createDeferred<{ data: { session: SessionMock | null } }>();
  const harness = new AuthProviderHarness(getSession);

  await harness.value?.signOut();
  await harness.flush();

  getSession.resolve({ data: { session: sessionFor("user-a") } });
  await harness.flush();

  assert.equal(harness.value?.user, null);
  assert.equal(harness.value?.session, null);
  assert.equal(harness.value?.member, null);
  assert.equal(harness.value?.preferences, null);
  assert.deepEqual(harness.fetchMemberCalls, []);
  assert.deepEqual(harness.fetchPreferencesCalls, []);
});

test("사용자 A의 늦은 응답은 사용자 B의 회원 정보를 덮어쓰지 않는다", async () => {
  const getSession = createDeferred<{ data: { session: SessionMock | null } }>();
  const harness = new AuthProviderHarness(getSession);

  getSession.resolve({ data: { session: null } });
  await harness.flush();

  harness.emitAuthState(sessionFor("user-a"));
  await harness.flush();
  harness.emitAuthState(sessionFor("user-b"));
  await harness.flush();

  assert.deepEqual(harness.fetchMemberCalls, ["user-a", "user-b"]);
  assert.deepEqual(harness.fetchPreferencesCalls, ["user-a", "user-b"]);

  harness.memberRequests.get("user-b")?.resolve(memberFor("user-b", "새 사용자"));
  harness.preferencesRequests.get("user-b")?.resolve(preferencesFor("user-b"));
  await harness.flush();

  assert.equal(harness.value?.user?.id, "user-b");
  assert.equal(harness.value?.member?.auth_user_id, "user-b");
  assert.equal(harness.value?.member?.nickname, "새 사용자");
  assert.equal(harness.value?.preferences?.user_id, "user-b");

  harness.memberRequests.get("user-a")?.resolve(memberFor("user-a", "이전 사용자"));
  harness.preferencesRequests.get("user-a")?.resolve(preferencesFor("user-a"));
  await harness.flush();

  assert.equal(harness.value?.user?.id, "user-b");
  assert.equal(harness.value?.member?.auth_user_id, "user-b");
  assert.equal(harness.value?.member?.nickname, "새 사용자");
  assert.equal(harness.value?.preferences?.user_id, "user-b");
});

test("의도적 로그아웃 이후에는 SIGNED_IN 전까지 user 세션을 다시 심지 않는다", () => {
  assert.match(source, /suppressStaleSessionRef/u);
  assert.match(source, /suppressStaleSessionRef\.current = true/u);
  assert.match(source, /suppressStaleSessionRef\.current && event !== ["']SIGNED_IN["']/u);
});
