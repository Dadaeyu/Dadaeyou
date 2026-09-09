"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { signInWithEmail, updatePassword } from "@/lib/auth/actions";
import { mapAuthError } from "@/lib/auth/errors";
import {
  getPasswordValidationError,
  isPasswordValid,
  PASSWORD_RULES_HINT
} from "@/lib/auth/password";
import { Button } from "@/components/ui/Button";
import { hasEmailPasswordAuth } from "@/lib/auth/auth-kind";
import { displayEmailFromAuthUser } from "@/lib/auth/display-email";

const inputClass =
  "border-hairline bg-background text-ink placeholder:text-stone focus:ring-brand-500 w-full rounded-lg border px-3 py-2 text-sm focus:ring-2 focus:outline-none";

export function AccountSection() {
  const { user, member, signOut } = useAuth();
  const router = useRouter();
  const [signingOut, setSigningOut] = useState(false);

  const canChangePassword = useMemo(() => hasEmailPasswordAuth(user), [user]);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      router.push("/");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setPasswordError("이메일 정보를 확인할 수 없습니다.");
      return;
    }

    if (!currentPassword) {
      setPasswordError("현재 비밀번호를 입력해 주세요.");
      return;
    }

    const validationError = getPasswordValidationError(newPassword);
    if (validationError) {
      setPasswordError(validationError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("새 비밀번호가 일치하지 않습니다.");
      return;
    }

    if (currentPassword === newPassword) {
      setPasswordError("현재 비밀번호와 다른 새 비밀번호를 입력해 주세요.");
      return;
    }

    setSavingPassword(true);
    setPasswordError(null);
    setPasswordSuccess(null);

    try {
      const { error: verifyError } = await signInWithEmail(user.email, currentPassword);
      if (verifyError) {
        const mapped = mapAuthError(verifyError);
        const looksWrongPassword =
          verifyError.code === "invalid_credentials" ||
          (verifyError.message ?? "").includes("Invalid login credentials");
        setPasswordError(looksWrongPassword ? "현재 비밀번호가 올바르지 않습니다." : mapped);
        return;
      }

      const { error } = await updatePassword(newPassword);
      if (error) {
        setPasswordError(mapAuthError(error));
        return;
      }

      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setPasswordSuccess("비밀번호가 변경되었습니다.");
    } catch (err) {
      setPasswordError(err instanceof Error ? err.message : "비밀번호 변경에 실패했습니다.");
    } finally {
      setSavingPassword(false);
    }
  };

  const canSubmitPassword =
    !!currentPassword &&
    isPasswordValid(newPassword) &&
    newPassword === confirmPassword &&
    currentPassword !== newPassword;

  return (
    <div className="max-w-xl space-y-6">
      <div className="border-hairline rounded-xl border bg-gray-50 px-4 py-3">
        <p className="text-steel text-xs font-semibold">이메일</p>
        <p className="text-ink mt-1 text-sm font-medium">{displayEmailFromAuthUser(user) || "—"}</p>
      </div>

      <div className="border-hairline rounded-xl border bg-gray-50 px-4 py-3">
        <p className="text-steel text-xs font-semibold">닉네임</p>
        <p className="text-ink mt-1 text-sm font-medium">{member?.nickname ?? "—"}</p>
      </div>

      <div className="space-y-3">
        <div>
          <p className="text-ink text-sm font-semibold">비밀번호 변경</p>
          {canChangePassword ? (
            <p className="text-stone mt-0.5 text-xs">{PASSWORD_RULES_HINT}</p>
          ) : (
            <p className="text-stone mt-0.5 text-xs">
              카카오·네이버·구글 등 소셜 로그인 계정은 이 화면에서 비밀번호를 변경할 수 없습니다.
            </p>
          )}
        </div>

        {canChangePassword && (
          <form onSubmit={(e) => void handleChangePassword(e)} className="space-y-3">
            <div>
              <label className="text-steel mb-1 block text-xs font-semibold" htmlFor="current-pw">
                현재 비밀번호
              </label>
              <input
                id="current-pw"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className={inputClass}
                disabled={savingPassword}
              />
            </div>
            <div>
              <label className="text-steel mb-1 block text-xs font-semibold" htmlFor="new-pw">
                새 비밀번호
              </label>
              <input
                id="new-pw"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className={inputClass}
                disabled={savingPassword}
              />
              {newPassword && !isPasswordValid(newPassword) && (
                <p className="mt-1 text-xs text-red-600">
                  {getPasswordValidationError(newPassword)}
                </p>
              )}
            </div>
            <div>
              <label className="text-steel mb-1 block text-xs font-semibold" htmlFor="confirm-pw">
                새 비밀번호 확인
              </label>
              <input
                id="confirm-pw"
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className={inputClass}
                disabled={savingPassword}
              />
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-xs text-red-600">비밀번호가 일치하지 않습니다.</p>
              )}
            </div>

            {passwordError && (
              <p className="text-sm text-red-600" role="alert">
                {passwordError}
              </p>
            )}
            {passwordSuccess && <p className="text-brand-700 text-sm">{passwordSuccess}</p>}

            <Button type="submit" variant="accent" disabled={savingPassword || !canSubmitPassword}>
              {savingPassword ? "변경 중…" : "비밀번호 변경"}
            </Button>
          </form>
        )}
      </div>

      <div className="border-hairline-soft space-y-3 border-t pt-5">
        <Button
          type="button"
          variant="outline"
          onClick={() => void handleSignOut()}
          disabled={signingOut}
        >
          {signingOut ? "로그아웃 중…" : "로그아웃"}
        </Button>

        <div className="border-hairline bg-surface-soft rounded-xl border px-4 py-4">
          <p className="text-ink text-sm font-semibold">회원 탈퇴</p>
          <p className="text-steel mt-1 text-xs leading-relaxed">
            탈퇴 시 계정과 개인정보가 비활성·익명 처리됩니다. 이메일 가입은 같은 주소로 다시 가입할
            수 있으며, 소셜 로그인 재가입이 되지 않으면 운영팀에 문의해 주세요.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1">
            <Link
              href="/mypage/settings/withdraw"
              className="border-hairline hover:bg-background inline-flex rounded-full border bg-transparent px-4 py-2 text-sm font-semibold text-red-600 transition-colors dark:text-red-400"
            >
              회원 탈퇴 진행
            </Link>
            <Link
              href="/account-deletion"
              className="text-steel hover:text-ink focus-visible:ring-brand-500 inline-flex rounded-sm py-2 text-sm font-semibold underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
            >
              탈퇴·계정 삭제 안내
            </Link>
          </div>
        </div>

        <Link
          href="/privacy"
          className="text-stone hover:text-ink focus-visible:ring-brand-500 mx-1 inline-flex rounded-sm py-1 text-xs underline-offset-4 transition-colors hover:underline focus-visible:ring-2 focus-visible:outline-none"
        >
          개인정보 처리방침
        </Link>
      </div>
    </div>
  );
}
