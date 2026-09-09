"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowRight, BadgeCheck, CircleAlert, Compass, RefreshCw } from "lucide-react";
import { HomePlaceImage } from "@/features/home/HomePlaceImage";
import {
  HOME_NEED_OPTIONS,
  getConfirmedHomeEvidenceForNeeds,
  getHomeEvidenceStatus,
  getHomeRecommendationNeedIds,
  sortHomeEvidenceForNeeds,
  summarizeVisitInfo,
  type HomeAccessibilityEvidence,
  type HomeNeedId,
  type RankedHomePlace
} from "@/features/home/homeData";
import {
  splitHomeRecommendationPlaces,
  summarizeHomeEvidence
} from "@/features/home/homePresentation";
import type { HomeExperience } from "@/features/home/useHomeExperience";

export function HomeRecommendations({
  experience,
  easyMode,
  targetId = "home-recommendations"
}: {
  experience: HomeExperience;
  easyMode: boolean;
  targetId?: string;
}) {
  return (
    <div
      id={targetId}
      className="border-hairline bg-surface-soft/70 scroll-mt-24 border-t px-4 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6"
    >
      {!easyMode ? (
        <p className="text-brand-800 mb-4 text-xs font-semibold sm:text-sm">나에게 맞춰 보기</p>
      ) : null}
      <RecommendationResults experience={experience} easyMode={easyMode} />
    </div>
  );
}

function RecommendationResults({
  experience,
  easyMode
}: {
  experience: HomeExperience;
  easyMode: boolean;
}) {
  const hasVisiblePlaces = Boolean(experience.data?.places.length);

  if (experience.loadState === "loading" && !hasVisiblePlaces) {
    return <RecommendationsLoading easyMode={easyMode} />;
  }

  if (experience.loadState === "error") {
    return (
      <section
        className="rounded-xl border border-red-200 bg-red-50 p-5 sm:p-6"
        aria-labelledby="recommendation-error-title"
      >
        <CircleAlert className="h-6 w-6 text-red-700" aria-hidden="true" />
        <h2 id="recommendation-error-title" className="text-ink mt-3 text-xl font-semibold">
          다른 후보를 불러오지 못했어요
        </h2>
        <p className="text-slate mt-2 max-w-[52ch] text-sm leading-6">
          {experience.loadError ?? "연결을 확인한 뒤 다시 시도해 주세요."}
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={experience.retry}
            className="bg-brand-800 inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            다시 불러오기
          </button>
          <Link
            href="/map"
            className="border-hairline text-ink inline-flex min-h-11 items-center rounded-xl border bg-white px-4 text-sm font-semibold"
          >
            지도에서 찾기
          </Link>
        </div>
      </section>
    );
  }

  if (experience.loadState === "empty" || !experience.data?.places.length) {
    return (
      <section
        className="border-hairline rounded-xl border bg-white p-5 sm:p-6"
        aria-labelledby="recommendation-empty-title"
      >
        <Compass className="text-brand-700 h-6 w-6" aria-hidden="true" />
        <h2 id="recommendation-empty-title" className="text-ink mt-3 text-xl font-semibold">
          조건을 모두 확인한 장소가 아직 없어요
        </h2>
        <p className="text-slate mt-2 max-w-[52ch] text-sm leading-6">
          무관한 장소를 대신 보여드리지 않았어요. 꼭 필요한 조건을 하나씩 줄이거나 지도에서
          편의정보를 직접 비교해 보세요.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={experience.clearNeeds}
            className="bg-brand-800 min-h-11 rounded-xl px-4 text-sm font-semibold text-white"
          >
            조건 다시 고르기
          </button>
          <Link
            href="/map"
            className="border-hairline text-ink inline-flex min-h-11 items-center rounded-xl border px-4 text-sm font-semibold"
          >
            지도에서 더 찾기
          </Link>
        </div>
      </section>
    );
  }

  return (
    <CuratedPlaces
      places={experience.data.places}
      experience={experience}
      isRefreshing={experience.isRefreshing}
      easyMode={easyMode}
    />
  );
}

function RecommendationsLoading({ easyMode }: { easyMode: boolean }) {
  return (
    <section aria-labelledby="recommendation-title" aria-busy="true">
      <SectionHeading id="recommendation-title" title="조건에 맞는 장소를 준비하고 있어요" />
      {easyMode ? (
        <div className="mt-4 grid gap-2.5 sm:grid-cols-2 sm:gap-4" aria-hidden="true">
          {[0, 1, 2, 3].map((item) => (
            <RecommendationSkeletonCard key={item} />
          ))}
        </div>
      ) : (
        <div
          className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.82fr)]"
          aria-hidden="true"
        >
          <div className="border-hairline overflow-hidden rounded-2xl border bg-white">
            <div className="bg-surface aspect-[16/10] animate-pulse motion-reduce:animate-none sm:aspect-[16/8.5]" />
            <div className="space-y-3 p-5 sm:p-6">
              <div className="bg-surface h-7 w-3/5 animate-pulse rounded motion-reduce:animate-none" />
              <div className="bg-surface h-20 w-full animate-pulse rounded-xl motion-reduce:animate-none" />
            </div>
          </div>
          <div className="grid gap-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="border-hairline grid min-h-32 grid-cols-[7rem_minmax(0,1fr)] overflow-hidden rounded-xl border bg-white"
              >
                <div className="bg-surface animate-pulse motion-reduce:animate-none" />
                <div className="space-y-2 p-4">
                  <div className="bg-surface h-4 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
                  <div className="bg-surface h-8 w-full animate-pulse rounded motion-reduce:animate-none" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <span className="sr-only" role="status">
        비교할 추천 장소를 불러오는 중입니다.
      </span>
    </section>
  );
}

function RecommendationSkeletonCard() {
  return (
    <div className="border-hairline overflow-hidden rounded-xl border bg-white">
      <div className="bg-surface aspect-[4/3] animate-pulse motion-reduce:animate-none sm:aspect-[16/9]" />
      <div className="space-y-3 p-3.5 sm:p-4">
        <div className="bg-surface h-5 w-4/5 animate-pulse rounded motion-reduce:animate-none" />
        <div className="bg-surface h-16 w-full animate-pulse rounded motion-reduce:animate-none" />
      </div>
    </div>
  );
}

function CuratedPlaces({
  places,
  experience,
  isRefreshing,
  easyMode
}: {
  places: RankedHomePlace[];
  experience: HomeExperience;
  isRefreshing: boolean;
  easyMode: boolean;
}) {
  const placesKey = places.map((place) => place.id).join("|");
  const selectedNeedsKey = getHomeRecommendationNeedIds(experience.selectedNeedIds).join("|");
  const [placeView, setPlaceView] = useState({
    placesKey: "",
    selectedNeedsKey: "",
    groupIndex: 0
  });
  const isCurrentPlaceView =
    placeView.placesKey === placesKey && placeView.selectedNeedsKey === selectedNeedsKey;
  const placeGroupIndex = isCurrentPlaceView ? placeView.groupIndex : 0;
  const groupSize = 4;
  const groupCount = Math.max(Math.ceil(places.length / groupSize), 1);
  const safeGroupIndex = Math.min(placeGroupIndex, groupCount - 1);
  const groupStartIndex = safeGroupIndex * groupSize;
  const displayPlaces = places.slice(groupStartIndex, groupStartIndex + groupSize);
  const hasMorePlaceGroups = places.length > groupSize;
  const hasEvidenceCondition = Boolean(selectedNeedsKey);
  const recommendationLayout = splitHomeRecommendationPlaces(displayPlaces);

  if (!displayPlaces.length) return null;

  const title = isRefreshing
    ? "선택한 도움에 맞는 장소를 확인하고 있어요"
    : `${getRecommendationTitle(experience.selectedNeedIds)} ${displayPlaces.length}곳`;
  const showNextPlaceGroup = () => {
    if (safeGroupIndex + 1 >= groupCount) {
      experience.refreshRecommendations();
      return;
    }
    setPlaceView({
      placesKey,
      selectedNeedsKey,
      groupIndex: safeGroupIndex + 1
    });
  };

  return (
    <section aria-labelledby="recommendation-title" aria-busy={isRefreshing}>
      {isRefreshing ? (
        <span className="sr-only" role="status" aria-live="polite">
          선택한 조건으로 장소를 다시 정리하고 있습니다.
        </span>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <SectionHeading
          id="recommendation-title"
          title={title}
          easyMode={easyMode}
          description={
            easyMode
              ? undefined
              : hasEvidenceCondition
                ? "선택한 조건이 공개 정보에서 확인된 장소만 모았어요."
                : "사진과 주소, 확인된 방문 정보를 나란히 비교해 보세요."
          }
        />
        {hasMorePlaceGroups ? (
          <button
            type="button"
            onClick={showNextPlaceGroup}
            disabled={isRefreshing}
            className="border-hairline text-brand-800 hover:bg-brand-50 inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl border bg-white px-3 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 sm:px-4"
          >
            <RefreshCw
              className={`h-4 w-4 ${isRefreshing ? "animate-spin motion-reduce:animate-none" : ""}`}
              aria-hidden="true"
            />
            <span className="hidden sm:inline">
              {isRefreshing ? "새 장소 찾는 중…" : "다른 장소 보기"}
            </span>
            <span className="sm:hidden">다른 장소</span>
          </button>
        ) : null}
      </div>

      {isRefreshing ? (
        <p className="text-brand-900 bg-brand-50 mt-3 inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-xs font-semibold">
          <RefreshCw
            className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
            aria-hidden="true"
          />
          고른 도움에 맞춰 장소를 다시 확인하고 있어요
        </p>
      ) : null}

      {easyMode ? (
        <div
          aria-hidden={isRefreshing || undefined}
          className={`mt-4 grid gap-2.5 transition-opacity duration-150 sm:grid-cols-2 sm:gap-4 ${
            isRefreshing ? "pointer-events-none opacity-60" : "opacity-100"
          }`}
        >
          {displayPlaces.map((place, index) => (
            <div key={place.id}>
              <CompactPlaceCard
                place={place}
                experience={experience}
                cardIndex={groupStartIndex + index}
                easyMode
                disabled={isRefreshing}
              />
            </div>
          ))}
        </div>
      ) : (
        <div
          aria-hidden={isRefreshing || undefined}
          className={`mt-4 grid gap-3 transition-opacity duration-150 lg:grid-cols-[minmax(0,1.55fr)_minmax(19rem,0.82fr)] ${
            isRefreshing ? "pointer-events-none opacity-60" : "opacity-100"
          }`}
        >
          {recommendationLayout.featured ? (
            <FeaturedPlaceCard
              place={recommendationLayout.featured}
              experience={experience}
              cardIndex={groupStartIndex}
              disabled={isRefreshing}
            />
          ) : null}
          {recommendationLayout.supporting.length ? (
            <div className="grid gap-3">
              {recommendationLayout.supporting.map((place, index) => (
                <SupportingPlaceCard
                  key={place.id}
                  place={place}
                  experience={experience}
                  cardIndex={groupStartIndex + index + 1}
                  disabled={isRefreshing}
                />
              ))}
            </div>
          ) : null}
        </div>
      )}
    </section>
  );
}

function FeaturedPlaceCard({
  place,
  experience,
  cardIndex,
  disabled
}: {
  place: RankedHomePlace;
  experience: HomeExperience;
  cardIndex: number;
  disabled: boolean;
}) {
  const visitInfo = summarizeVisitInfo(place);
  const fact = getPlaceDisplayFact(place, experience.selectedNeedIds, cardIndex);
  const titleId = `home-featured-place-${cardIndex}-title`;
  const descriptionId = `home-featured-place-${cardIndex}-description`;

  return (
    <article className="min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => experience.openPlace(place, event.currentTarget)}
        className="border-hairline group focus-visible:outline-brand-600 hover:border-brand-300 flex h-full min-h-[30rem] w-full flex-col overflow-hidden rounded-2xl border bg-white text-left shadow-[0_24px_60px_-42px_rgba(15,44,41,0.72)] transition-[border-color,box-shadow] hover:shadow-[0_28px_70px_-42px_rgba(15,44,41,0.82)] focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-wait"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="bg-surface relative block aspect-[16/10] w-full shrink-0 overflow-hidden sm:aspect-[16/8.5]">
          <HomePlaceImage
            src={place.imageUrl}
            alt={place.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
          />
          <span className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
          <span className="absolute top-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-2 sm:top-4 sm:left-4">
            <span className="bg-brand-700 rounded-full px-3 py-1.5 text-xs font-semibold text-white shadow-sm">
              가장 먼저 볼 곳
            </span>
            <span className="rounded-full border border-white/40 bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
              {place.category ?? "대전 여행"}
            </span>
          </span>
        </span>

        <span className="flex min-w-0 flex-1 flex-col p-5 sm:p-6">
          <span
            id={titleId}
            className="text-ink block text-[1.65rem] leading-tight font-semibold tracking-[-0.025em] [overflow-wrap:anywhere] sm:text-3xl"
          >
            {place.title}
          </span>
          <span className="text-steel mt-2 block text-sm leading-6 sm:text-base">
            {visitInfo ?? place.address ?? "대전에서 만나는 장소"}
          </span>

          <span className="border-brand-100 bg-brand-50/75 mt-5 grid gap-2 rounded-xl border p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:gap-3">
            <BadgeCheck className="text-brand-700 h-5 w-5" aria-hidden="true" />
            <span className="min-w-0">
              <span className="text-brand-800 block text-xs font-semibold">{fact.label}</span>
              <span className="text-ink mt-0.5 block text-sm leading-5 font-semibold sm:text-base">
                {fact.title}
              </span>
              <span className="text-steel mt-1 block text-xs leading-5">{fact.detail}</span>
            </span>
            <span className="text-brand-800 inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold sm:justify-self-end">
              방문 정보
              <ArrowRight
                className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
                aria-hidden="true"
              />
            </span>
          </span>
          <span id={descriptionId} className="sr-only">
            {place.category ?? "대전 여행"}.{fact.label}. {fact.title}. {fact.detail}
          </span>
        </span>
      </button>
    </article>
  );
}

function SupportingPlaceCard({
  place,
  experience,
  cardIndex,
  disabled
}: {
  place: RankedHomePlace;
  experience: HomeExperience;
  cardIndex: number;
  disabled: boolean;
}) {
  const fact = getPlaceDisplayFact(place, experience.selectedNeedIds, cardIndex);
  const titleId = `home-supporting-place-${cardIndex}-title`;
  const descriptionId = `home-supporting-place-${cardIndex}-description`;

  return (
    <article className="min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => experience.openPlace(place, event.currentTarget)}
        className="border-hairline group focus-visible:outline-brand-600 hover:border-brand-300 grid min-h-[8.75rem] w-full grid-cols-[7.5rem_minmax(0,1fr)] overflow-hidden rounded-xl border bg-white text-left shadow-[0_18px_42px_-38px_rgba(15,44,41,0.82)] transition-[border-color,box-shadow] hover:shadow-[0_22px_48px_-36px_rgba(15,44,41,0.9)] focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-wait sm:grid-cols-[9rem_minmax(0,1fr)] lg:h-full lg:min-h-0 lg:grid-cols-[8.5rem_minmax(0,1fr)]"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="bg-surface relative block h-full min-h-[8.75rem] overflow-hidden">
          <HomePlaceImage
            src={place.imageUrl}
            alt={place.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.035] motion-reduce:transform-none motion-reduce:transition-none"
          />
          <span className="absolute top-2 left-2 rounded-full border border-white/35 bg-black/55 px-2 py-1 text-[0.66rem] font-semibold text-white backdrop-blur-sm">
            {place.category ?? "대전 여행"}
          </span>
        </span>
        <span className="flex min-w-0 flex-col p-3.5 sm:p-4">
          <span
            id={titleId}
            className="text-ink line-clamp-2 text-base leading-tight font-semibold [overflow-wrap:anywhere] sm:text-lg"
          >
            {place.title}
          </span>
          <span className="text-steel mt-1 block truncate text-xs">
            {place.address ?? "대전 여행"}
          </span>
          <span className="text-brand-800 mt-2 line-clamp-2 text-xs leading-5 font-semibold">
            <BadgeCheck className="mr-1 inline h-3.5 w-3.5 align-[-0.15em]" aria-hidden="true" />
            {fact.title}
          </span>
          <span className="text-brand-800 mt-auto inline-flex items-center justify-end gap-1 pt-2 text-xs font-semibold">
            자세히
            <ArrowRight
              className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
              aria-hidden="true"
            />
          </span>
          <span id={descriptionId} className="sr-only">
            {fact.label}. {fact.title}. {fact.detail}
          </span>
        </span>
      </button>
    </article>
  );
}

function CompactPlaceCard({
  place,
  experience,
  cardIndex,
  easyMode,
  disabled
}: {
  place: RankedHomePlace;
  experience: HomeExperience;
  cardIndex: number;
  easyMode: boolean;
  disabled: boolean;
}) {
  const visitInfo = summarizeVisitInfo(place);
  const fact = getPlaceDisplayFact(place, experience.selectedNeedIds, cardIndex);
  const titleId = `home-place-${cardIndex}-title`;
  const descriptionId = `home-place-${cardIndex}-description`;

  return (
    <article className="h-full min-w-0">
      <button
        type="button"
        disabled={disabled}
        onClick={(event) => experience.openPlace(place, event.currentTarget)}
        className={`border-hairline group focus-visible:outline-brand-600 hover:border-brand-200 flex h-full w-full flex-col overflow-hidden rounded-xl border bg-white text-left shadow-[0_14px_32px_-30px_rgba(15,44,41,0.68)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3 sm:min-h-[18rem] ${
          easyMode ? "rounded-2xl border-[3px] border-[#102A43] shadow-[0_6px_0_#102A43]" : ""
        }`}
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
      >
        <span className="bg-surface relative block aspect-[4/3] w-full shrink-0 overflow-hidden sm:aspect-[16/9] sm:h-auto sm:min-h-0 sm:w-full">
          <HomePlaceImage
            src={place.imageUrl}
            alt={place.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none motion-reduce:transition-none"
          />
          <span className="absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-full border border-white/35 bg-black/55 px-2 py-1 text-[0.68rem] font-semibold text-white backdrop-blur-sm sm:bottom-2.5 sm:left-2.5 sm:px-2.5 sm:text-xs">
            {place.category ?? "대전 여행"}
          </span>
        </span>

        <span className={`flex min-w-0 flex-1 flex-col ${easyMode ? "p-5 sm:p-6" : "p-3 sm:p-4"}`}>
          <span
            id={titleId}
            className={`text-ink block leading-tight font-semibold [overflow-wrap:anywhere] ${
              easyMode ? "text-lg sm:text-xl" : "text-[0.98rem] sm:text-lg"
            }`}
          >
            {place.title}
          </span>
          <span
            className={`text-steel mt-1 block ${easyMode ? "text-base" : "text-xs sm:mt-1.5 sm:text-sm"}`}
          >
            {visitInfo ?? "대전에서 만나는 장소"}
          </span>

          <span
            className={`bg-brand-50/70 sm:bg-surface mt-2 block rounded-lg px-2.5 py-2 sm:mt-3 sm:p-3 ${
              easyMode ? "border-2 border-[#102A43]" : "sm:border-hairline sm:border"
            }`}
          >
            <span
              className={`text-brand-800 block font-semibold ${easyMode ? "text-base" : "text-[0.7rem] sm:text-xs"}`}
            >
              {fact.label}
            </span>
            <span
              className={`text-ink mt-0.5 line-clamp-2 font-semibold sm:mt-1 ${easyMode ? "text-lg" : "text-sm"}`}
            >
              {fact.title}
            </span>
            {!easyMode ? (
              <span className="text-steel mt-1 line-clamp-2 hidden text-xs leading-5 sm:block">
                {fact.detail}
              </span>
            ) : null}
          </span>

          <span
            className={`text-brand-800 mt-auto inline-flex items-center gap-1.5 pt-2 font-semibold sm:justify-between sm:pt-4 ${
              easyMode ? "min-h-12 text-lg" : "text-sm"
            }`}
          >
            방문 정보 보기
            <ArrowRight
              className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none"
              aria-hidden="true"
            />
          </span>
          <span id={descriptionId} className="sr-only">
            {place.category ?? "대전 여행"}.{fact.label}. {fact.title}. {fact.detail}
          </span>
        </span>
      </button>
    </article>
  );
}

function getPlaceDisplayFact(
  place: RankedHomePlace,
  selectedNeedIds: readonly HomeNeedId[],
  cardIndex: number
) {
  const confirmedEvidence = getConfirmedHomeEvidenceForNeeds(place, selectedNeedIds);
  const hasStrictCondition = selectedNeedIds.length > 0;
  const evidencePool = hasStrictCondition ? confirmedEvidence : place.accessibility;
  const sortedEvidence = sortHomeEvidenceForNeeds(evidencePool, selectedNeedIds).filter(
    (item) => getHomeEvidenceStatus(item) === "available"
  );
  const matchedNeedLabels = place.matchedNeedIds.flatMap((needId) => {
    const option = HOME_NEED_OPTIONS.find((candidate) => candidate.id === needId);
    return option ? [option.label] : [];
  });
  const evidenceIndex = selectedNeedIds.length
    ? 0
    : cardIndex % Math.max(Math.min(sortedEvidence.length, 3), 1);
  const evidence = sortedEvidence[evidenceIndex];

  if (evidence) {
    return {
      label: matchedNeedLabels.length ? "확인된 조건" : getEvidenceLabel(evidence),
      title: matchedNeedLabels.length ? matchedNeedLabels.join(" · ") : evidence.label,
      detail: matchedNeedLabels.length
        ? `${evidence.label}: ${summarizeHomeEvidence(evidence.value)}`
        : summarizeHomeEvidence(evidence.value)
    };
  }

  const visitInfo = summarizeVisitInfo(place);
  if (visitInfo) {
    return {
      label: "운영 정보",
      title: visitInfo,
      detail: "방문 전 당일 운영 여부를 확인해 주세요."
    };
  }

  if (place.address) {
    return { label: "주소 정보", title: "주소 확인 가능", detail: place.address };
  }

  return {
    label: "방문 전 확인",
    title: "상세 정보 확인 필요",
    detail: "상세 화면에서 운영과 편의 정보를 확인해 주세요."
  };
}

function getEvidenceLabel(evidence: HomeAccessibilityEvidence) {
  if (
    [
      "braile_block",
      "audio_guide",
      "guide_human",
      "big_print",
      "braile_promotion",
      "guide_system",
      "blind_handicap_etc"
    ].includes(evidence.key)
  ) {
    return "시각 지원";
  }
  if (
    ["sign_guide", "video_guide", "hearing_room", "hearing_handicap_etc"].includes(evidence.key)
  ) {
    return "청각 지원";
  }
  if (
    ["stroller", "lactation_room", "baby_spare_chair", "infants_family_etc"].includes(evidence.key)
  ) {
    return "동반 편의";
  }
  if (evidence.key === "parking") return "주차 정보";
  if (evidence.key === "restroom") return "화장실 정보";
  return "이동·편의 정보";
}

function getRecommendationTitle(selectedNeedIds: readonly HomeNeedId[]) {
  if (selectedNeedIds.includes("step_free")) return "계단 없는 이동이 확인된 장소";
  if (selectedNeedIds.includes("visual_guidance")) return "시각 지원이 확인된 장소";
  if (selectedNeedIds.includes("hearing_guidance")) return "청각 지원이 확인된 장소";
  if (selectedNeedIds.includes("stroller_friendly")) return "유모차로 이동하기 좋은 장소";
  if (selectedNeedIds.includes("family_support")) return "영유아 편의가 확인된 장소";
  if (selectedNeedIds.includes("accessible_toilet")) return "장애인 화장실이 확인된 장소";
  return "지금 살펴볼 장소";
}

function SectionHeading({
  id,
  title,
  description,
  easyMode = false
}: {
  id: string;
  title: string;
  description?: string;
  easyMode?: boolean;
}) {
  return (
    <div className="min-w-0">
      <h2
        id={id}
        className={`text-ink leading-tight font-semibold ${
          easyMode ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl"
        }`}
      >
        {title}
      </h2>
      {description ? (
        <p className="text-steel mt-1.5 hidden max-w-[46rem] text-sm leading-5 sm:block">
          {description}
        </p>
      ) : null}
    </div>
  );
}
