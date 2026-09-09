import { supabase } from "@/lib/supabase";

// 접근성/별점/인원수/일정 필터 헬퍼 — /api/search 와 /api/courses/recommend 가 공유한다.
// route.ts 파일은 HTTP 핸들러/설정 외의 값을 export 하면 안 되는 Next.js 규칙이 있어
// (빌드 시 checkFields 에러) 여기 별도 모듈로 뒀다.

// 접근성 필터 값(tb_code BARRIERFREE 의 code_id) → tb_place_barrierfree 의 has_* 플래그 매핑.
// 필터 옵션은 /api/codes/filter-options 에서 오며 임산부(MT)·고령자(SN)는 데이터가 없어 제외된다.
const BARRIERFREE_COLS: Record<string, string> = {
  BD: "has_blind", // 시각장애
  DF: "has_deaf", // 청각장애
  GT: "has_gait", // 보행장애
  IF: "has_infant" // 영유아
};

// 선택된 접근성 유형들을 OR로 합친다 (예: 청각+보행 선택 시 둘 중 하나라도 true면 노출).
export async function getBarrierFreeIds(types: string[]): Promise<string[]> {
  const cols = Array.from(new Set(types.map((t) => BARRIERFREE_COLS[t]).filter(Boolean)));
  if (cols.length === 0) return [];

  const { data, error } = await supabase
    .from("tb_place_barrierfree")
    .select("contentid")
    .or(cols.map((c) => `${c}.eq.true`).join(","));

  if (error) throw error;

  return (data ?? []).map((row) => row.contentid as string);
}

// 별점 필터: 후기 게시판(board_id=1)의 장소별 평균 별점이 minRating 이상인 contentid 목록.
// 후기가 없는 장소는 목록에 없어 자연히 제외된다(포함 방식). minRating<=0 이면 필터 안 함.
const REVIEW_BOARD_ID = 1;
export async function getRatedContentIds(minRating: number): Promise<string[]> {
  if (minRating <= 0) return [];
  const { data } = await supabase
    .from("tb_post")
    .select("content_id, rating")
    .eq("board_id", REVIEW_BOARD_ID)
    .eq("use_yn", true)
    .not("rating", "is", null)
    .not("content_id", "is", null);

  const grouped = new Map<string, { sum: number; count: number }>();
  for (const row of data ?? []) {
    const cid = row.content_id as string;
    const g = grouped.get(cid) ?? { sum: 0, count: 0 };
    g.sum += row.rating as number;
    g.count += 1;
    grouped.set(cid, g);
  }
  const ids: string[] = [];
  for (const [cid, g] of grouped) {
    if (g.sum / g.count >= minRating) ids.push(cid); // 평균 별점 ≥ 선택값
  }
  return ids;
}

// 인원수 필터로 "제외"할 contentid 목록.
// 요청 인원(headcount)을 확실히 수용 못 하는 곳만 제외한다. (null = 정보 없음 → 제외 안 함)
//  - accommax < headcount : 최대 수용이 요청보다 적음 (수용 초과)
//  - accommin > headcount : 최소 인원이 요청보다 많음 (단체 전용 등, 인원 미달)
//  ※ lt/gt 는 null 을 매칭하지 않으므로 "정보 없음"은 자동으로 통과된다. 1명도 실제 값으로 취급해 필터한다.
export async function getHeadcountExcludeIds(headcount: number): Promise<string[]> {
  if (headcount < 1) return [];
  const { data } = await supabase
    .from("tb_place_detail_normalized")
    .select("contentid")
    .or(`accommax.lt.${headcount},accommin.gt.${headcount}`);
  return (data ?? []).map((row) => row.contentid as string);
}

// "YYYY-MM-DD" → ISO 요일 (월=1 … 일=7)
function isoWeekday(dateStr: string): number {
  const g = new Date(`${dateStr}T00:00:00`).getDay(); // 0=일
  return g === 0 ? 7 : g;
}

// 축제/공연/행사(lclssystm1='EV')는 "요일별 휴무"라는 개념이 없다 — eventstartdate ~
// eventenddate 기간에만 실제로 열린다. 요청한 [dateFrom ~ dateTo]와 이 기간이 전혀 안 겹치면
// 제외한다(하루라도 겹치면 노출 유지). 날짜 정보가 없는 축제는 판정 불가이니 제외하지 않는다.
async function getEventScheduleExcludeIds(
  fromYmd: string,
  toYmd: string,
  evIds: string[]
): Promise<string[]> {
  if (evIds.length === 0) return [];

  const { data: evDetails } = await supabase
    .from("tb_place_detail_normalized")
    .select("contentid, eventstartdate, eventenddate")
    .in("contentid", evIds);

  const exclude: string[] = [];
  for (const row of evDetails ?? []) {
    const start = row.eventstartdate as string | null;
    const end = row.eventenddate as string | null;
    if (!start && !end) continue; // 날짜 정보 없음 → 판정 불가, 노출 유지
    // 한쪽만 있으면 그 값으로 시작/끝을 채워 단일 날짜 행사로 취급한다.
    const s = start || end!;
    const e = end || start!;
    if (e < fromYmd || s > toYmd) exclude.push(row.contentid as string); // 기간이 전혀 안 겹침
  }
  return exclude;
}

// 일정(휴무일) 필터로 "제외"할 contentid 목록.
// [dateFrom ~ dateTo] 기간 "내내" 확실히 문을 닫는 곳만 제외한다. (하루라도 열면 노출 유지)
//  - 기간의 모든 요일을 매주 휴무하는 곳 (요일만으로 기간 내내 휴무)
//  - 공휴일 휴무이면서 비공휴일 날은 요일로 전부 닫는 곳 → 결국 기간 내내 휴무.
//    (기간이 전부 공휴일이면 공휴일 휴무만으로도 기간 내내 휴무이므로 제외)
// has_irregular_closing(부정기 휴무)는 특정 날짜 판정이 불가하므로 제외하지 않는다(노출 유지).
// 축제/공연/행사(EV)는 위 요일 로직 대신 getEventScheduleExcludeIds 의 행사 기간 겹침 판정을 쓴다.
export async function getScheduleExcludeIds(dateFrom: string, dateTo: string): Promise<string[]> {
  const from = dateFrom || dateTo;
  const to = dateTo || dateFrom;
  if (!from) return [];

  const fromYmd = from.replace(/-/g, "");
  const toYmd = to.replace(/-/g, "");

  // 기간 내 공휴일 날짜(YYYYMMDD) 집합
  const { data: holis } = await supabase
    .from("tb_holiday")
    .select("locdate")
    .gte("locdate", fromYmd)
    .lte("locdate", toYmd)
    .eq("isholiday", "Y");
  const holidaySet = new Set((holis ?? []).map((h) => String(h.locdate)));

  // 기간의 요일 집합 / 비공휴일 요일 집합
  const start = new Date(`${from}T00:00:00`).getTime();
  const end = new Date(`${to}T00:00:00`).getTime();
  const DAY = 86400000;
  const allWeekdays = new Set<number>();
  const nonHolidayWeekdays = new Set<number>();
  for (let t = start; t <= end; t += DAY) {
    const d = new Date(t);
    const wd = d.getDay() === 0 ? 7 : d.getDay();
    const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
    allWeekdays.add(wd);
    if (!holidaySet.has(ymd)) nonHolidayWeekdays.add(wd);
    if (allWeekdays.size === 7) break; // 한 주 이상이면 모든 요일 확정
  }
  if (allWeekdays.size === 0) allWeekdays.add(isoWeekday(from));

  const exclude = new Set<string>();

  // 1) 기간의 모든 요일을 닫는 곳 → 요일만으로 기간 내내 휴무 (closed_weekdays ⊇ 기간 요일들)
  const { data: byAllWeekdays } = await supabase
    .from("tb_place_detail_normalized")
    .select("contentid")
    .contains("closed_weekdays", [...allWeekdays]);
  for (const r of byAllWeekdays ?? []) exclude.add(r.contentid as string);

  // 2) 공휴일 휴무이면서 비공휴일 날은 모두 요일로 닫는 곳 → 기간 내내 휴무
  //    비공휴일 요일이 없으면(기간 전부 공휴일) 공휴일 휴무만으로 제외.
  if (nonHolidayWeekdays.size === 0) {
    const { data } = await supabase
      .from("tb_place_detail_normalized")
      .select("contentid")
      .eq("closed_holiday", true);
    for (const r of data ?? []) exclude.add(r.contentid as string);
  } else {
    const { data } = await supabase
      .from("tb_place_detail_normalized")
      .select("contentid")
      .eq("closed_holiday", true)
      .contains("closed_weekdays", [...nonHolidayWeekdays]);
    for (const r of data ?? []) exclude.add(r.contentid as string);
  }

  // EV(축제/공연/행사)는 요일 기반 판정 대상이 아니므로, 혹시 위 로직으로 걸렸더라도 빼고
  // 행사 기간 겹침 판정 결과로 완전히 대체한다.
  const { data: evPlaces } = await supabase
    .from("tb_place")
    .select("contentid")
    .eq("lclssystm1", "EV");
  const evIds = (evPlaces ?? []).map((r) => r.contentid as string);
  for (const id of evIds) exclude.delete(id);
  for (const id of await getEventScheduleExcludeIds(fromYmd, toYmd, evIds)) exclude.add(id);

  return [...exclude];
}
