export const A11Y_ACCOUNT_PENDING_KEY = "dadaeyu-a11y-account-pending";

type PendingAccessibilityState = {
  darkMode: boolean;
  highContrast: boolean;
  fontScale: number;
  readAloud: boolean;
  easyMode: boolean;
};

function normalizePendingState(
  state: Partial<PendingAccessibilityState> | undefined
): PendingAccessibilityState {
  const fontScale = Number(state?.fontScale);
  const stepped = Number.isFinite(fontScale) ? Math.round(fontScale / 10) * 10 : 100;
  return {
    darkMode: Boolean(state?.darkMode),
    highContrast: Boolean(state?.highContrast),
    fontScale: Math.min(200, Math.max(100, stepped)),
    readAloud: Boolean(state?.readAloud),
    easyMode: Boolean(state?.easyMode)
  };
}

export type AccessibilityAccountSaveStatus = "idle" | "saving" | "saved" | "error";

export type AccessibilityAccountSaveHint = {
  text: string;
  tone: "info" | "success" | "error";
  showRetry: boolean;
};

export function getAccessibilityAccountSaveHint(
  status: AccessibilityAccountSaveStatus,
  loggedIn: boolean
): AccessibilityAccountSaveHint {
  if (!loggedIn) {
    return {
      text: "변경 내용은 바로 적용되며 이 기기에만 저장됩니다.",
      tone: "info",
      showRetry: false
    };
  }

  if (status === "saving") {
    return { text: "계정에 저장하는 중…", tone: "info", showRetry: false };
  }

  if (status === "saved") {
    return { text: "계정에 저장되었습니다.", tone: "success", showRetry: false };
  }

  if (status === "error") {
    return {
      text: "계정 저장에 실패했습니다. 이 기기에는 적용됐지만 다른 기기에는 반영되지 않습니다.",
      tone: "error",
      showRetry: true
    };
  }

  return {
    text: "변경 내용은 바로 적용되며 계정에 저장됩니다.",
    tone: "info",
    showRetry: false
  };
}

type PendingAccountSave = {
  userId: string;
  state: PendingAccessibilityState;
};

function readPendingRecord(): PendingAccountSave | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(A11Y_ACCOUNT_PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as {
      userId?: unknown;
      state?: Partial<PendingAccessibilityState>;
    };
    if (typeof parsed.userId !== "string" || !parsed.userId) return null;
    return {
      userId: parsed.userId,
      state: normalizePendingState(parsed.state)
    };
  } catch {
    return null;
  }
}

export function readPendingAccessibilityAccountSave(
  userId: string
): PendingAccessibilityState | null {
  const pending = readPendingRecord();
  return pending?.userId === userId ? pending.state : null;
}

export function markAccessibilityAccountSavePending(
  userId: string,
  state: PendingAccessibilityState
): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    A11Y_ACCOUNT_PENDING_KEY,
    JSON.stringify({ userId, state } satisfies PendingAccountSave)
  );
}

export function clearAccessibilityAccountSavePending(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(A11Y_ACCOUNT_PENDING_KEY);
}
