"use client";

import Link from "next/link";
import {
  Accessibility,
  ArrowRight,
  Check,
  DoorOpen,
  MapPinned,
  MessageCircle,
  RotateCcw
} from "lucide-react";
import { HomeDiscovery } from "@/features/home/HomeDiscovery";
import { HomeRecommendations } from "@/features/home/HomeRecommendations";
import { HomeTravelSupport } from "@/features/home/HomeTravelSupport";
import { HomeWeatherNotice } from "@/features/home/HomeWeatherNotice";
import { HOME_NEED_ICONS, HOME_VISIT_SITUATIONS } from "@/features/home/HomeHero";
import { getHomeRecommendationNeedIds, type HomeNeedId } from "@/features/home/homeData";
import type { HomeExperience } from "@/features/home/useHomeExperience";

const EASY_RECOMMENDATIONS_ID = "easy-home-recommendations";

export function EasyHome({
  experience,
  onOpenChat,
  onExitEasyMode
}: {
  experience: HomeExperience;
  onOpenChat: () => void;
  onExitEasyMode: () => void;
}) {
  const selectedRecommendationNeeds = getHomeRecommendationNeedIds(experience.selectedNeedIds);

  const selectNeed = (needId: HomeNeedId) => {
    experience.toggleNeed(needId);
  };

  const showSelectedRecommendations = () => {
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        document.getElementById(EASY_RECOMMENDATIONS_ID)?.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto"
            : "smooth",
          block: "start"
        });
      });
    });
  };

  return (
    <div className="easy-home bg-easy-bg text-easy-navy -mx-4 -my-6 min-h-screen px-4 py-5 md:-mx-6 md:px-6 md:py-6">
      <div className="mx-auto max-w-6xl space-y-5 pb-8">
        <section
          className="border-easy-navy rounded-[1.75rem] border-[3px] bg-white p-4 shadow-[0_18px_0_var(--color-easy-navy)] sm:p-6 lg:p-8"
          aria-labelledby="easy-home-title"
          aria-busy={experience.loadState === "loading"}
        >
          <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-stretch">
            <div className="min-w-0">
              <p className="border-easy-navy bg-easy-yellow inline-flex min-h-12 items-center rounded-full border-2 px-4 text-lg font-extrabold">
                쉬운 화면
              </p>
              <h1
                id="easy-home-title"
                className="mt-4 text-[2.35rem] leading-[1.05] font-extrabold break-keep sm:text-[3.6rem]"
              >
                필요한 도움을 누르면 갈 만한 곳을 바로 보여드려요
              </h1>
              <p className="text-easy-copy mt-4 max-w-[42rem] text-xl leading-8 font-bold break-keep">
                큰 버튼을 눌러 지도, 챗봇, 추천 장소를 한 화면에서 이용하세요.
              </p>
            </div>

            <div className="grid gap-3">
              <Link
                href="/map"
                className="border-easy-navy bg-easy-mint flex min-h-24 items-center justify-between gap-4 rounded-2xl border-[3px] px-5 text-xl font-extrabold text-white shadow-[0_8px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_4px_0_var(--color-easy-navy)]"
              >
                <span className="flex min-w-0 items-center gap-4">
                  <MapPinned className="h-10 w-10 shrink-0" aria-hidden="true" />
                  지도 크게 보기
                </span>
                <ArrowRight className="h-8 w-8 shrink-0" aria-hidden="true" />
              </Link>
              <button
                type="button"
                onClick={onOpenChat}
                className="border-easy-navy bg-easy-yellow text-easy-navy flex min-h-24 items-center justify-between gap-4 rounded-2xl border-[3px] px-5 text-left text-xl font-extrabold shadow-[0_8px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_4px_0_var(--color-easy-navy)]"
                aria-haspopup="dialog"
              >
                <span className="flex min-w-0 items-center gap-4">
                  <MessageCircle className="h-10 w-10 shrink-0" aria-hidden="true" />
                  다유에게 물어보기
                </span>
                <ArrowRight className="h-8 w-8 shrink-0" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={onExitEasyMode}
                className="border-easy-danger text-easy-danger flex min-h-20 items-center justify-center gap-3 rounded-2xl border-[3px] bg-white px-5 text-lg font-extrabold"
              >
                <DoorOpen className="h-8 w-8" aria-hidden="true" />
                쉬운 화면 나가기
              </button>
            </div>
          </div>
        </section>

        <section
          className="border-easy-navy rounded-[1.75rem] border-[3px] bg-white p-4 sm:p-6"
          aria-labelledby="easy-needs-title"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <p className="flex items-center gap-3 text-xl font-extrabold">
                <span
                  className="border-easy-navy bg-easy-yellow grid size-14 place-items-center rounded-full border-[3px] text-2xl"
                  aria-hidden="true"
                >
                  1
                </span>
                도움 선택
              </p>
              <h2 id="easy-needs-title" className="mt-3 text-3xl font-extrabold break-keep">
                어떤 도움이 필요하세요?
              </h2>
            </div>
            {selectedRecommendationNeeds.length ? (
              <button
                type="button"
                onClick={experience.clearNeeds}
                className="border-easy-navy text-easy-navy inline-flex min-h-16 items-center justify-center gap-2 rounded-2xl border-[3px] bg-white px-5 text-lg font-extrabold"
              >
                <RotateCcw className="h-6 w-6" aria-hidden="true" />
                선택 초기화
              </button>
            ) : null}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
            {HOME_VISIT_SITUATIONS.map((option) => {
              const selected = experience.selectedNeedIds.includes(option.id);
              const Icon = HOME_NEED_ICONS[option.id];
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => selectNeed(option.id)}
                  disabled={experience.auth.loading}
                  aria-pressed={selected}
                  aria-controls={EASY_RECOMMENDATIONS_ID}
                  className={`relative flex min-h-28 items-center gap-4 rounded-2xl border-[3px] px-4 text-left shadow-[0_7px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_3px_0_var(--color-easy-navy)] disabled:opacity-50 ${
                    selected
                      ? "border-easy-navy bg-easy-navy text-white"
                      : "border-easy-navy bg-easy-bg text-easy-navy"
                  }`}
                >
                  <span
                    className={`grid size-16 shrink-0 place-items-center rounded-2xl border-[3px] ${
                      selected
                        ? "bg-easy-yellow text-easy-navy border-white"
                        : "border-easy-navy bg-white"
                    }`}
                    aria-hidden="true"
                  >
                    <Icon className="h-8 w-8" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-2xl leading-tight font-extrabold break-keep">
                      {option.label}
                    </span>
                    <span
                      className={`mt-1 block text-base leading-6 font-bold break-keep ${
                        selected ? "text-white/85" : "text-easy-copy"
                      }`}
                    >
                      {option.description}
                    </span>
                  </span>
                  {selected ? (
                    <span
                      className="bg-easy-yellow text-easy-navy absolute top-3 right-3 grid size-9 place-items-center rounded-full"
                      aria-hidden="true"
                    >
                      <Check className="h-6 w-6" strokeWidth={3} />
                    </span>
                  ) : null}
                </button>
              );
            })}

            <button
              type="button"
              onClick={() => selectNeed("accessible_toilet")}
              disabled={experience.auth.loading}
              aria-pressed={experience.selectedNeedIds.includes("accessible_toilet")}
              aria-controls={EASY_RECOMMENDATIONS_ID}
              className={`relative flex min-h-28 items-center gap-4 rounded-2xl border-[3px] px-4 text-left shadow-[0_7px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_3px_0_var(--color-easy-navy)] disabled:opacity-50 ${
                experience.selectedNeedIds.includes("accessible_toilet")
                  ? "border-easy-navy bg-easy-navy text-white"
                  : "border-easy-navy bg-easy-bg text-easy-navy"
              }`}
            >
              <span
                className={`grid size-16 shrink-0 place-items-center rounded-2xl border-[3px] ${
                  experience.selectedNeedIds.includes("accessible_toilet")
                    ? "bg-easy-yellow text-easy-navy border-white"
                    : "border-easy-navy bg-white"
                }`}
                aria-hidden="true"
              >
                <Accessibility className="h-8 w-8" />
              </span>
              <span className="min-w-0">
                <span className="block text-2xl leading-tight font-extrabold break-keep">
                  장애인 화장실
                </span>
                <span
                  className={`mt-1 block text-base leading-6 font-bold break-keep ${
                    experience.selectedNeedIds.includes("accessible_toilet")
                      ? "text-white/85"
                      : "text-easy-copy"
                  }`}
                >
                  화장실 정보가 확인된 곳
                </span>
              </span>
            </button>
          </div>

          <button
            type="button"
            onClick={showSelectedRecommendations}
            aria-controls={EASY_RECOMMENDATIONS_ID}
            className="border-easy-navy bg-easy-mint mt-5 flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border-[3px] px-5 text-xl font-extrabold text-white shadow-[0_8px_0_var(--color-easy-navy)] transition-transform active:translate-y-1 active:shadow-[0_4px_0_var(--color-easy-navy)]"
          >
            선택한 조건으로 추천 보기
            <ArrowRight className="h-8 w-8 shrink-0" aria-hidden="true" />
          </button>
        </section>

        <HomeWeatherNotice easyMode />

        <section className="border-easy-navy rounded-[1.75rem] border-[3px] bg-white">
          <div className="border-easy-navy border-b-[3px] p-4 sm:p-6">
            <p className="flex items-center gap-3 text-xl font-extrabold">
              <span
                className="border-easy-navy bg-easy-yellow grid size-14 place-items-center rounded-full border-[3px] text-2xl"
                aria-hidden="true"
              >
                2
              </span>
              장소 확인
            </p>
          </div>
          <HomeRecommendations
            experience={experience}
            easyMode
            targetId={EASY_RECOMMENDATIONS_ID}
          />
        </section>

        <HomeTravelSupport easyMode />

        <HomeDiscovery
          festivals={experience.data?.festivals ?? []}
          easyMode
          onOpenFestival={experience.openPlace}
        />
      </div>
    </div>
  );
}
