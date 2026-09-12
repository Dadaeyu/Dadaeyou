import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

/** 코스 추천(AI 호출) 인당 하루 제한 횟수 */
export const COURSE_RECOMMEND_DAILY_LIMIT = 3;

const COURSE_RECOMMEND_TIME_ZONE = "Asia/Seoul";

export class CourseRecommendUsageError extends Error {
  status: number;
  used: number;
  remaining: number;

  constructor(message: string, status: number, used: number, remaining: number) {
    super(message);
    this.name = "CourseRecommendUsageError";
    this.status = status;
    this.used = used;
    this.remaining = remaining;
  }
}

export type CourseRecommendUsage = {
  used: number;
  remaining: number;
  limit: number;
};

function getClientPeriod(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: COURSE_RECOMMEND_TIME_ZONE
  }).format(date);
}

/**
 * tb 접두 테이블이 아닌 course_recommend_daily_usage(supabase/schema-course-recommend-usage.sql)에
 * 원자적으로 카운트를 올린다. 한도 초과 시 CourseRecommendUsageError(429)를 던진다.
 */
export async function reserveCourseRecommendUsage(
  clientKey: string
): Promise<CourseRecommendUsage> {
  const clientPeriod = getClientPeriod();
  const supabase = createAdminClient();
  const { data, error } = await supabase.rpc("reserve_course_recommend_usage", {
    p_client_key: clientKey,
    p_client_period: clientPeriod,
    p_client_limit: COURSE_RECOMMEND_DAILY_LIMIT,
    p_usage: 1
  });

  if (error) {
    throw new CourseRecommendUsageError(
      "코스 추천 이용 횟수를 확인하지 못했어요. 잠시 뒤 다시 시도해 주세요.",
      503,
      0,
      0
    );
  }

  const reservation = Array.isArray(data) ? data[0] : data;
  if (!reservation?.allowed) {
    const used = Number(reservation?.used ?? 0);
    throw new CourseRecommendUsageError(
      `코스 추천은 하루 ${COURSE_RECOMMEND_DAILY_LIMIT}회까지 이용할 수 있어요. 내일 다시 시도해 주세요.`,
      429,
      used,
      Number(reservation?.remaining ?? 0)
    );
  }

  const used = Number(reservation.used ?? 0);
  return {
    used,
    remaining: Math.max(COURSE_RECOMMEND_DAILY_LIMIT - used, 0),
    limit: COURSE_RECOMMEND_DAILY_LIMIT
  };
}

/**
 * reserveCourseRecommendUsage로 올린 카운트를 되돌린다(supabase/schema-course-recommend-usage-release.sql).
 * 후보 장소는 충분해서 예약까지는 했지만 이후 LLM 호출/파싱이 실패해 결과를 못 만든 경우,
 * 사용자가 아무 코스도 못 받고 하루 횟수만 소진하지 않도록 실패 시 반드시 호출해야 한다.
 * 실패해도(예: RPC 자체 오류) 사용자 응답을 막을 정도는 아니라 조용히 무시한다.
 */
export async function releaseCourseRecommendUsage(clientKey: string): Promise<void> {
  const clientPeriod = getClientPeriod();
  const supabase = createAdminClient();
  await supabase.rpc("release_course_recommend_usage", {
    p_client_key: clientKey,
    p_client_period: clientPeriod,
    p_usage: 1
  });
}

/**
 * reserveCourseRecommendUsage 와 달리 카운트를 올리지 않고 오늘 이미 쓴 횟수만 조회한다.
 * "AI 코스 추천받기" 배너를 처음 렌더링할 때부터(실제로 누르기 전에) 오늘 사용 현황을
 * 보여주기 위한 용도 — 아직 오늘 쓴 적이 없으면 행 자체가 없으므로 0회로 취급한다.
 */
export async function peekCourseRecommendUsage(clientKey: string): Promise<CourseRecommendUsage> {
  const clientPeriod = getClientPeriod();
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from("course_recommend_daily_usage")
    .select("request_count")
    .eq("client_key", clientKey)
    .eq("client_period", clientPeriod)
    .maybeSingle();

  const used = error ? 0 : Number(data?.request_count ?? 0);
  return {
    used,
    remaining: Math.max(COURSE_RECOMMEND_DAILY_LIMIT - used, 0),
    limit: COURSE_RECOMMEND_DAILY_LIMIT
  };
}
