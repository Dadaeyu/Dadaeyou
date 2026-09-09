import { ArrowUpRight, Building2, BusFront, Landmark, ShieldCheck, Utensils } from "lucide-react";
import type { LucideIcon } from "lucide-react";

type OfficialSource = {
  name: string;
  purpose: string;
  detail: string;
  href: string;
  icon: LucideIcon;
};

const OFFICIAL_SOURCES: OfficialSource[] = [
  {
    name: "대전관광공사",
    purpose: "관광 소식과 시티투어",
    detail: "관광 사업과 여행 안내",
    href: "https://www.djto.kr/kor/index.do",
    icon: Landmark
  },
  {
    name: "대전광역시",
    purpose: "축제·문화·시정 소식",
    detail: "시 공식 공지와 생활 정보",
    href: "https://www.daejeon.go.kr/index.do",
    icon: Building2
  },
  {
    name: "대전의 맛",
    purpose: "대표 음식과 미식 여행",
    detail: "음식점과 향토 음식 안내",
    href: "https://www.daejeon.go.kr/fod/index.do",
    icon: Utensils
  },
  {
    name: "대전 교통정보",
    purpose: "도로와 버스·이동 안내",
    detail: "대중교통과 이동 전 확인",
    href: "https://www.daejeon.go.kr/drh/DrhContentsHtmlView.do?menuSeq=1497",
    icon: BusFront
  }
];

export function HomeOfficialGuide() {
  return (
    <section
      className="border-hairline overflow-hidden rounded-[1.35rem] border bg-white shadow-[0_22px_70px_-56px_rgba(15,23,42,0.78)] dark:bg-neutral-950"
      aria-labelledby="home-official-guide-title"
    >
      <div className="grid lg:grid-cols-[minmax(18rem,0.84fr)_minmax(0,1.16fr)]">
        <div className="border-hairline bg-navy-50 relative overflow-hidden border-b px-5 py-6 sm:px-7 sm:py-8 lg:border-r lg:border-b-0 dark:bg-neutral-900">
          <div
            className="bg-navy-800 pointer-events-none absolute inset-x-0 top-0 h-1"
            aria-hidden="true"
          />
          <div className="text-navy-700 inline-flex items-center gap-2 rounded-full bg-white/82 px-3 py-1.5 text-xs font-semibold ring-1 ring-slate-200/80 dark:bg-neutral-950/72 dark:text-slate-200 dark:ring-white/10">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            공식 채널
          </div>
          <h2
            id="home-official-guide-title"
            className="text-ink mt-4 max-w-md text-[1.65rem] leading-tight font-semibold tracking-[-0.035em] break-keep sm:text-3xl"
          >
            대전의 공식 여행 정보를 한곳에서 만나보세요
          </h2>
          <p className="text-steel mt-3 max-w-md text-sm leading-6 break-keep sm:text-base sm:leading-7">
            관광 소식과 축제, 대전의 맛, 교통 정보까지 여행에 필요한 안내를 공식 채널에서
            살펴보세요.
          </p>
          <p className="mt-5 max-w-sm text-xs leading-5 font-medium break-keep text-slate-500 dark:text-slate-400">
            예약 전 운영 시간과 교통 변동은 공식 사이트에서 한 번 더 확인하면 안전해요.
          </p>
        </div>

        <div className="grid bg-white sm:grid-cols-2 dark:bg-neutral-950">
          {OFFICIAL_SOURCES.map((source, index) => (
            <OfficialSourceLink key={source.name} source={source} index={index} />
          ))}
        </div>
      </div>
    </section>
  );
}

const CARD_DIVIDER_CLASS = [
  "border-b sm:border-r",
  "border-b",
  "border-b sm:border-r sm:border-b-0",
  ""
];

function OfficialSourceLink({ source, index }: { source: OfficialSource; index: number }) {
  const Icon = source.icon;

  return (
    <a
      href={source.href}
      target="_blank"
      rel="noreferrer"
      className={`group focus-visible:outline-navy-500 border-hairline relative flex min-h-16 items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-[-2px] active:bg-slate-100 sm:min-h-[9.5rem] sm:flex-col sm:items-start sm:gap-4 sm:p-6 dark:hover:bg-neutral-900 dark:active:bg-neutral-900 ${CARD_DIVIDER_CLASS[index] ?? ""}`}
    >
      <span className="group-hover:bg-navy-50 group-hover:text-navy-700 group-focus-visible:bg-navy-50 group-focus-visible:text-navy-700 grid size-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-700 ring-1 ring-slate-200 transition-colors dark:bg-neutral-900 dark:text-slate-200 dark:ring-white/10 dark:group-hover:bg-slate-800">
        <Icon className="h-5 w-5" aria-hidden="true" />
      </span>

      <span className="min-w-0 flex-1 sm:flex-none">
        <span className="text-ink block text-base leading-tight font-semibold break-keep sm:text-lg">
          {source.name}
        </span>
        <span className="text-steel mt-1 block text-sm leading-5 break-keep">{source.purpose}</span>
        <span className="mt-2 hidden text-xs leading-5 font-medium break-keep text-slate-500 sm:block dark:text-slate-400">
          {source.detail}
        </span>
      </span>

      <span className="group-hover:text-navy-700 group-focus-visible:text-navy-700 grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition-colors group-hover:bg-slate-100 group-focus-visible:bg-slate-100 sm:absolute sm:top-5 sm:right-5 dark:text-slate-500 dark:group-hover:bg-neutral-800 dark:group-hover:text-slate-100">
        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="sr-only">새 창에서 열기</span>
    </a>
  );
}
