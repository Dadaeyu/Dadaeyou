"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { LogIn, LogOut, Settings } from "lucide-react";
import { DesktopNav } from "./Navigation";
import AccessibilitySettings from "../AccessibilitySettings";
import { Button } from "../ui/Button";
import { useAccessibility } from "@/context/AccessibilityContext";
import { useOptionalAuth } from "@/context/AuthContext";

export default function Header() {
  const [showAccessibility, setShowAccessibility] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const auth = useOptionalAuth();
  const pathname = usePathname();
  const router = useRouter();
  const { easyMode } = useAccessibility();

  const handleLogout = async () => {
    if (!auth?.signOut || loggingOut) return;
    setLoggingOut(true);
    try {
      await auth.signOut();
      router.push("/");
    } finally {
      setLoggingOut(false);
    }
  };

  if (pathname === "/" && easyMode) return null;

  return (
    <header className="border-hairline bg-background/85 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="relative mx-auto flex h-16 max-w-7xl items-center gap-2 px-3 sm:px-4 lg:gap-4 lg:px-6">
        {/* 브랜드 로고 — 마크(위치핀+하트) + 워드마크 */}
        <Link
          href="/"
          replace
          className="group flex min-h-12 shrink-0 items-center gap-2.5"
          aria-label="다대유 - 대전 무장애 여행 홈"
        >
          <span className="bg-brand-500 relative inline-flex h-9 w-9 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-105">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
              <path
                d="M12 21.5s-6.6-5.6-6.6-10.8A6.6 6.6 0 0 1 12 4.1a6.6 6.6 0 0 1 6.6 6.6c0 5.2-6.6 10.8-6.6 10.8Z"
                fill="white"
              />
              <path
                d="M12 13.9c-1.9-1.4-3.1-2.3-3.1-3.7 0-.95.74-1.7 1.68-1.7.55 0 1.07.27 1.42.69.35-.42.87-.69 1.42-.69.94 0 1.68.75 1.68 1.7 0 1.4-1.2 2.3-3.1 3.7Z"
                fill="#35b597"
              />
            </svg>
          </span>
          <span className="flex flex-col leading-none">
            <span className="text-lg font-extrabold tracking-tight">
              <span className="text-navy-600">다대</span>
              <span className="text-brand-500">유</span>
            </span>
            <span className="text-stone mt-1 text-[10px] font-semibold tracking-tight">
              대전 무장애 여행
            </span>
          </span>
        </Link>
        <DesktopNav />
        <div className="relative z-10 ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          {auth?.user ? (
            <>
              <Link
                href="/mypage"
                className="text-steel hover:text-ink hidden items-center gap-2 text-sm whitespace-nowrap transition-colors md:inline-flex"
                aria-label="마이페이지"
              >
                <span className="border-hairline bg-surface-soft inline-flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full border">
                  {auth.member?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={auth.member.avatar_url}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-ink text-xs font-bold">
                      {(auth.member?.nickname ?? "회").slice(0, 1)}
                    </span>
                  )}
                </span>
                <span className="hidden lg:inline">
                  <span className="text-ink font-semibold">{auth.member?.nickname ?? "회원"}</span>
                  님
                </span>
              </Link>
              <Button
                variant="ghost"
                size="sm"
                className="h-auto min-h-11 flex-col gap-0.5 px-2 py-1.5 sm:min-h-12"
                disabled={loggingOut}
                onClick={handleLogout}
                aria-label="로그아웃"
              >
                <LogOut className="h-4 w-4" />
                <span className="text-[10px] leading-none font-medium whitespace-nowrap">
                  {loggingOut ? "로그아웃 중…" : "로그아웃"}
                </span>
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              asChild
              className="h-auto min-h-11 flex-col gap-0.5 px-2 py-1.5 sm:min-h-12"
            >
              <Link href={`/login?next=${encodeURIComponent(pathname)}`} aria-label="로그인">
                <LogIn className="h-4 w-4" />
                <span className="text-[10px] leading-none font-medium whitespace-nowrap">
                  로그인
                </span>
              </Link>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowAccessibility((v) => !v)}
            aria-label="접근성 설정"
            aria-expanded={showAccessibility}
            className={`size-11 shrink-0 rounded-full sm:size-12 ${
              showAccessibility ? "bg-brand-50 text-brand-600" : "text-steel hover:text-brand-600"
            }`}
          >
            <Settings className="h-6 w-6" />
          </Button>
        </div>
        {showAccessibility && <AccessibilitySettings onClose={() => setShowAccessibility(false)} />}
      </div>
    </header>
  );
}
