-- 코스 편집 저장을 원자적으로 만든다.
-- 증상: 코스 편집 저장이 tb_course update → tb_course_detail 전체 delete → 재insert 순서로
-- 클라이언트에서 3번 나눠 호출됐다. delete는 성공하고 insert가 실패하면(네트워크 끊김, 검증
-- 실패 등) 기존 장소 일정이 통째로 사라진 채 저장 오류만 뜬다.
-- 해결: 세 단계를 plpgsql 함수 하나로 묶는다. RPC 호출 하나는 그 자체로 하나의 SQL 문이라
-- Postgres가 통째로 하나의 트랜잭션으로 실행하므로, 중간에 예외가 나면 update/delete/insert가
-- 전부 롤백되어 원래 장소 일정이 보존된다. security invoker(기본값)라서 RLS는 호출한 사용자
-- 기준으로 그대로 적용된다(다른 사람 코스는 여전히 수정 불가).

create or replace function public.update_course_with_details(
  p_course_id bigint,
  p_course_nm text,
  p_open_yn text,
  p_startdate date,
  p_enddate date,
  p_updater text,
  p_details jsonb
)
returns void
language plpgsql
as $$
begin
  update public.tb_course
  set course_nm = p_course_nm,
      open_yn = p_open_yn,
      startdate = p_startdate,
      enddate = p_enddate,
      updatetime = now(),
      updater = p_updater
  where course_id = p_course_id;

  if not found then
    raise exception 'course % not found or not permitted', p_course_id;
  end if;

  delete from public.tb_course_detail where course_id = p_course_id;

  insert into public.tb_course_detail (course_id, day, place_id, starthour, endhour)
  select
    p_course_id,
    (item->>'day')::int,
    (item->>'place_id')::int,
    (item->>'starthour')::int,
    (item->>'endhour')::int
  from jsonb_array_elements(coalesce(p_details, '[]'::jsonb)) as item;
end;
$$;

grant execute on function public.update_course_with_details(
  bigint, text, text, date, date, text, jsonb
) to authenticated;
