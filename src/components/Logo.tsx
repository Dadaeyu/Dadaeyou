import Link from "next/link";

/**
 * 다대유 브랜드 로고
 * - 마크: 네이비→틸 그라데이션 위치핀 + 하트 (장소 + 누구나·함께)
 * - 워드마크: "다대"(네이비) + "유"(틸) + 태그라인
 */
export default function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link
      href="/"
      replace
      className="group flex shrink-0 items-center gap-2.5"
      aria-label="다대유 - 대전 무장애 여행 홈"
    >
      {/* Mark */}
      <span className="from-navy-600 to-brand-500 shadow-brand-500/30 relative inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br shadow-sm transition-transform duration-200 group-hover:scale-105">
        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
          {/* pin */}
          <path
            d="M12 21.5s-6.6-5.6-6.6-10.8A6.6 6.6 0 0 1 12 4.1a6.6 6.6 0 0 1 6.6 6.6c0 5.2-6.6 10.8-6.6 10.8Z"
            fill="white"
          />
          {/* heart */}
          <path
            d="M12 13.9c-1.9-1.4-3.1-2.3-3.1-3.7 0-.95.74-1.7 1.68-1.7.55 0 1.07.27 1.42.69.35-.42.87-.69 1.42-.69.94 0 1.68.75 1.68 1.7 0 1.4-1.2 2.3-3.1 3.7Z"
            fill="#35b597"
          />
        </svg>
      </span>

      {/* Wordmark */}
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="text-lg font-extrabold tracking-tight">
            <span className="text-navy-600">다대</span>
            <span className="text-brand-500">유</span>
          </span>
          <span className="mt-1 text-[10px] font-semibold tracking-tight text-gray-400">
            대전 무장애 여행
          </span>
        </span>
      )}
    </Link>
  );
}
