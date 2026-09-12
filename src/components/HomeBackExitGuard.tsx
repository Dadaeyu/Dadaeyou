"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { installHomeBackExitGuard } from "@/lib/navigation/homeBackExit";

const EXIT_CONFIRM_MESSAGE = "앱을 종료하시겠습니까?";

function isStandaloneDisplayMode(): boolean {
  return (
    typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(display-mode: standalone)").matches
  );
}

export function HomeBackExitGuard() {
  const pathname = usePathname();

  useEffect(() => {
    const standalone = isStandaloneDisplayMode();
    const userAgent = window.navigator.userAgent;

    return installHomeBackExitGuard({
      window,
      pathname,
      standalone,
      userAgent,
      confirmMessage: EXIT_CONFIRM_MESSAGE
    });
  }, [pathname]);

  return null;
}
