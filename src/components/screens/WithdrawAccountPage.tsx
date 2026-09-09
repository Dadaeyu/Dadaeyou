"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { Button } from "@/components/ui/Button";
import { hasEmailPasswordAuth } from "@/lib/auth/auth-kind";
import { WITHDRAW_CONFIRM_TEXT } from "@/lib/auth/withdraw";

const inputClass =
  "border-hairline bg-background text-ink placeholder:text-stone focus:ring-brand-500 w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none";

export function WithdrawAccountPage() {
  const { user, member, signOut } = useAuth();
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const isEmailUser = hasEmailPasswordAuth(user);
  const canSubmit = isEmailUser
    ? password.length > 0
    : confirmText.trim() === WITHDRAW_CONFIRM_TEXT;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(isEmailUser ? { password } : { confirmText: confirmText.trim() })
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "탈퇴 처리에 실패했습니다.");
        return;
      }
      await signOut().catch(() => {});
      window.location.replace("/login?notice=withdrawn");
      return;
    } catch {
      setError("네트워크 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-lg px-4 py-8 sm:px-6">
      <Link
        href="/mypage/settings"
        className="text-steel hover:text-ink text-sm font-medium transition-colors"
      >
        ← 계정 설정으로
      </Link>

      <h1 className="text-ink mt-4 text-2xl font-bold tracking-tight">회원 탈퇴</h1>
      <p className="text-steel mt-2 text-sm leading-relaxed">
        {member?.nickname ? `${member.nickname}님, ` : ""}탈퇴 전에 아래 내용을 꼭 확인해 주세요.
      </p>

      <div className="border-hairline bg-surface-soft mt-6 rounded-xl border px-4 py-4" role="note">
        <p className="text-ink text-sm font-semibold">탈퇴 시 안내</p>
        <ul className="text-steel mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed">
          <li>계정으로 다시 로그인할 수 없습니다.</li>
          <li>닉네임·이메일·전화번호 등 개인정보는 삭제(익명화)됩니다.</li>
          <li>
            작성하신 게시글·댓글은 커뮤니티에 남으며, 작성자는 「탈퇴한 회원」으로 표시됩니다.
          </li>
          <li>즐겨찾기·좋아요 등 개인 활동 기록은 함께 삭제됩니다.</li>
          <li>이 작업은 되돌릴 수 없습니다.</li>
        </ul>
      </div>

      <form onSubmit={handleSubmit} className="mt-8 space-y-4">
        {isEmailUser ? (
          <label className="block space-y-1.5">
            <span className="text-ink text-sm font-medium">비밀번호 확인</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputClass}
              placeholder="현재 비밀번호"
              required
            />
          </label>
        ) : (
          <label className="block space-y-1.5">
            <span className="text-ink text-sm font-medium">
              확인을 위해{" "}
              <span className="font-semibold text-red-600 dark:text-red-400">
                {WITHDRAW_CONFIRM_TEXT}
              </span>{" "}
              를 입력해 주세요
            </span>
            <input
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className={inputClass}
              placeholder={WITHDRAW_CONFIRM_TEXT}
              autoComplete="off"
              required
            />
          </label>
        )}

        {error ? (
          <p className="text-sm text-red-600 dark:text-red-400" role="alert">
            {error}
          </p>
        ) : null}

        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            className="text-ink order-2 sm:order-1"
            onClick={() => router.push("/mypage/settings")}
            disabled={submitting}
          >
            취소
          </Button>
          <Button
            type="submit"
            variant="destructive"
            className="order-1 sm:order-2"
            disabled={!canSubmit || submitting}
          >
            {submitting ? "처리 중…" : "탈퇴하기"}
          </Button>
        </div>
      </form>
    </div>
  );
}
