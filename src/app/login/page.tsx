"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import OAuthButtons, { AuthDivider, AuthLinks } from "@/components/AuthForms";
import {
  getSafeNextPath,
  resolvePostLoginPath,
  signInWithEmail,
  signInWithOAuth,
  type OAuthProvider
} from "@/lib/auth/actions";
import { mapAuthError } from "@/lib/auth/errors";

const REMEMBER_EMAIL_KEY = "dadaeyu:remember-email";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeNextPath(searchParams.get("next"), "/");
  const authError = searchParams.get("error");
  const authNotice = searchParams.get("notice");
  const withdrawnDone = searchParams.get("withdrawn") === "1";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(
    authError === "account_suspended"
      ? "정지된 계정입니다. 관리자에게 문의해 주세요."
      : authError === "account_withdrawn"
        ? "탈퇴한 계정입니다. 이메일 가입은 같은 주소로 다시 가입할 수 있으며, 소셜 로그인 재가입은 운영팀에 문의해 주세요."
        : authError === "naver_config"
          ? "네이버 로그인 설정이 없습니다. .env.local에 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET을 추가해 주세요."
          : authError === "email_not_provided"
            ? "네이버에서 이메일 정보를 받지 못했습니다. 네이버 개발자센터에서 이메일 제공 동의 항목을 확인해 주세요."
            : authError === "naver_provider_id"
              ? "네이버 로그인 연동 형식 오류입니다. 페이지를 새로고침한 뒤 다시 시도해 주세요."
              : authError === "email_not_confirmed"
                ? "이메일 인증이 완료되지 않았습니다. 메일함의 인증 링크를 확인해 주세요."
                : authError === "auth_callback_failed"
                  ? "소셜 로그인에 실패했습니다. 카카오·구글·네이버 버튼을 다시 눌러 주세요."
                  : null
  );
  const [notice, setNotice] = useState<string | null>(
    authNotice === "password_reset"
      ? "비밀번호가 변경되었습니다. 새 비밀번호로 로그인해 주세요."
      : authNotice === "email_confirmed"
        ? "이메일 인증이 완료되었습니다. 로그인해 주세요."
        : authNotice === "withdrawn" || withdrawnDone
          ? "회원 탈퇴가 완료되었습니다. 이용해 주셔서 감사합니다."
          : authError === "social_rejoin"
            ? "이전 소셜 연동을 해제했습니다. 같은 버튼을 다시 누르면 새 계정으로 가입됩니다."
            : authError === "social_provider_mismatch"
              ? "카카오·구글은 네이버 계정과 따로 가입됩니다. 방금 누른 버튼을 다시 누르면 새 계정으로 이어집니다."
              : null
  );

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const saved = localStorage.getItem(REMEMBER_EMAIL_KEY);
        if (saved) {
          setEmail(saved);
          setRememberEmail(true);
        }
      } catch {
        // ignore storage errors
      }
    });
  }, []);

  const handleEmailSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const emailInput = form.elements.namedItem("email") as HTMLInputElement | null;
    const submittedEmail = (emailInput?.value ?? email).trim();

    setLoading(true);
    setMessage(null);
    setNotice(null);

    try {
      const { error } = await signInWithEmail(submittedEmail, password);
      if (error) throw error;

      try {
        if (rememberEmail) {
          localStorage.setItem(REMEMBER_EMAIL_KEY, submittedEmail);
        } else {
          localStorage.removeItem(REMEMBER_EMAIL_KEY);
        }
      } catch {
        // ignore storage errors
      }

      const dest = await resolvePostLoginPath(next);
      router.push(dest);
      router.refresh();
    } catch (err) {
      setMessage(
        mapAuthError(
          err && typeof err === "object" ? (err as { message?: string; code?: string }) : {}
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: OAuthProvider) => {
    setLoading(true);
    setMessage(null);
    try {
      const { error } = await signInWithOAuth(provider, next);
      if (error) throw error;
    } catch (err) {
      setMessage(
        mapAuthError(
          err && typeof err === "object" ? (err as { message?: string; code?: string }) : {}
        )
      );
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="로그인" subtitle="다대유와 함께 무장애 여행을 시작해 보세요">
      <OAuthButtons disabled={loading} onOAuth={handleOAuth} />
      <AuthDivider />

      <form onSubmit={handleEmailSubmit} className="space-y-3">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onInput={(e) => setEmail(e.currentTarget.value)}
          placeholder="이메일"
          className="border-hairline bg-background text-ink placeholder:text-stone focus:ring-brand-500 w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:outline-none"
        />
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="비밀번호"
          className="border-hairline bg-background text-ink placeholder:text-stone focus:ring-brand-500 w-full rounded-xl border px-4 py-2.5 text-sm focus:ring-2 focus:outline-none"
        />
        <label
          className={`focus-within:ring-brand-500/30 focus-within:ring-offset-background flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm transition-all select-none focus-within:ring-2 focus-within:ring-offset-2 ${
            rememberEmail
              ? "border-brand-300 bg-brand-50 text-ink dark:border-brand-600/50 dark:bg-brand-900/25 shadow-[0_0_0_1px_rgba(0,212,164,0.12)] dark:shadow-none"
              : "border-hairline bg-surface text-steel hover:border-brand-200 hover:bg-surface-soft hover:text-ink dark:hover:border-brand-700/50"
          }`}
        >
          <input
            type="checkbox"
            checked={rememberEmail}
            onChange={(e) => setRememberEmail(e.target.checked)}
            className="sr-only"
          />
          <span
            aria-hidden
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition-all ${
              rememberEmail
                ? "border-brand-500 bg-brand-500 text-white shadow-sm"
                : "border-hairline bg-background text-transparent"
            }`}
          >
            <Check
              className={`h-3.5 w-3.5 stroke-[3] transition-all duration-150 ${
                rememberEmail ? "scale-100 opacity-100" : "scale-75 opacity-0"
              }`}
            />
          </span>
          <span className="font-medium">아이디 저장</span>
        </label>
        <button
          type="submit"
          disabled={loading}
          className="bg-brand-600 hover:bg-brand-700 w-full rounded-xl py-2.5 text-sm font-semibold text-white transition-colors disabled:opacity-50"
        >
          {loading ? "처리 중..." : "로그인"}
        </button>
      </form>

      {message && (
        <div className="space-y-2">
          <p className="text-error text-center text-sm" role="alert">
            {message}
          </p>
          {(authError === "email_not_confirmed" ||
            message.includes("이메일 인증이 완료되지 않았습니다")) && (
            <p className="text-stone text-center text-xs">
              메일이 오지 않았나요?{" "}
              <Link
                href={
                  email
                    ? `/signup/check-email?email=${encodeURIComponent(email)}`
                    : "/signup/check-email"
                }
                className="text-brand-600 hover:underline"
              >
                인증 메일 다시 받기
              </Link>
            </p>
          )}
        </div>
      )}
      {notice && (
        <p className="text-center text-sm text-green-600" role="status">
          {notice}
        </p>
      )}

      <AuthLinks variant="login" />
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-500">로딩 중...</div>}>
      <LoginForm />
    </Suspense>
  );
}
