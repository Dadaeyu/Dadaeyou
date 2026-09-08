"use client";

import { useCallback, useEffect, useState } from "react";
import { Heart, MapPin, Route, FileText, Pencil, Settings } from "lucide-react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { fetchFavorites } from "@/lib/supabase/favorites";
import { fetchMyPlaceLikes } from "@/lib/supabase/place-likes";
import { fetchMyCourseLikes, formatCoursePeriod } from "@/lib/supabase/course-likes";
import { fetchMyCourses, courseDurationLabel, isCoursePublic } from "@/lib/supabase/courses";
import { fetchMyReports, REPORT_STATUS_LABELS } from "@/lib/supabase/reports";
import { fetchMyPosts } from "@/lib/supabase/community";
import {
  ageGroupToLabel,
  genderToLabel,
  type TourismMyCourse,
  type DbPlaceReport,
  type DbCommunityPost,
  type LikedPlace,
  type LikedCourse
} from "@/lib/supabase/types";
import {
  COMMUNITY_MAX_LEVEL,
  getCommunityLevelMeta,
  nextLevelThreshold
} from "@/lib/community/levels";
import { CommunityLevelBadge } from "@/components/community/CommunityLevelBadge";
import { usePlaces } from "@/context/PlacesContext";

type TabKey = "likes" | "saved" | "courses" | "posts" | "reports";

export default function MyPage() {
  const { user, member, preferences, loading: authLoading, refreshMember } = useAuth();
  const { places } = usePlaces();

  const gender = member ? (genderToLabel(member.gender) as "남성" | "여성" | "비공개") : "비공개";
  const age = member ? ageGroupToLabel(member.age_group) : "비공개";
  const access = preferences?.accessibility_needs ?? [];
  const themes = preferences?.theme_preferences ?? [];

  const [activeTab, setActiveTab] = useState<TabKey>("likes");
  const [likesSubTab, setLikesSubTab] = useState<"places" | "courses">("places");
  const [savedSubTab, setSavedSubTab] = useState<"places" | "courses">("places");
  const [likedPlaces, setLikedPlaces] = useState<LikedPlace[]>([]);
  const [likedCourses, setLikedCourses] = useState<LikedCourse[]>([]);
  const [savedPlaceIds, setSavedPlaceIds] = useState<number[]>([]);
  const [savedCourseIds, setSavedCourseIds] = useState<number[]>([]);
  const [myCourses, setMyCourses] = useState<TourismMyCourse[]>([]);
  const [myPosts, setMyPosts] = useState<DbCommunityPost[]>([]);
  const [reports, setReports] = useState<DbPlaceReport[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [pointEvents, setPointEvents] = useState<
    { id: number; amount: number; reason_label: string; created_at: string }[]
  >([]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setDataLoading(true);
    try {
      // 하나 실패해도 나머지가 비지 않도록 개별 settled 처리
      // (이전 Promise.all 은 좋아요/게시글 등 한 건 실패 시 내 코스까지 전부 버림)
      const settled = await Promise.allSettled([
        fetchMyPlaceLikes(user.id),
        fetchMyCourseLikes(user.id),
        fetchFavorites(user.id, "place"),
        fetchFavorites(user.id, "course"),
        fetchMyCourses(user.id),
        fetchMyPosts(user.id),
        fetchMyReports(user.id),
        fetch("/api/community/points?limit=8").then((r) => r.json().catch(() => ({}))),
        refreshMember()
      ]);

      const value = <T,>(i: number, fallback: T): T =>
        settled[i]?.status === "fulfilled"
          ? (settled[i] as PromiseFulfilledResult<T>).value
          : fallback;

      setLikedPlaces(value(0, []));
      setLikedCourses(value(1, []));
      setSavedPlaceIds(
        value(2, [] as Awaited<ReturnType<typeof fetchFavorites>>).map((f) => f.target_id)
      );
      setSavedCourseIds(
        value(3, [] as Awaited<ReturnType<typeof fetchFavorites>>).map((f) => f.target_id)
      );
      setMyCourses(value(4, []));
      setMyPosts(value(5, []));
      setReports(value(6, []));
      const pointsRes = value(7, {} as { items?: typeof pointEvents });
      setPointEvents(pointsRes.items ?? []);
    } finally {
      setDataLoading(false);
    }
  }, [user, refreshMember]);

  useEffect(() => {
    if (user) queueMicrotask(() => void loadData());
  }, [user, loadData]);

  const savedPlaces = places.filter((p) => savedPlaceIds.includes(p.id));
  const level = member?.community_level ?? 1;
  const levelMeta = getCommunityLevelMeta(level);
  const points = member?.community_points ?? 0;
  const nextLevelAt = nextLevelThreshold(level);
  const progressPct =
    nextLevelAt == null ? 100 : Math.min(100, Math.round((points / nextLevelAt) * 100));

  const tabs: { key: TabKey; label: string; count: number }[] = [
    { key: "likes", label: "좋아요", count: likedPlaces.length + likedCourses.length },
    { key: "saved", label: "즐겨찾기", count: savedPlaceIds.length + savedCourseIds.length },
    { key: "courses", label: "내 코스", count: myCourses.length },
    { key: "posts", label: "내 글", count: myPosts.length },
    { key: "reports", label: "제보 이력", count: reports.length }
  ];

  if (authLoading) {
    return <div className="py-20 text-center text-gray-500">로딩 중...</div>;
  }

  return (
    <div className="space-y-6">
      {/* 프로필 요약 — 아바타만 그라데이션에 걸치고, 닉네임은 흰 영역에 둔다 */}
      <div className="border-hairline bg-background overflow-hidden rounded-2xl border">
        <div className="from-navy-700 via-navy-600 to-brand-500 h-20 bg-gradient-to-br" />
        <div className="px-5 pb-5 md:px-6">
          <div className="-mt-10 mb-3 flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white text-4xl shadow-md ring-4 ring-white">
            {member?.avatar_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={member.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              "👤"
            )}
          </div>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-ink text-xl font-bold">{member?.nickname ?? "회원"}</h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span className="bg-surface text-steel rounded-full px-2 py-0.5 text-xs">
                  {gender}
                </span>
                <span className="bg-surface text-steel rounded-full px-2 py-0.5 text-xs">
                  {age}
                </span>
              </div>
            </div>
            <Link
              href="/mypage/settings"
              className="border-hairline text-steel hover:bg-surface flex items-center gap-1 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors"
            >
              <Pencil className="h-3.5 w-3.5" />
              프로필 편집
            </Link>
          </div>
        </div>
      </div>

      {/* 접근성 / 선호 테마 / 커뮤니티 점수 */}
      <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="border-hairline rounded-2xl border bg-white p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-bold text-gray-800">접근성</h3>
            <Link
              href="/mypage/settings/accessibility"
              className="text-brand-600 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              <Settings className="h-3 w-3" />
              설정
            </Link>
          </div>
          <p className="mb-3 text-xs text-gray-400">맞춤 추천에 반영되는 여행 접근성 니즈</p>
          {access.length === 0 ? (
            <p className="text-stone text-sm">선택한 접근성이 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {access.map((item) => (
                <span
                  key={item}
                  className="bg-brand-600 rounded-full px-3 py-1.5 text-xs font-medium text-white"
                >
                  {item}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="border-hairline rounded-2xl border bg-white p-5">
          <div className="mb-1 flex items-center justify-between gap-2">
            <h3 className="font-bold text-gray-800">선호 테마</h3>
            <Link
              href="/mypage/settings/themes"
              className="text-brand-600 inline-flex items-center gap-1 text-xs font-semibold hover:underline"
            >
              <Settings className="h-3 w-3" />
              설정
            </Link>
          </div>
          <p className="mb-3 text-xs text-gray-400">관심 테마를 설정에서 바꿀 수 있어요</p>
          {themes.length === 0 ? (
            <p className="text-stone text-sm">선택한 테마가 없어요.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {themes.map((t) => (
                <span
                  key={t}
                  className="bg-brand-600 rounded-full px-3 py-1.5 text-xs font-medium text-white"
                >
                  {t}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="from-navy-600 to-brand-500 shadow-navy-600/20 rounded-2xl bg-gradient-to-br p-5 text-white shadow-md">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-white/90">커뮤니티 점수</span>
            <CommunityLevelBadge level={level} size="md" tone="onDark" />
          </div>
          <div className="mb-3 text-3xl font-bold">
            {points}
            <span className="text-base font-medium text-white/70"> P</span>
          </div>
          <div className="mb-2 h-2 w-full rounded-full bg-white/20">
            <div className="bg-gold-400 h-2 rounded-full" style={{ width: `${progressPct}%` }} />
          </div>
          <p className="text-xs text-white/80">
            {level >= COMMUNITY_MAX_LEVEL
              ? `최고 등급(${levelMeta.label})에 도달했어요!`
              : `다음 등급까지 ${Math.max(0, (nextLevelAt ?? 0) - points)}P`}
          </p>
          {pointEvents.length > 0 && (
            <ul className="mt-3 space-y-1.5 border-t border-white/15 pt-3">
              {pointEvents.slice(0, 5).map((ev) => (
                <li
                  key={ev.id}
                  className="flex items-center justify-between gap-2 text-xs text-white/85"
                >
                  <span className="truncate">{ev.reason_label}</span>
                  <span className="shrink-0 font-semibold text-white">+{ev.amount}P</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 목록 탭 */}
      <div className="space-y-4">
        <div className="border-hairline flex gap-1 overflow-x-auto border-b">
          {tabs.map(({ key, label, count }) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                activeTab === key
                  ? "text-brand-600 border-brand-600 border-b-2"
                  : "text-gray-500 hover:text-gray-800"
              }`}
            >
              {label}
              <span
                className={`rounded-full px-1.5 py-0.5 text-xs ${
                  activeTab === key ? "bg-brand-100 text-brand-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {count}
              </span>
            </button>
          ))}
        </div>

        {dataLoading && <p className="py-6 text-center text-sm text-gray-400">불러오는 중...</p>}

        {!dataLoading && activeTab === "likes" && (
          <div className="space-y-4">
            <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
              {[
                { key: "places" as const, label: "장소", count: likedPlaces.length },
                { key: "courses" as const, label: "코스", count: likedCourses.length }
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setLikesSubTab(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                    likesSubTab === key
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      likesSubTab === key
                        ? "bg-brand-100 text-brand-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {likesSubTab === "places" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {likedPlaces.map((place) => (
                  <Link
                    key={place.like_id}
                    href={`/map?contentId=${encodeURIComponent(place.contentid)}`}
                    className="border-hairline flex items-center justify-between gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="bg-brand-50 flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg">
                        {place.firstimage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={place.firstimage}
                            alt=""
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <MapPin className="text-brand-500 h-5 w-5" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate font-semibold text-gray-800">{place.title}</h4>
                        <p className="mt-0.5 truncate text-xs text-gray-500">
                          {place.addr1 || "주소 정보 없음"}
                        </p>
                      </div>
                    </div>
                    <Heart className="h-3.5 w-3.5 shrink-0 fill-red-400 text-red-400" />
                  </Link>
                ))}
                {likedPlaces.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-gray-400">
                    좋아요한 장소가 없어요
                  </p>
                )}
              </div>
            )}

            {likesSubTab === "courses" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {likedCourses.map((course) => {
                  const period = formatCoursePeriod(course.startdate, course.enddate);
                  return (
                    <Link
                      key={course.like_id}
                      href={`/course/${course.course_id}`}
                      className="border-hairline flex items-center justify-between gap-3 rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-purple-50">
                          <Route className="h-5 w-5 text-purple-500" />
                        </div>
                        <div className="min-w-0">
                          <h4 className="truncate font-semibold text-gray-800">{course.title}</h4>
                          <p className="mt-0.5 truncate text-xs text-gray-500">
                            {period ?? "일정 미정"}
                          </p>
                        </div>
                      </div>
                      <Heart className="h-3.5 w-3.5 shrink-0 fill-red-400 text-red-400" />
                    </Link>
                  );
                })}
                {likedCourses.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-gray-400">
                    좋아요한 코스가 없어요
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!dataLoading && activeTab === "saved" && (
          <div className="space-y-4">
            <div className="flex w-fit gap-1 rounded-xl bg-gray-100 p-1">
              {[
                { key: "places" as const, label: "장소", count: savedPlaces.length },
                { key: "courses" as const, label: "코스", count: savedCourseIds.length }
              ].map(({ key, label, count }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setSavedSubTab(key)}
                  className={`flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition-colors ${
                    savedSubTab === key
                      ? "bg-white text-gray-800 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {label}
                  <span
                    className={`rounded-full px-1.5 py-0.5 text-xs ${
                      savedSubTab === key
                        ? "bg-brand-100 text-brand-700"
                        : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {count}
                  </span>
                </button>
              ))}
            </div>

            {savedSubTab === "places" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedPlaces.map((place) => (
                  <Link
                    key={place.id}
                    href={`/map?place=${place.id}`}
                    className="border-hairline flex items-center justify-between rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="bg-brand-50 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xl">
                        {place.emoji}
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate font-semibold text-gray-800">{place.name}</h4>
                        <p className="mt-0.5 text-xs text-gray-500">{place.category}</p>
                      </div>
                    </div>
                    <Heart className="h-3.5 w-3.5 shrink-0 fill-red-400 text-red-400" />
                  </Link>
                ))}
                {savedPlaces.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-gray-400">
                    저장한 장소가 없어요
                  </p>
                )}
              </div>
            )}

            {savedSubTab === "courses" && (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {savedCourseIds.map((id) => (
                  <Link
                    key={id}
                    href={`/course/${id}`}
                    className="border-hairline rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
                  >
                    <div className="mb-2.5 flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50">
                        <Route className="h-5 w-5 text-purple-500" />
                      </div>
                      <h4 className="truncate font-semibold text-gray-800">코스 #{id}</h4>
                    </div>
                    <Heart className="h-3.5 w-3.5 fill-red-400 text-red-400" />
                  </Link>
                ))}
                {savedCourseIds.length === 0 && (
                  <p className="col-span-full py-8 text-center text-sm text-gray-400">
                    저장한 코스가 없어요
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {!dataLoading && activeTab === "courses" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {myCourses.map((course) => {
              const thumb = course.places.find((p) => p.firstimage)?.firstimage;
              const previewNames = course.places
                .slice(0, 3)
                .map((p) => p.title)
                .join(" · ");
              return (
                <Link
                  key={course.course_id}
                  href={`/course/${course.course_id}`}
                  className="border-hairline overflow-hidden rounded-xl border bg-white transition-shadow hover:shadow-md"
                >
                  {thumb ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumb} alt="" className="h-28 w-full object-cover" />
                  ) : (
                    <div className="bg-brand-50 flex h-28 items-center justify-center">
                      <Route className="text-brand-600 h-8 w-8" />
                    </div>
                  )}
                  <div className="p-4">
                    <h4 className="truncate font-semibold text-gray-800">{course.course_nm}</h4>
                    <p className="mt-1 text-sm text-gray-500">
                      {courseDurationLabel(course)} · {isCoursePublic(course) ? "공개" : "비공개"}
                    </p>
                    <p className="mt-1 text-xs text-gray-400">
                      {course.place_count > 0
                        ? `장소 ${course.place_count}곳${course.day_count > 0 ? ` · ${course.day_count}일` : ""}`
                        : "등록된 장소 없음"}
                    </p>
                    {previewNames ? (
                      <p className="mt-1 truncate text-xs text-gray-500">{previewNames}</p>
                    ) : null}
                  </div>
                </Link>
              );
            })}
            {myCourses.length === 0 && (
              <p className="col-span-full py-8 text-center text-sm text-gray-400">
                만든 코스가 없어요
              </p>
            )}
          </div>
        )}

        {!dataLoading && activeTab === "posts" && (
          <div className="space-y-3">
            {myPosts.map((post) => (
              <Link
                key={post.id}
                href={`/community/${post.id}`}
                className="border-hairline block rounded-xl border bg-white p-4 transition-shadow hover:shadow-md"
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="bg-brand-100 text-brand-700 rounded-full px-2 py-0.5 text-xs font-medium">
                    {post.post_type}
                  </span>
                  <h4 className="truncate font-semibold text-gray-800">{post.title}</h4>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                  <span>{new Date(post.created_at).toLocaleDateString("ko-KR")}</span>
                  <span className="flex items-center gap-1">
                    <Heart className="h-3.5 w-3.5" />
                    {post.like_count}
                  </span>
                  <span className="flex items-center gap-1">
                    <FileText className="h-3.5 w-3.5" />
                    {post.comment_count}
                  </span>
                </div>
              </Link>
            ))}
            {myPosts.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">작성한 글이 없어요</p>
            )}
          </div>
        )}

        {!dataLoading && activeTab === "reports" && (
          <div className="space-y-3">
            {reports.map((report) => (
              <div
                key={report.id}
                className="border-hairline flex items-start justify-between gap-3 rounded-xl border bg-white p-4"
              >
                <div className="min-w-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="truncate font-semibold text-gray-800">
                      {report.target_name}
                    </span>
                    <span
                      className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                        report.status === "approved"
                          ? "bg-brand-100 text-brand-700"
                          : "bg-gold-100 text-gold-700"
                      }`}
                    >
                      {REPORT_STATUS_LABELS[report.status]}
                    </span>
                  </div>
                  <p className="truncate text-sm text-gray-600">{report.content}</p>
                  <p className="mt-1 text-xs text-gray-400">
                    {new Date(report.created_at).toLocaleDateString("ko-KR")}
                  </p>
                </div>
                {report.points_awarded > 0 && (
                  <div className="text-brand-600 shrink-0 font-bold">+{report.points_awarded}P</div>
                )}
              </div>
            ))}
            {reports.length === 0 && (
              <p className="py-8 text-center text-sm text-gray-400">제보 이력이 없어요</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
