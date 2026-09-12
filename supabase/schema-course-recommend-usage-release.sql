-- 코스 추천 실패 시 하루 이용 횟수를 되돌려주는 RPC.
-- 증상: reserveCourseRecommendUsage()가 AI 호출 직전에 카운트를 올리는데, 이후 단계(장소
-- 후보 부족, DEEPSEEK_API_KEY 미설정, LLM 호출 실패/빈 결과)에서 실패해도 이미 올라간
-- 카운트는 그대로 남아 사용자가 "결과 없이" 하루 횟수만 소진하는 문제가 있었다.
-- 해결: 실패한 시도는 이 함수로 원자적으로 -1 되돌린다(0 밑으로는 안 내려감). 이 함수는
-- reserve_course_recommend_usage와 마찬가지로 서버 전용 코드(usage.ts, admin 클라이언트)에서만
-- 호출되므로 RLS/권한 부여는 따로 필요 없다.

create or replace function public.release_course_recommend_usage(
  p_client_key text,
  p_client_period text,
  p_usage int default 1
)
returns void
language plpgsql
as $$
begin
  update public.course_recommend_daily_usage
  set request_count = greatest(request_count - p_usage, 0),
      updated_at = now()
  where client_key = p_client_key
    and client_period = p_client_period;
end;
$$;
