import assert from "node:assert/strict";
import test from "node:test";
import {
  HOME_EXIT_GUARD_STATE_KEY,
  hasHomeExitGuardState,
  installHomeBackExitGuard,
  isAppLikeRuntime,
  isHomePath,
  shouldConfirmHomeBackExit,
  shouldEnableHomeExitGuard,
  withHomeExitGuardState
} from "./homeBackExit.ts";

function createFakeWindow() {
  const listeners = new Set<(event: PopStateEvent) => void>();
  const fakeLocation = {
    href: "https://dadaeyu.vercel.app/",
    pathname: "/"
  };
  let state: unknown = null;
  const fakeDocument = {
    querySelector: (): HTMLButtonElement | null => null
  };
  const fakeWindow = {
    document: fakeDocument,
    location: fakeLocation,
    history: {
      get state() {
        return state;
      },
      pushState(nextState: unknown, _unused: string, url?: string | URL | null) {
        state = nextState;
        if (url) fakeLocation.href = String(url);
      },
      replaceState(nextState: unknown, _unused: string, url?: string | URL | null) {
        state = nextState;
        if (url) {
          const nextUrl = new URL(String(url), fakeLocation.href);
          fakeLocation.href = nextUrl.href;
          fakeLocation.pathname = nextUrl.pathname;
        }
      },
      back() {}
    },
    confirm: () => false,
    addEventListener(_type: "popstate", listener: (event: PopStateEvent) => void) {
      listeners.add(listener);
    },
    removeEventListener(_type: "popstate", listener: (event: PopStateEvent) => void) {
      listeners.delete(listener);
    },
    dispatchPopState(nextState: unknown) {
      const event = { state: nextState } as PopStateEvent;
      for (const listener of [...listeners]) listener(event);
    }
  };

  return fakeWindow as typeof fakeWindow & Window;
}

test("home back exit guard only runs on the home path in app-like runtimes", () => {
  assert.equal(isHomePath("/"), true);
  assert.equal(isHomePath(""), true);
  assert.equal(isHomePath("/map"), false);

  assert.equal(isAppLikeRuntime({ standalone: true, userAgent: "Mozilla/5.0" }), true);
  assert.equal(isAppLikeRuntime({ standalone: false, userAgent: "Mozilla/5.0 Android" }), true);
  assert.equal(isAppLikeRuntime({ standalone: false, userAgent: "Mozilla/5.0 Macintosh" }), false);

  assert.equal(
    shouldEnableHomeExitGuard({ pathname: "/", standalone: false, userAgent: "Android" }),
    true
  );
  assert.equal(
    shouldEnableHomeExitGuard({ pathname: "/course", standalone: true, userAgent: "Android" }),
    false
  );
});

test("home back exit guard preserves existing history state and marks its sentinel", () => {
  const state = withHomeExitGuardState({ scroll: 120 });

  assert.equal(hasHomeExitGuardState(state), true);
  assert.equal(state?.scroll, 120);
  assert.equal(state?.[HOME_EXIT_GUARD_STATE_KEY], true);
});

test("home back exit guard confirms only when back leaves the sentinel on home", () => {
  assert.equal(
    shouldConfirmHomeBackExit({
      pathname: "/",
      state: null,
      standalone: false,
      userAgent: "Mozilla/5.0 Android"
    }),
    true
  );
  assert.equal(
    shouldConfirmHomeBackExit({
      pathname: "/",
      state: withHomeExitGuardState(null),
      standalone: false,
      userAgent: "Mozilla/5.0 Android"
    }),
    false
  );
  assert.equal(
    shouldConfirmHomeBackExit({
      pathname: "/map",
      state: null,
      standalone: true,
      userAgent: "Mozilla/5.0 Android"
    }),
    false
  );
});

test("home back exit guard restores sentinel when the user cancels exit", () => {
  const window = createFakeWindow();
  let confirmCount = 0;
  let backCount = 0;
  window.confirm = () => {
    confirmCount += 1;
    return false;
  };
  window.history.back = () => {
    backCount += 1;
  };

  const cleanup = installHomeBackExitGuard({
    window,
    pathname: "/",
    standalone: true,
    userAgent: "Mozilla/5.0 Android",
    confirmMessage: "앱을 종료하시겠습니까?"
  });

  window.dispatchPopState(null);

  assert.equal(confirmCount, 1);
  assert.equal(backCount, 0);
  assert.equal(hasHomeExitGuardState(window.history.state), true);
  cleanup();
});

test("home back exit guard delegates confirmed exit to browser history", () => {
  const window = createFakeWindow();
  let confirmCount = 0;
  let backCount = 0;
  window.confirm = () => {
    confirmCount += 1;
    return true;
  };
  window.history.back = () => {
    backCount += 1;
  };

  const cleanup = installHomeBackExitGuard({
    window,
    pathname: "/",
    standalone: true,
    userAgent: "Mozilla/5.0 Android",
    confirmMessage: "앱을 종료하시겠습니까?"
  });

  window.dispatchPopState(null);
  window.dispatchPopState(null);

  assert.equal(confirmCount, 1);
  assert.equal(backCount, 1);
  cleanup();
});

test("home back exit guard closes home dialogs before showing exit confirmation", () => {
  const window = createFakeWindow();
  let closeCount = 0;
  let confirmCount = 0;
  window.document.querySelector = () =>
    ({
      click() {
        closeCount += 1;
      }
    }) as HTMLButtonElement;
  window.confirm = () => {
    confirmCount += 1;
    return true;
  };

  const cleanup = installHomeBackExitGuard({
    window,
    pathname: "/",
    standalone: true,
    userAgent: "Mozilla/5.0 Android",
    confirmMessage: "앱을 종료하시겠습니까?"
  });

  window.dispatchPopState(null);

  assert.equal(closeCount, 1);
  assert.equal(confirmCount, 0);
  assert.equal(hasHomeExitGuardState(window.history.state), true);
  cleanup();
});

test("home back exit guard does not intercept back after leaving home", () => {
  const window = createFakeWindow();
  let confirmCount = 0;
  window.confirm = () => {
    confirmCount += 1;
    return true;
  };

  const cleanup = installHomeBackExitGuard({
    window,
    pathname: "/",
    standalone: true,
    userAgent: "Mozilla/5.0 Android",
    confirmMessage: "앱을 종료하시겠습니까?"
  });

  window.history.replaceState(null, "", "/map");
  window.dispatchPopState(null);

  assert.equal(confirmCount, 0);
  cleanup();
});
