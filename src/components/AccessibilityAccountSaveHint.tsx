"use client";

import {
  getAccessibilityAccountSaveHint,
  type AccessibilityAccountSaveStatus
} from "@/lib/accessibility-account-save";

export default function AccessibilityAccountSaveHint({
  status,
  loggedIn,
  saving,
  onRetry
}: {
  status: AccessibilityAccountSaveStatus;
  loggedIn: boolean;
  saving: boolean;
  onRetry: () => void;
}) {
  const hint = getAccessibilityAccountSaveHint(status, loggedIn);
  const toneClass =
    hint.tone === "error"
      ? "text-red-600"
      : hint.tone === "success"
        ? "text-brand-700"
        : "text-stone";

  return (
    <div className="mb-3 space-y-2" aria-live="polite">
      <p className={`text-xs ${toneClass}`} role={hint.tone === "error" ? "alert" : undefined}>
        {hint.text}
      </p>
      {hint.showRetry ? (
        <button
          type="button"
          onClick={onRetry}
          disabled={saving}
          className="border-hairline text-ink hover:bg-surface-soft rounded-lg border bg-white px-3 py-1.5 text-xs font-semibold disabled:opacity-60"
        >
          {saving ? "다시 저장하는 중…" : "다시 저장"}
        </button>
      ) : null}
    </div>
  );
}
