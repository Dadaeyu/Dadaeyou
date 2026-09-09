"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import AuthLayout from "@/components/AuthLayout";
import { createClient } from "@/lib/supabase/client";
import { getSafeNextPath } from "@/lib/auth/paths";
import { resolvePostLoginPath, callEnsureMember } from "@/lib/auth/actions";

function isOtpType(value: string | null): value is "signup" | "email" | "recovery" | "invite" {
  return value === "signup" || value === "email" || value === "recovery" || value === "invite";
}

function ConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = getSafeNextPath(searchParams.get("next"), "/mypage");
  const isOAuthCode = !!(code && !tokenHash);

  useEffect(() => {
    if (!isOAuthCode) return;
    const callback = new URL("/auth/callback", window.location.origin);
    searchParams.forEach((value, key) => callback.searchParams.set(key, value));
    window.location.replace(callback.toString());
  }, [isOAuthCode, searchParams]);

  if (isOAuthCode) {
    return (
      <AuthLayout title="로그인 처리 중" subtitle="소셜 로그인 정보를 확인하고 있어요">
        <p className="text-stone text-center text-sm">잠시만 기다려 주세요.</p>
      </AuthLayout>
    );
  }

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canConfirm = !!(code || (tokenHash && isOtpType(type)));

  const finishConfirm = async (destNext?: string) => {
    const ensured = await callEnsureMember();
    if (!ensured) {
      throw new Error("프로필 동기화에 실패했습니다. 잠시 후 다시 시도해 주세요.");
    }
    const dest = await resolvePostLoginPath(destNext ?? next);
    router.push(dest);
    router.refresh();
  };

  const handleConfirm = async () => {
    if (!canConfirm) {
      setMessage("유효하지 않은 인증 링크입니다.");
      return;
    }

    setLoading(true);
    setMessage(null);

    try {
      if (tokenHash && isOtpType(type)) {
        const res = await fetch("/api/auth/confirm-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            token_hash: tokenHash,
            type,
            next
          })
        });

        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          code?: string;
          next?: string;
        };

        if (!res.ok) {
          throw { message: data.error, code: data.code };
        }

        await finishConfirm(data.next);
      } else if (code) {
        const supabase = createClient();
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) throw error;
        await finishConfirm();
      }
    } catch (err) {
      const authErr =
        err && typeof err === "object" ? (err as { message?: string; code?: string }) : {};
      const msg = authErr.message ?? "";

      const supabase = createClient();
      const {
        data: { user }
      } = await supabase.auth.getUser();
      if (user?.email_confirmed_at) {
        await finishConfirm();
        return;
      }

      if (
        msg.includes("PKCE") ||
        msg.includes("code verifier") ||
        msg.includes("different browser")
      ) {
        setMessage(
          "인증 링크가 만료되었거나 다른 환경에서 열렸을 수 있습니다. 로그인 화면에서 「인증 메일 다시 받기」를 눌러 주세요."
        );
      } else if (
        msg.includes("expired") ||
        msg.includes("invalid") ||
        msg.includes("already been used") ||
        authErr.code === "otp_expired"
      ) {
        setMessage(
          "인증 링크가 만료되었거나 이미 사용되었습니다. 로그인을 시도하거나 인증 메일을 다시 받아 주세요."
        );
      } else {
        setMessage(msg || "인증에 실패했습니다. 잠시 후 다시 시도해 주세요.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (!canConfirm) {
    return (
      <AuthLayout title="인증 링크 오류" subtitle="링크가 올바르지 않거나 만료되었습니다">
        <p className="text-center text-sm text-gray-500">
          메일함에서 최신 인증 메일의 링크를 사용해 주세요.
        </p>
        <Link
          href="/login"
          className="bg-brand-600 hover:bg-brand-700 block w-full rounded-xl py-2.5 text-center text-sm font-semibold text-white"
        >
          로그인으로 이동
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="이메일 인증" subtitle="아래 버튼을 눌러 가입을 완료해 주세요">
      <p className="text-center text-xs text-gray-500">
        메일 앱이 링크를 미리 열어 실패하는 경우가 있어, 버튼을 눌러야 인증이 완료됩니다.
      </p>
      <button
        type="button"
        onClick={handleConfirm}
        disabled={loading}
        className="bg-brand-600 hover:bg-brand-700 w-full rounded-xl py-2.5 text-sm font-semibold text-white disabled:opacity-50"
      >
        {loading ? "인증 중..." : "이메일 인증 완료하기"}
      </button>
      {message && (
        <div className="space-y-2">
          <p className="text-center text-sm text-red-600" role="alert">
            {message}
          </p>
          <p className="text-center text-xs text-gray-500">
            이미 인증했다면{" "}
            <Link href="/login" className="text-brand-600 hover:underline">
              로그인
            </Link>
            을 시도해 주세요.
          </p>
        </div>
      )}
    </AuthLayout>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={<div className="py-20 text-center text-gray-500">로딩 중...</div>}>
      <ConfirmForm />
    </Suspense>
  );
}
