"use client";

import Link from "next/link";
import { useEffect, useState, type MouseEvent } from "react";
import { ArrowRight, Heart, Route, Star } from "lucide-react";
import { HomePlaceImage } from "@/features/home/HomePlaceImage";
import type { RankedHomePlace } from "@/features/home/homeData";
import {
  formatHomeDiscoveryPeriod,
  getCourseDiscoveryTitle,
  pickFestivalPlaces,
  rankFavoritePlaces,
  rankReviewPlaces,
  rankSharedCourses,
  type HomeDiscoveryCourse,
  type HomeDiscoveryHotPlace,
  type RankedHomeDiscoveryCourse
} from "@/features/home/homeDiscoveryData";
import { buildHomePlaceMapHref, cleanHomePresentationText } from "@/features/home/homePresentation";

interface HomeDiscoveryProps {
  festivals: RankedHomePlace[];
  easyMode: boolean;
  onOpenFestival: (place: RankedHomePlace, trigger: HTMLElement) => void;
}

type LoadState = "loading" | "ready";

interface DiscoveryState {
  loadState: LoadState;
  reviewPlaces: HomeDiscoveryHotPlace[];
  favoritePlaces: HomeDiscoveryHotPlace[];
  courses: RankedHomeDiscoveryCourse[];
  placesFailed: boolean;
  coursesFailed: boolean;
}

export function HomeDiscovery({ festivals, easyMode, onOpenFestival }: HomeDiscoveryProps) {
  const [state, setState] = useState<DiscoveryState>({
    loadState: "loading",
    reviewPlaces: [],
    favoritePlaces: [],
    courses: [],
    placesFailed: false,
    coursesFailed: false
  });
  const visibleFestivals = pickFestivalPlaces(festivals);
  const showReviewPlaces = state.reviewPlaces.length > 0;
  const showFavoritePlaces = state.favoritePlaces.length > 0;
  const showCourses = state.courses.length > 0;
  const showLoading = state.loadState === "loading";

  useEffect(() => {
    const controller = new AbortController();

    async function loadDiscovery() {
      const [placeResult, courseResult] = await Promise.allSettled([
        fetchJson<{
          places?: Partial<HomeDiscoveryHotPlace>[];
          reviewPlaces?: Partial<HomeDiscoveryHotPlace>[];
          favoritePlaces?: Partial<HomeDiscoveryHotPlace>[];
        }>("/api/tourism/top-rated-places", controller.signal),
        fetchJson<{ items?: Partial<HomeDiscoveryCourse>[] }>(
          "/api/courses/shared?limit=50&sort=rating_desc",
          controller.signal
        )
      ]);

      if (controller.signal.aborted) return;

      setState({
        loadState: "ready",
        reviewPlaces:
          placeResult.status === "fulfilled"
            ? rankReviewPlaces(placeResult.value.reviewPlaces ?? placeResult.value.places ?? [])
            : [],
        favoritePlaces:
          placeResult.status === "fulfilled"
            ? rankFavoritePlaces(placeResult.value.favoritePlaces ?? placeResult.value.places ?? [])
            : [],
        courses:
          courseResult.status === "fulfilled"
            ? rankSharedCourses(courseResult.value.items ?? [])
            : [],
        placesFailed: placeResult.status === "rejected",
        coursesFailed: courseResult.status === "rejected"
      });
    }

    void loadDiscovery();

    return () => controller.abort();
  }, []);

  const hasLoadFailure = state.placesFailed || state.coursesFailed;

  if (
    !showLoading &&
    !hasLoadFailure &&
    !showReviewPlaces &&
    !showFavoritePlaces &&
    !showCourses &&
    visibleFestivals.length === 0
  ) {
    return null;
  }

  return (
    <section
      className={cx(
        "border-brand-900 bg-brand-900 overflow-hidden rounded-[1.5rem] border shadow-[0_24px_56px_-42px_rgba(0,72,58,0.9)]",
        easyMode && "rounded-[1.75rem] border-[3px] border-[#102A43] bg-[#102A43] shadow-none"
      )}
      aria-labelledby="home-discovery-title"
    >
      <header className={easyMode ? "px-5 py-6 sm:px-8" : "px-4 py-7 sm:px-6 sm:py-9 lg:px-7"}>
        <p
          className={cx(
            "text-fixed-white/75 text-xs font-semibold sm:text-sm",
            easyMode &&
              "inline-flex min-h-10 items-center rounded-full bg-[#FFD84D] px-4 text-base text-[#102A43]"
          )}
        >
          {easyMode ? "4 더 둘러보기" : "대전 더 둘러보기"}
        </p>
        <h2
          id="home-discovery-title"
          className={cx(
            "text-fixed-white mt-1 leading-tight font-semibold tracking-[-0.02em] break-keep",
            easyMode ? "mt-3 text-3xl font-extrabold sm:text-4xl" : "text-2xl sm:text-3xl"
          )}
        >
          지금 대전에서 관심받는 여행
        </h2>
        {!easyMode ? (
          <p className="text-fixed-white/75 mt-2 max-w-[48rem] text-sm leading-6 break-keep">
            위의 맞춤 추천과는 별개로, 사람들이 남긴 반응과 가까운 축제 소식을 모았어요.
          </p>
        ) : null}
      </header>

      <div
        className={cx(
          "grid min-w-0 grid-cols-[minmax(0,1fr)]",
          easyMode
            ? "gap-5 bg-[#EEF4F7] px-3 py-4 sm:gap-6 sm:px-6 sm:py-6"
            : "bg-surface gap-4 px-4 py-5 sm:gap-6 sm:px-6 sm:py-7 lg:px-7 lg:py-8"
        )}
      >
        {showLoading ? <DiscoverySkeleton easyMode={easyMode} /> : null}
        {!showLoading && hasLoadFailure ? <DiscoveryLoadNotice /> : null}
        {!showLoading && showReviewPlaces ? (
          <PlaceSection places={state.reviewPlaces} kind="review" easyMode={easyMode} />
        ) : null}
        {!showLoading && showFavoritePlaces ? (
          <PlaceSection places={state.favoritePlaces} kind="favorite" easyMode={easyMode} />
        ) : null}
        {!showLoading && showCourses ? (
          <CourseSection courses={state.courses} easyMode={easyMode} />
        ) : null}
        {visibleFestivals.length > 0 ? (
          <FestivalSection
            festivals={visibleFestivals}
            easyMode={easyMode}
            onOpenFestival={onOpenFestival}
          />
        ) : null}
      </div>
    </section>
  );
}

function PlaceSection({
  places,
  kind,
  easyMode
}: {
  places: HomeDiscoveryHotPlace[];
  kind: "review" | "favorite";
  easyMode: boolean;
}) {
  const isReviewSection = kind === "review";
  const titleId = isReviewSection ? "home-review-places-title" : "home-favorite-places-title";

  return (
    <section
      className={cx(
        "border-hairline bg-background overflow-hidden rounded-2xl border p-4 shadow-[0_16px_36px_-32px_rgba(18,64,54,0.55)] sm:p-6",
        easyMode && "rounded-3xl border-[3px] border-[#102A43] bg-white p-4 shadow-none sm:p-6"
      )}
      aria-labelledby={titleId}
    >
      <SectionTitle
        id={titleId}
        title={isReviewSection ? "후기 좋은 장소" : "즐겨찾기 많은 장소"}
        description={
          isReviewSection
            ? "직접 남긴 별점과 후기가 좋은 장소예요."
            : "사람들이 가장 많이 저장한 장소예요."
        }
        easyMode={easyMode}
      />
      <div
        className={cx(
          "mt-4",
          easyMode ? "grid gap-3" : "grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4"
        )}
      >
        {places.map((place, index) => (
          <Link
            key={place.id}
            href={buildHomePlaceMapHref({ id: place.id, title: place.name })}
            className={cx(
              "border-hairline group hover:border-brand-200 focus-visible:outline-brand-600 bg-background overflow-hidden rounded-xl border text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-3",
              !easyMode &&
                "hover:bg-surface grid min-h-[7rem] grid-cols-[6.75rem_minmax(0,1fr)] shadow-[0_14px_30px_-28px_rgba(19,44,38,0.75)] sm:block sm:min-h-0",
              easyMode &&
                "min-h-16 rounded-2xl border-[3px] border-[#102A43] bg-white shadow-[0_6px_0_#102A43]"
            )}
          >
            <span
              className={cx(
                "bg-surface relative block w-full overflow-hidden",
                easyMode
                  ? "aspect-[4/3]"
                  : "h-full min-h-[7rem] sm:aspect-[4/3] sm:h-auto sm:min-h-0"
              )}
            >
              <HomePlaceImage
                src={place.image || null}
                alt={place.name}
                compactFallback={!easyMode}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none"
              />
              <RankBadge rank={index + 1} />
            </span>
            <span
              className={cx(
                "min-w-0",
                easyMode ? "block p-5" : "flex flex-col justify-center p-3 sm:block"
              )}
            >
              <span
                className={cx(
                  "text-ink line-clamp-2 text-[0.95rem] leading-tight font-semibold sm:text-base",
                  easyMode && "text-2xl font-extrabold"
                )}
              >
                {place.name}
              </span>
              {!easyMode && place.address ? (
                <span className="text-steel mt-1 line-clamp-1 text-xs">{place.address}</span>
              ) : null}
              <span
                className={cx(
                  "text-brand-800 bg-brand-50 dark:bg-brand-900/35 dark:text-brand-200 mt-2 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold sm:mt-3",
                  easyMode && "dark:bg-brand-50 text-base text-[#102A43] dark:text-[#102A43]"
                )}
                role="img"
                aria-label={
                  isReviewSection
                    ? `평점 ${place.average_rating?.toFixed(1) ?? "없음"}점, 후기 ${place.review_count}개`
                    : `즐겨찾기 ${place.like_count}개`
                }
              >
                {isReviewSection ? (
                  <>
                    <Star className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate" aria-hidden="true">
                      {place.average_rating?.toFixed(1)} · 후기 {place.review_count}
                    </span>
                  </>
                ) : (
                  <>
                    <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="truncate" aria-hidden="true">
                      즐겨찾기 {place.like_count}
                    </span>
                  </>
                )}
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function CourseSection({
  courses,
  easyMode
}: {
  courses: RankedHomeDiscoveryCourse[];
  easyMode: boolean;
}) {
  return (
    <section
      className={cx(
        easyMode
          ? "border-hairline max-w-full min-w-0 overflow-hidden rounded-3xl border-[3px] border-[#102A43] bg-white p-4 sm:p-6"
          : "border-hairline bg-surface max-w-full min-w-0 overflow-hidden rounded-[1.35rem] border p-4 shadow-[0_18px_42px_-34px_rgba(0,72,58,0.8)] sm:p-6"
      )}
      aria-labelledby="home-course-title"
    >
      <SectionTitle
        id="home-course-title"
        title="인기 코스"
        description="후기와 즐겨찾기 반응이 좋은 공개 코스예요."
        easyMode={easyMode}
      />
      <div
        className={cx("mt-5 grid min-w-0 gap-4 sm:gap-5", courses.length > 1 && "lg:grid-cols-2")}
      >
        {courses.map((course, index) => (
          <Link
            key={course.course_id}
            href={`/course/${course.course_id}`}
            className={cx(
              easyMode
                ? "border-brand-100 group hover:border-brand-300 focus-visible:outline-brand-600 grid min-h-16 w-full min-w-0 overflow-hidden rounded-2xl border-[3px] border-[#102A43] bg-white text-left shadow-[0_6px_0_#102A43] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3"
                : "border-hairline bg-background group focus-visible:outline-brand-600 hover:border-brand-300 hover:bg-surface grid w-full min-w-0 overflow-hidden rounded-[1.15rem] border text-left shadow-[0_20px_44px_-34px_rgba(0,72,58,0.85)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3",
              !easyMode &&
                (courses.length === 1
                  ? "sm:grid-cols-[minmax(17rem,0.76fr)_minmax(0,1fr)] xl:grid-cols-[minmax(24rem,0.82fr)_minmax(0,1fr)]"
                  : "sm:grid-cols-[minmax(14rem,0.9fr)_1fr]"),
              easyMode &&
                (courses.length === 1
                  ? "sm:grid-cols-[minmax(15rem,0.42fr)_1fr] lg:max-w-4xl"
                  : "sm:grid-cols-[minmax(12rem,0.8fr)_1fr]")
            )}
          >
            <span
              className={cx(
                "bg-surface relative block aspect-[4/3] w-full min-w-0 overflow-hidden",
                easyMode ? "sm:aspect-auto sm:h-full" : "sm:aspect-auto sm:min-h-[18.5rem]"
              )}
            >
              <HomePlaceImage
                src={course.discoveryImage}
                fallbackSources={course.places.map((place) => place.firstimage)}
                alt={getCourseDiscoveryTitle(course)}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none"
              />
              <RankBadge rank={index + 1} />
            </span>
            <span className={cx("flex min-w-0 flex-col p-4 sm:p-6", easyMode && "p-5 sm:p-6")}>
              <span
                className={cx(
                  "text-ink line-clamp-2 text-xl leading-tight font-semibold",
                  easyMode && "text-2xl font-extrabold"
                )}
              >
                {getCourseDiscoveryTitle(course)}
              </span>
              {!easyMode ? (
                <>
                  <span className="text-steel mt-2 line-clamp-1 text-sm">
                    {course.places[0]?.title ?? "첫 장소"}에서 시작
                  </span>
                  <CoursePlaceTrail course={course} />
                </>
              ) : null}
              <span
                className={cx(
                  "text-brand-800 dark:text-brand-200 mt-3 flex flex-wrap gap-2 text-xs font-semibold",
                  easyMode && "text-base text-[#102A43] dark:text-[#102A43]"
                )}
              >
                <span
                  className="border-hairline bg-brand-50 dark:bg-brand-900/35 inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                  role="img"
                  aria-label={`찜 ${course.like_count}개`}
                >
                  <Heart className="h-3.5 w-3.5" aria-hidden="true" />
                  <span aria-hidden="true">{course.like_count}</span>
                </span>
                <span
                  className="border-hairline bg-background inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                  role="img"
                  aria-label={`평점 ${course.average_rating.toFixed(1)}점${
                    course.review_count ? `, 후기 ${course.review_count}개` : ""
                  }`}
                >
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  <span aria-hidden="true">
                    {course.average_rating.toFixed(1)}
                    {course.review_count ? ` · 후기 ${course.review_count}` : ""}
                  </span>
                </span>
                <span
                  className="border-hairline bg-background inline-flex items-center gap-1 rounded-full border px-2.5 py-1"
                  role="img"
                  aria-label={`장소 ${course.place_count || course.places.length}곳`}
                >
                  <Route className="h-3.5 w-3.5" aria-hidden="true" />
                  <span aria-hidden="true">{course.place_count || course.places.length}곳</span>
                </span>
              </span>
              <span
                className={cx(
                  "text-brand-800 dark:text-brand-200 mt-auto inline-flex items-center justify-end gap-2 pt-4 text-sm font-semibold",
                  easyMode && "min-h-12 text-lg text-[#007A62] dark:text-[#007A62]"
                )}
              >
                코스 보기
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
              </span>
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}

function FestivalSection({
  festivals,
  easyMode,
  onOpenFestival
}: {
  festivals: RankedHomePlace[];
  easyMode: boolean;
  onOpenFestival: (place: RankedHomePlace, trigger: HTMLElement) => void;
}) {
  return (
    <section
      className={cx(
        easyMode
          ? "rounded-3xl border-[3px] border-[#102A43] bg-white p-4 sm:p-6"
          : "border-hairline bg-surface overflow-hidden rounded-2xl border p-4 shadow-[0_16px_38px_-32px_rgba(70,64,38,0.45)] sm:p-6"
      )}
      aria-labelledby="home-festival-title"
    >
      <SectionTitle
        id="home-festival-title"
        title="다가오는 대전 축제"
        description="진행 중이거나 곧 시작하는 축제만 모았어요."
        easyMode={easyMode}
      />
      <div
        className={cx(
          "mt-5 grid gap-4 sm:gap-5",
          !easyMode && festivals.length > 1 && "lg:grid-cols-2 xl:grid-cols-3"
        )}
      >
        {festivals.map((festival) => (
          <FestivalCard
            key={festival.id}
            festival={festival}
            easyMode={easyMode}
            wide={!easyMode && festivals.length === 1}
            onOpenFestival={onOpenFestival}
          />
        ))}
      </div>
    </section>
  );
}

function CoursePlaceTrail({ course }: { course: RankedHomeDiscoveryCourse }) {
  const visiblePlaces = course.places.filter((place) => place.title).slice(0, 4);
  if (visiblePlaces.length === 0) return null;

  return (
    <ol className="mt-4 grid gap-2">
      {visiblePlaces.map((place, index) => (
        <li key={`${place.title}-${index}`} className="flex min-w-0 items-start gap-2">
          <span className="bg-brand-900 text-fixed-white mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-semibold">
            {index + 1}
          </span>
          <span className="text-slate line-clamp-1 text-sm leading-6">{place.title}</span>
        </li>
      ))}
    </ol>
  );
}

function FestivalCard({
  festival,
  easyMode,
  wide,
  onOpenFestival
}: {
  festival: RankedHomePlace;
  easyMode: boolean;
  wide: boolean;
  onOpenFestival: (place: RankedHomePlace, trigger: HTMLElement) => void;
}) {
  const period = formatHomeDiscoveryPeriod(festival.eventStartDate, festival.eventEndDate);
  const overview = cleanHomePresentationText(festival.overview, { maxLength: 160 });

  function openFestival(event: MouseEvent<HTMLButtonElement>) {
    onOpenFestival(festival, event.currentTarget);
  }

  return (
    <article className="min-w-0">
      <button
        type="button"
        onClick={openFestival}
        className={cx(
          easyMode
            ? "border-hairline group hover:border-brand-200 focus-visible:outline-brand-600 block h-full w-full overflow-hidden rounded-2xl border-[3px] border-[#102A43] bg-white text-left shadow-[0_6px_0_#102A43] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3"
            : cx(
                "border-hairline bg-background group hover:border-brand-200 hover:bg-surface focus-visible:outline-brand-600 grid h-full min-h-24 w-full overflow-hidden rounded-[1.15rem] border text-left shadow-[0_18px_38px_-32px_rgba(72,61,30,0.55)] transition-colors focus-visible:outline-2 focus-visible:outline-offset-3",
                wide
                  ? "sm:grid-cols-[minmax(16rem,0.76fr)_minmax(0,1fr)] xl:grid-cols-[minmax(24rem,0.82fr)_minmax(0,1fr)]"
                  : "sm:grid-cols-[minmax(13rem,0.95fr)_minmax(0,1fr)] lg:grid-cols-1"
              )
        )}
      >
        <span
          className={cx(
            "bg-surface relative block aspect-[4/3] w-full overflow-hidden",
            easyMode
              ? "sm:aspect-[16/10]"
              : wide
                ? "sm:aspect-auto sm:min-h-[18.5rem]"
                : "lg:aspect-[16/10]"
          )}
        >
          <HomePlaceImage
            src={festival.imageUrl}
            alt={festival.title}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.025] motion-reduce:transform-none"
          />
        </span>
        <span className={cx("flex min-w-0 flex-1 flex-col p-4 sm:p-6", easyMode && "p-5")}>
          <span
            className={cx(
              "text-brand-800 dark:text-brand-200 text-sm font-semibold",
              easyMode && "text-base text-[#007A62] dark:text-[#007A62]"
            )}
          >
            {period}
          </span>
          <span
            className={cx(
              "text-ink mt-1 line-clamp-2 text-lg leading-tight font-semibold",
              easyMode && "text-2xl font-extrabold"
            )}
          >
            {festival.title}
          </span>
          {!easyMode && festival.address ? (
            <span className="text-steel mt-1 line-clamp-1 text-xs">{festival.address}</span>
          ) : null}
          {!easyMode && overview ? (
            <span className="text-slate mt-3 line-clamp-3 text-sm leading-6 break-keep">
              {overview}
            </span>
          ) : null}
          <span
            className={cx(
              "text-brand-800 dark:text-brand-200 mt-auto inline-flex items-center gap-1 pt-2 text-sm font-semibold",
              easyMode && "min-h-12 text-lg text-[#007A62] dark:text-[#007A62]"
            )}
          >
            행사 정보
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 motion-reduce:transform-none" />
          </span>
        </span>
      </button>
    </article>
  );
}

function DiscoverySkeleton({ easyMode }: { easyMode: boolean }) {
  return (
    <section aria-labelledby="home-discovery-loading-title" aria-busy="true">
      <SectionTitle
        id="home-discovery-loading-title"
        title="요즘 반응을 확인 중"
        description="장소와 코스를 나란히 불러오고 있어요."
        easyMode={easyMode}
      />
      <div
        className={cx(
          "mt-4",
          easyMode ? "grid gap-3" : "grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4"
        )}
        aria-hidden="true"
      >
        {[0, 1, 2, 3].map((item) => (
          <div
            key={item}
            className={cx(
              "border-hairline bg-background overflow-hidden rounded-xl border",
              !easyMode &&
                "grid min-h-[7rem] grid-cols-[6.75rem_minmax(0,1fr)] shadow-[0_14px_30px_-28px_rgba(19,44,38,0.75)] sm:block sm:min-h-0",
              easyMode && "rounded-2xl border-[3px] border-[#102A43] bg-white"
            )}
          >
            <div
              className={cx(
                "bg-surface animate-pulse motion-reduce:animate-none",
                easyMode
                  ? "aspect-[4/3]"
                  : "h-full min-h-[7rem] sm:aspect-[4/3] sm:h-auto sm:min-h-0"
              )}
            />
            <div className={cx("space-y-2.5", easyMode ? "p-5" : "p-3 sm:p-3.5")}>
              <div className="bg-surface h-4 w-4/5 animate-pulse rounded motion-reduce:animate-none" />
              <div className="bg-surface h-3 w-2/3 animate-pulse rounded motion-reduce:animate-none" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only" role="status">
        홈 발견 목록을 불러오는 중입니다.
      </span>
    </section>
  );
}

function DiscoveryLoadNotice() {
  return (
    <p
      className="border-hairline bg-background text-steel rounded-xl border px-4 py-3 text-sm leading-6 break-keep"
      role="status"
    >
      일부 둘러보기 정보를 불러오지 못했어요. 확인된 장소와 축제 정보는 계속 볼 수 있어요.
    </p>
  );
}

function SectionTitle({
  id,
  title,
  description,
  easyMode
}: {
  id: string;
  title: string;
  description: string;
  easyMode: boolean;
}) {
  return (
    <div className="flex min-w-0 items-end justify-between gap-3">
      <div className="min-w-0">
        <h3
          id={id}
          className={cx(
            "text-ink leading-tight font-semibold",
            easyMode
              ? "inline-flex min-h-14 items-center rounded-2xl bg-[#102A43] px-4 text-2xl font-extrabold text-white sm:text-3xl"
              : "text-xl"
          )}
        >
          {title}
        </h3>
        {!easyMode ? <p className="text-steel mt-1 text-sm leading-5">{description}</p> : null}
      </div>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  return (
    <span className="text-fixed-white border-fixed-white/40 absolute top-2 left-2 rounded-full border bg-black/60 px-2 py-1 text-[0.68rem] font-semibold backdrop-blur-sm">
      {String(rank).padStart(2, "0")}
    </span>
  );
}

async function fetchJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Request failed: ${response.status}`);
  return (await response.json()) as T;
}

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}
