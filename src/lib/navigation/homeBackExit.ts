export const HOME_EXIT_GUARD_STATE_KEY = "__dadaeyuHomeExitGuard";

type HistoryState = Record<string, unknown> | null;

export function isHomePath(pathname: string): boolean {
  return pathname === "/" || pathname === "";
}

export function isAppLikeRuntime({
  standalone,
  userAgent
}: {
  standalone: boolean;
  userAgent: string;
}): boolean {
  return standalone || /\bAndroid\b/iu.test(userAgent);
}

export function shouldEnableHomeExitGuard({
  pathname,
  standalone,
  userAgent
}: {
  pathname: string;
  standalone: boolean;
  userAgent: string;
}): boolean {
  return isHomePath(pathname) && isAppLikeRuntime({ standalone, userAgent });
}

export function hasHomeExitGuardState(state: unknown): boolean {
  return Boolean(state && typeof state === "object" && HOME_EXIT_GUARD_STATE_KEY in state);
}

export function withHomeExitGuardState(state: unknown): HistoryState {
  const base = state && typeof state === "object" ? state : {};
  return {
    ...base,
    [HOME_EXIT_GUARD_STATE_KEY]: true
  };
}

export function shouldConfirmHomeBackExit({
  pathname,
  state,
  standalone,
  userAgent
}: {
  pathname: string;
  state: unknown;
  standalone: boolean;
  userAgent: string;
}): boolean {
  return (
    shouldEnableHomeExitGuard({ pathname, standalone, userAgent }) && !hasHomeExitGuardState(state)
  );
}

export function closeTopHomeOverlay(document: Document): boolean {
  const closeButton = document.querySelector<HTMLButtonElement>(
    'dialog[open] button[aria-label="채팅창 닫기"], dialog[open] button[aria-label="장소 정보 닫기"]'
  );
  if (!closeButton) return false;

  closeButton.click();
  return true;
}

export function installHomeBackExitGuard({
  window,
  pathname,
  standalone,
  userAgent,
  confirmMessage
}: {
  window: Window;
  pathname: string;
  standalone: boolean;
  userAgent: string;
  confirmMessage: string;
}): () => void {
  if (!shouldEnableHomeExitGuard({ pathname, standalone, userAgent })) return () => {};

  const pushGuardState = () => {
    if (hasHomeExitGuardState(window.history.state)) return;
    window.history.pushState(
      withHomeExitGuardState(window.history.state),
      "",
      window.location.href
    );
  };

  const onPopState = (event: PopStateEvent) => {
    if (
      !shouldConfirmHomeBackExit({
        pathname: window.location.pathname,
        state: event.state,
        standalone,
        userAgent
      })
    ) {
      return;
    }

    if (closeTopHomeOverlay(window.document)) {
      pushGuardState();
      return;
    }

    if (window.confirm(confirmMessage)) {
      window.removeEventListener("popstate", onPopState);
      window.history.back();
      return;
    }

    pushGuardState();
  };

  pushGuardState();
  window.addEventListener("popstate", onPopState);

  return () => {
    window.removeEventListener("popstate", onPopState);
  };
}
