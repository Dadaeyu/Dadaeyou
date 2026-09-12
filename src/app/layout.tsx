import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";
import RootShell from "@/components/RootShell";
import { PwaRegistration } from "@/components/pwa/PwaRegistration";
import { A11Y_STORAGE_KEY } from "@/lib/accessibility";

export const metadata: Metadata = {
  applicationName: "다대유",
  title: "다대유 - 대전 무장애 여행",
  description:
    "장애물 없이 즐기는 대전 무장애 여행 가이드, 다대유. 맞춤 코스와 커뮤니티, 상세 지도를 제공합니다.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "다대유"
  }
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#141414" }
  ]
};

const a11yInitScript = `
(function () {
  try {
    var raw = localStorage.getItem(${JSON.stringify(A11Y_STORAGE_KEY)});
    if (!raw) return;
    var s = JSON.parse(raw);
    var el = document.documentElement;
    if (s.darkMode) el.classList.add("dark");
    if (s.highContrast) el.classList.add("high-contrast");
    if (s.easyMode) el.classList.add("easy-mode");
    if (s.fontScale) el.style.setProperty("--a11y-scale", String(s.fontScale / 100));
  } catch (e) {}
})();
`;

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <Script
          id="a11y-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: a11yInitScript }}
        />
        <PwaRegistration />
        <RootShell>{children}</RootShell>
      </body>
    </html>
  );
}
