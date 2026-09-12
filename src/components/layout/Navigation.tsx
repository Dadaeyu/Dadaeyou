"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Map, Route, Users, User, ShieldCheck } from "lucide-react";
import { useAccessibility } from "@/context/AccessibilityContext";
import { useOptionalAuth } from "@/context/AuthContext";
import { cn } from "@/components/ui/utils";

const navItems = [
  { path: "/", label: "홈", icon: Home },
  { path: "/map", label: "지도", icon: Map },
  { path: "/course", label: "코스", icon: Route },
  { path: "/community", label: "커뮤니티", icon: Users },
  { path: "/mypage", label: "마이페이지", icon: User }
];

const adminItem = { path: "/admin", label: "관리", icon: ShieldCheck };

function useIsActive() {
  const pathname = usePathname();
  return (path: string) =>
    path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(path + "/");
}

function desktopNavClass(active: boolean, variant: "default" | "admin" = "default") {
  if (!active) {
    return cn(
      "text-steel hover:text-ink hover:bg-surface-soft font-medium",
      variant === "admin" && "hover:bg-navy-50 hover:text-navy-700"
    );
  }

  if (variant === "admin") {
    return "bg-navy-600 text-white shadow-md ring-2 ring-navy-400/50 font-bold";
  }

  return "bg-brand-500 text-white shadow-md ring-2 ring-brand-400/50 font-bold";
}

function mobileNavClass(active: boolean) {
  return cn(
    "mobile-nav-item relative flex min-w-0 flex-1 flex-col items-center gap-0.5 rounded-xl px-2.5 py-2 transition-colors",
    active ? "text-brand-800" : "text-stone hover:bg-surface-soft hover:text-brand-600"
  );
}

export function DesktopNav() {
  const isActive = useIsActive();
  const auth = useOptionalAuth();
  const isAdmin = auth?.member?.role === "admin" && auth?.member?.status === "active";

  return (
    <nav
      className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto md:flex lg:gap-1"
      aria-label="주 메뉴"
    >
      {navItems.map(({ path, label, icon: Icon }) => {
        const active = isActive(path);
        return (
          <Link
            key={path}
            href={path}
            replace={path === "/"}
            aria-current={active ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs whitespace-nowrap transition-all lg:gap-2 lg:px-3.5 lg:text-sm",
              desktopNavClass(active)
            )}
          >
            <Icon className={cn("h-4 w-4 shrink-0", active && "drop-shadow-sm")} />
            <span className="hidden lg:inline">{label}</span>
            <span className="sr-only lg:hidden">{label}</span>
          </Link>
        );
      })}
      {isAdmin && (
        <>
          <div className="bg-hairline mx-1 hidden h-6 w-px lg:block" aria-hidden="true" />
          <Link
            href={adminItem.path}
            aria-current={isActive(adminItem.path) ? "page" : undefined}
            className={cn(
              "relative flex min-h-12 min-w-12 shrink-0 items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs whitespace-nowrap transition-all lg:gap-2 lg:px-3.5 lg:text-sm",
              desktopNavClass(isActive(adminItem.path), "admin")
            )}
          >
            <adminItem.icon className="h-4 w-4 shrink-0" />
            <span className="hidden lg:inline">{adminItem.label}</span>
            <span className="sr-only lg:hidden">{adminItem.label}</span>
          </Link>
        </>
      )}
    </nav>
  );
}

export function MobileNav() {
  const isActive = useIsActive();
  const pathname = usePathname();
  const { easyMode } = useAccessibility();
  const auth = useOptionalAuth();
  const isAdmin = auth?.member?.role === "admin" && auth?.member?.status === "active";
  const allItems = isAdmin ? [...navItems, adminItem] : navItems;

  if (pathname === "/" && easyMode) return null;

  return (
    <nav
      className="border-hairline bg-background/95 fixed right-0 bottom-0 left-0 z-50 border-t backdrop-blur-md md:hidden"
      aria-label="주 메뉴"
    >
      <div className="mobile-nav-list flex items-stretch justify-around px-1 py-2">
        {allItems.map(({ path, label, icon: Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              href={path}
              replace={path === "/"}
              aria-current={active ? "page" : undefined}
              className={mobileNavClass(active)}
            >
              {active && (
                <span
                  className="bg-brand-500 absolute top-0 left-1/2 h-1 w-6 -translate-x-1/2 rounded-b-full"
                  aria-hidden="true"
                />
              )}
              <Icon className={cn("h-5 w-5", active && "stroke-[2.5px]")} />
              <span
                className={cn("text-[10px] leading-tight", active ? "font-bold" : "font-medium")}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
