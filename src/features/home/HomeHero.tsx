"use client";

import Link from "next/link";
import {
  Accessibility,
  Baby,
  Check,
  Ear,
  Eye,
  Footprints,
  MapPinned,
  MessageCircle
} from "lucide-react";
import { getHomeRecommendationNeedIds, type HomeNeedId } from "@/features/home/homeData";
import type { HomeExperience } from "@/features/home/useHomeExperience";

export const HOME_NEED_ICONS = {
  step_free: Footprints,
  visual_guidance: Eye,
  hearing_guidance: Ear,
  stroller_friendly: Footprints,
  family_support: Baby
} satisfies Partial<Record<HomeNeedId, typeof Accessibility>>;

export const HOME_VISIT_SITUATIONS = [
  {
    id: "step_free",
    label: "계단 없는 이동",
    description: "턱 없는 출입구나 경사로가 확인된 곳"
  },
  {
    id: "visual_guidance",
    label: "시각 지원",
    description: "점자·음성·보조견 지원 정보가 있는 곳"
  },
  {
    id: "hearing_guidance",
    label: "청각 지원",
    description: "수어·자막·보청 지원 정보가 있는 곳"
  },
  {
    id: "stroller_friendly",
    label: "유모차 이동",
    description: "유모차 정보와 턱 없는 출입이 함께 확인된 곳"
  },
  {
    id: "family_support",
    label: "영유아 동반",
    description: "수유실·아기의자·기저귀 교환 정보가 있는 곳"
  }
] as const satisfies ReadonlyArray<{
  id: HomeNeedId;
  label: string;
  description: string;
}>;

export function HomeHero({
  experience,
  onOpenChat
}: {
  experience: HomeExperience;
  onOpenChat: () => void;
}) {
  const displayName = experience.auth.user ? experience.auth.member?.nickname?.trim() : "";
  const hasRecommendationNeeds = getHomeRecommendationNeedIds(experience.selectedNeedIds).length;
  const introCopy = hasRecommendationNeeds
    ? "선택한 조건으로 장소별 이동·편의 정보를 비교해 보세요."
    : "장소마다 확인된 이동·편의 정보를 함께 보고, 내 상황에 맞는 후보를 고르세요.";

  return (
    <section
      id="home-intro"
      className="border-hairline scroll-mt-24 rounded-[1.25rem] border bg-white p-4 shadow-[0_18px_44px_-40px_rgba(15,44,41,0.72)] sm:p-6"
      aria-labelledby="home-heading"
      aria-busy={experience.loadState === "loading"}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end md:gap-6">
        <div className="min-w-0">
          <p className="text-brand-800 text-xs font-semibold sm:text-sm">
            {displayName ? `${displayName}님을 위한 대전 무장애 여행` : "대전 무장애 여행"}
          </p>
          <h1
            id="home-heading"
            className="text-ink mt-1 text-[1.65rem] leading-[1.12] font-semibold tracking-[-0.035em] break-keep sm:text-[2.45rem]"
          >
            대전에서 어디로 가볼까요?
          </h1>
          <p className="text-slate mt-2 max-w-[42rem] text-sm leading-5 break-keep sm:text-base sm:leading-6">
            {introCopy}
          </p>
        </div>

        <div className="home-action-grid grid grid-cols-2 gap-2 md:w-[23rem]">
          <Link
            href="/map"
            className="bg-brand-800 hover:bg-brand-900 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold text-white transition-colors sm:min-h-11 sm:px-4"
          >
            <MapPinned className="h-4 w-4" aria-hidden="true" />
            지도 보기
          </Link>
          <button
            type="button"
            onClick={onOpenChat}
            className="border-hairline text-ink hover:bg-brand-50 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border bg-white px-2 text-sm font-semibold transition-colors sm:min-h-11 sm:px-4"
            aria-haspopup="dialog"
          >
            <MessageCircle className="h-4 w-4" aria-hidden="true" />
            <span className="sm:hidden">다유에게 묻기</span>
            <span className="hidden sm:inline">다유에게 물어보기</span>
          </button>
        </div>
      </div>
    </section>
  );
}

export function HomeNeedsPicker({
  experience,
  easyMode
}: {
  experience: HomeExperience;
  easyMode: boolean;
}) {
  const { auth } = experience;
  const recommendationNeedIds = getHomeRecommendationNeedIds(experience.selectedNeedIds);
  const selectNeedAndShowResults = (needId: HomeNeedId) => {
    experience.toggleNeed(needId);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById("home-recommendations")?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start"
        });
      });
    });
  };

  if (auth.loading) {
    return (
      <section
        id="home-needs"
        className="scroll-mt-24 p-3 sm:p-5"
        aria-labelledby="needs-title"
        aria-busy="true"
      >
        <p className="text-brand-800 text-xs font-semibold">장소 고르는 조건</p>
        <h2 id="needs-title" className="text-ink mt-0.5 text-lg font-semibold sm:text-xl">
          필요한 도움을 준비하고 있어요
        </h2>
        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(23rem,0.9fr)]">
          <div className="space-y-2" aria-hidden="true">
            <div className="bg-surface h-4 w-20 animate-pulse rounded motion-reduce:animate-none" />
            <div className="flex gap-2">
              {[0, 1, 2].map((item) => (
                <div
                  key={item}
                  className="bg-surface h-11 w-28 animate-pulse rounded-full motion-reduce:animate-none"
                />
              ))}
            </div>
          </div>
          <div className="space-y-2" aria-hidden="true">
            <div className="bg-surface h-4 w-24 animate-pulse rounded motion-reduce:animate-none" />
            <div className="bg-surface h-12 w-full animate-pulse rounded-xl motion-reduce:animate-none" />
          </div>
        </div>
        <span className="sr-only" role="status">
          필요한 도움을 준비하는 중입니다.
        </span>
      </section>
    );
  }

  return (
    <section
      id="home-needs"
      className="bg-brand-50/25 scroll-mt-24 p-4 sm:p-6"
      aria-labelledby="needs-title"
      aria-busy={auth.loading}
    >
      <div className={`flex items-start justify-between gap-3 ${easyMode ? "flex-col" : ""}`}>
        <div className="min-w-0">
          <p className="text-brand-800 flex items-center gap-2 text-xs font-semibold sm:text-sm">
            <span
              className="bg-brand-800 grid size-6 place-items-center rounded-full text-[0.7rem] text-white"
              aria-hidden="true"
            >
              1
            </span>
            나에게 맞춰 보기 · 도움 선택
          </p>
          <h2
            id="needs-title"
            className="text-ink mt-2 text-xl font-semibold break-keep sm:text-2xl"
          >
            필요한 도움을 골라 주세요
          </h2>
          <p className="text-steel mt-1 text-xs leading-5 break-keep sm:text-sm">
            {easyMode
              ? "하나를 고르면 바로 아래에 장소 4곳이 보여요."
              : "선택하면 바로 아래 추천 장소 4곳이 조건에 맞춰 바뀝니다."}
          </p>
        </div>

        {recommendationNeedIds.length ? (
          <button
            type="button"
            onClick={experience.clearNeeds}
            className={`text-steel hover:text-brand-800 min-h-11 shrink-0 px-2 text-xs font-semibold transition-colors sm:text-sm ${
              easyMode
                ? "border-hairline text-brand-800 w-full rounded-xl border bg-white text-center"
                : ""
            }`}
          >
            선택 초기화
          </button>
        ) : null}
      </div>

      <fieldset className="mt-5 min-w-0">
        <legend className="text-ink flex w-full items-center justify-between gap-3 text-sm font-semibold">
          <span>필요한 도움</span>
          <span className="text-steel text-xs font-normal">하나 선택</span>
        </legend>
        <div className="home-needs-grid mt-2 grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-5">
          {HOME_VISIT_SITUATIONS.map((option) => {
            const selected = experience.selectedNeedIds.includes(option.id);
            const Icon = HOME_NEED_ICONS[option.id];
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => selectNeedAndShowResults(option.id)}
                disabled={auth.loading}
                aria-pressed={selected}
                aria-label={`${option.label}: ${option.description}`}
                aria-controls="home-recommendations"
                className={`relative flex min-w-0 gap-2 rounded-xl border text-left transition-[border-color,background-color,color,box-shadow,transform] duration-150 disabled:opacity-50 motion-reduce:transform-none ${
                  easyMode
                    ? "min-h-16 items-center p-3"
                    : "min-h-[4.25rem] items-center p-2.5 last:col-span-2 sm:p-3 md:min-h-[4.75rem] md:items-start md:last:col-span-1"
                } ${
                  selected
                    ? "border-brand-800 bg-brand-800 text-white shadow-[0_12px_24px_-20px_rgba(0,113,91,0.95)] active:scale-[0.99]"
                    : "border-hairline text-slate hover:border-brand-300 hover:bg-brand-50 bg-white active:scale-[0.99]"
                }`}
              >
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-lg ${
                    selected ? "bg-white/15" : "bg-brand-50 text-brand-800"
                  }`}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm leading-tight font-semibold break-keep">
                    {option.label}
                  </span>
                  {!easyMode ? (
                    <span
                      className={`mt-1 hidden text-xs leading-[1.15rem] break-keep md:block ${
                        selected ? "text-white/80" : "text-steel"
                      }`}
                    >
                      {option.description}
                    </span>
                  ) : null}
                </span>
                {selected ? (
                  <span
                    className="text-brand-800 absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-white"
                    aria-hidden="true"
                  >
                    <Check className="h-3.5 w-3.5" strokeWidth={3} />
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="mt-4 min-w-0">
        <legend className="text-ink flex w-full items-center justify-between gap-3 text-sm font-semibold">
          <span>추가로 확인할 시설</span>
          <span className="text-steel text-xs font-normal">선택 사항</span>
        </legend>
        <button
          type="button"
          onClick={() => selectNeedAndShowResults("accessible_toilet")}
          disabled={auth.loading}
          aria-pressed={experience.selectedNeedIds.includes("accessible_toilet")}
          aria-label="장애인 화장실: 장애인 화장실이 확인된 장소만 보기"
          aria-controls="home-recommendations"
          className={`mt-2 flex min-h-12 w-full items-center gap-2.5 rounded-xl border px-3 text-sm font-semibold transition-colors disabled:opacity-50 sm:w-64 ${
            experience.selectedNeedIds.includes("accessible_toilet")
              ? "border-brand-800 bg-brand-50 text-brand-900"
              : "border-hairline text-slate hover:border-brand-300 hover:bg-brand-50 bg-white"
          }`}
        >
          <Accessibility className="h-4 w-4" aria-hidden="true" />
          장애인 화장실
          {experience.selectedNeedIds.includes("accessible_toilet") ? (
            <Check className="ml-auto h-4 w-4" aria-hidden="true" />
          ) : null}
        </button>
      </fieldset>
    </section>
  );
}
