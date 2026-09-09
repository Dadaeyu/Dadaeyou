import { NextResponse } from "next/server";
import {
  loadHomeCourseSummaries,
  type HomeCourseDetailRow,
  type HomeCourseLikeRow,
  type HomeCoursePlaceRow,
  type HomeCourseRatingRow,
  type HomeCourseRow,
  type HomeCourseSummaryQueries
} from "@/features/home/server/homeCourseSummary";
import { createAdminClient } from "@/lib/supabase/admin";
import { T } from "@/lib/supabase/tables";

export const dynamic = "force-dynamic";

const SUCCESS_CACHE_CONTROL = "public, max-age=0, must-revalidate";
const SUCCESS_CDN_CACHE_CONTROL = "public, s-maxage=60, stale-while-revalidate=60";

export async function GET() {
  const startedAt = performance.now();

  try {
    const items = await loadHomeCourseSummaries(createQueries(createAdminClient()));
    return NextResponse.json(
      { items },
      {
        headers: {
          "Cache-Control": SUCCESS_CACHE_CONTROL,
          "Vercel-CDN-Cache-Control": SUCCESS_CDN_CACHE_CONTROL,
          "Server-Timing": formatServerTiming(startedAt)
        }
      }
    );
  } catch {
    return NextResponse.json(
      { error: "홈 인기 코스를 불러오지 못했습니다." },
      {
        status: 500,
        headers: {
          "Cache-Control": "private, no-store",
          "Vercel-CDN-Cache-Control": "no-store",
          "Server-Timing": formatServerTiming(startedAt)
        }
      }
    );
  }
}

function createQueries(admin: ReturnType<typeof createAdminClient>): HomeCourseSummaryQueries {
  return {
    async loadCourses() {
      const { data, error } = await admin
        .from(T.course)
        .select("course_id, course_nm, open_yn, delete_yn")
        .eq("open_yn", "Y")
        .or("delete_yn.is.null,delete_yn.eq.N");
      if (error) throw error;
      return (data ?? []) as HomeCourseRow[];
    },
    async loadLikes(courseIds) {
      const { data, error } = await admin
        .from(T.courseLikes)
        .select("course_id")
        .in("course_id", [...courseIds]);
      if (error) throw error;
      return (data ?? []) as HomeCourseLikeRow[];
    },
    async loadRatings(courseIds) {
      const { data, error } = await admin
        .from(T.boardPosts)
        .select("course_id, course_rating")
        .eq("board_id", 1)
        .eq("use_yn", true)
        .not("course_rating", "is", null)
        .not("course_id", "is", null)
        .in("course_id", [...courseIds]);
      if (error) throw error;
      return (data ?? []) as HomeCourseRatingRow[];
    },
    async loadDetails(courseIds) {
      const { data, error } = await admin
        .from(T.courseDetail)
        .select("course_id, day, place_id")
        .in("course_id", [...courseIds])
        .order("day", { ascending: true });
      if (error) throw error;
      return (data ?? []) as HomeCourseDetailRow[];
    },
    async loadPlaces(placeIds) {
      const { data, error } = await admin
        .from(T.place)
        .select("place_id, title, firstimage, use_yn, delete_yn")
        .in("place_id", [...placeIds])
        .eq("use_yn", "Y")
        .or("delete_yn.is.null,delete_yn.eq.N");
      if (error) throw error;
      return (data ?? []) as HomeCoursePlaceRow[];
    }
  };
}

function formatServerTiming(startedAt: number) {
  return `home_courses;dur=${Math.max(0, performance.now() - startedAt).toFixed(1)}`;
}
