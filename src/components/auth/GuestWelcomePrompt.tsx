"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bookmark, Heart, Route, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  getGuestWelcomeTodayKey,
  GUEST_WELCOME_SESSION_STORAGE_KEY,
  GUEST_WELCOME_SNOOZE_STORAGE_KEY,
  isGuestWelcomeEligiblePath,
  isGuestWelcomeSnoozedToday,
  shouldShowGuestWelcome
} from "@/lib/auth/guestWelcome";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export function GuestWelcomePrompt({ blocked = false }: { blocked?: boolean }) {
  const pathname = usePathname();
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);
  const [dismissedForEntry, setDismissedForEntry] = useState(false);
  const [dismissedForSession, setDismissedForSession] = useState(false);
  const [snoozeResolved, setSnoozeResolved] = useState(false);
  const [snoozedToday, setSnoozedToday] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      let storedDate: string | null = null;
      let storedSessionDismissal: string | null = null;

      try {
        storedDate = window.localStorage.getItem(GUEST_WELCOME_SNOOZE_STORAGE_KEY);
      } catch {
        // 저장소를 사용할 수 없어도 로그인 안내는 정상적으로 표시한다.
      }

      try {
        storedSessionDismissal = window.sessionStorage.getItem(GUEST_WELCOME_SESSION_STORAGE_KEY);
      } catch {
        // 세션 저장소를 사용할 수 없어도 현재 진입 닫힘 상태로만 처리한다.
      }

      setSnoozedToday(isGuestWelcomeSnoozedToday(storedDate));
      setDismissedForSession(storedSessionDismissal === "1");
      setSnoozeResolved(true);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, []);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      const shouldOpen = shouldShowGuestWelcome({
        authLoading: loading,
        hasUser: Boolean(user),
        eligiblePath: isGuestWelcomeEligiblePath(pathname),
        blockedByNotice: blocked,
        dismissedForEntry,
        dismissedForSession,
        snoozeResolved,
        snoozedToday
      });

      if (!shouldOpen) {
        setOpen(false);
        return;
      }

      setOpen(true);
    }, 0);

    return () => window.clearTimeout(timerId);
  }, [
    blocked,
    dismissedForEntry,
    dismissedForSession,
    loading,
    pathname,
    snoozeResolved,
    snoozedToday,
    user
  ]);

  useEffect(() => {
    if (!open) return;
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, [open]);

  if (!open) return null;

  const nextPath = pathname || "/";
  const closePrompt = () => {
    setDismissedForEntry(true);
    setOpen(false);
  };
  const continueWithoutLogin = () => {
    try {
      window.sessionStorage.setItem(GUEST_WELCOME_SESSION_STORAGE_KEY, "1");
    } catch {
      // 세션 저장소를 사용할 수 없으면 현재 홈 진입에서만 닫는다.
    }

    setDismissedForSession(true);
    closePrompt();
  };
  const snoozePromptToday = () => {
    try {
      window.localStorage.setItem(GUEST_WELCOME_SNOOZE_STORAGE_KEY, getGuestWelcomeTodayKey());
    } catch {
      // 저장소를 사용할 수 없으면 현재 홈 진입에서만 닫는다.
    }

    setSnoozedToday(true);
    closePrompt();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="guest-welcome-title"
      aria-describedby="guest-welcome-description"
      onCancel={(event) => {
        event.preventDefault();
        closePrompt();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closePrompt();
      }}
      className="backdrop:bg-ink/55 fixed inset-0 m-0 h-[100dvh] max-h-none w-screen max-w-none items-end justify-center bg-transparent p-4 backdrop:backdrop-blur-[2px] open:flex sm:items-center sm:p-6"
    >
      <Card
        className="border-hairline w-full max-w-md overflow-hidden rounded-[1.5rem] border bg-white p-0 shadow-[0_28px_80px_-28px_rgba(7,40,34,0.7)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="from-navy-900 to-brand-800 relative overflow-hidden bg-gradient-to-br px-5 pt-5 pb-6 text-white sm:px-7 sm:pt-6">
          <div
            className="absolute -top-12 -right-10 h-36 w-36 rounded-full bg-white/10"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={closePrompt}
            className="absolute top-3 right-3 grid h-12 w-12 place-items-center rounded-full text-white/85 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            aria-label="로그인 안내 닫기"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>

          <span className="border-brand-200/50 bg-brand-100/15 text-brand-50 inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-semibold">
            다대유를 더 편하게 이용해 보세요
          </span>
          <h2
            id="guest-welcome-title"
            className="relative mt-4 max-w-sm text-[1.55rem] leading-tight font-extrabold tracking-[-0.03em] break-keep sm:text-[1.7rem]"
          >
            여행을 저장하고 이어서 보세요
          </h2>
          <p
            id="guest-welcome-description"
            className="text-brand-50/85 relative mt-3 max-w-sm text-sm leading-6 break-keep"
          >
            로그인하면 마음에 든 장소와 코스를 저장하고, 다음 방문 계획도 이어서 볼 수 있어요.
          </p>
        </div>

        <div className="p-5 sm:p-7">
          <ul className="grid gap-3 text-sm font-medium text-gray-700" aria-label="회원 이용 혜택">
            <li className="flex min-h-11 items-center gap-3">
              <span className="bg-brand-50 text-brand-800 grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                <Heart className="h-5 w-5" aria-hidden="true" />
              </span>
              마음에 든 장소와 코스 즐겨찾기
            </li>
            <li className="flex min-h-11 items-center gap-3">
              <span className="bg-brand-50 text-brand-800 grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                <Bookmark className="h-5 w-5" aria-hidden="true" />
              </span>
              나에게 필요한 이동 편의 조건 저장
            </li>
            <li className="flex min-h-11 items-center gap-3">
              <span className="bg-brand-50 text-brand-800 grid h-10 w-10 shrink-0 place-items-center rounded-xl">
                <Route className="h-5 w-5" aria-hidden="true" />
              </span>
              코스 후기 작성과 내 여행 관리
            </li>
          </ul>

          <div className="mt-6 grid gap-2.5 sm:grid-cols-2">
            <Button asChild variant="accent" className="min-h-12 text-sm font-bold">
              <Link href={`/login?next=${encodeURIComponent(nextPath)}`} onClick={closePrompt}>
                로그인
              </Link>
            </Button>
            <Button asChild variant="outline" className="min-h-12 text-sm font-bold">
              <Link href={`/signup?next=${encodeURIComponent(nextPath)}`} onClick={closePrompt}>
                회원가입
              </Link>
            </Button>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={continueWithoutLogin}
              className="text-steel hover:text-ink min-h-12 rounded-xl px-3 text-sm font-semibold underline-offset-4 transition-colors hover:bg-gray-50 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              로그인 없이 둘러보기
            </button>
            <button
              type="button"
              onClick={snoozePromptToday}
              className="text-steel hover:text-ink min-h-12 rounded-xl bg-gray-50 px-3 text-sm font-semibold transition-colors hover:bg-gray-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gray-900"
            >
              오늘 하루 안 보기
            </button>
          </div>
        </div>
      </Card>
    </dialog>
  );
}
