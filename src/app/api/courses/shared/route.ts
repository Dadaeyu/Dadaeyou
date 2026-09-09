import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { T } from "@/lib/supabase/tables";
import type { TourismCoursePlace, TourismSharedCourse } from "@/lib/supabase/types";
import { getBakeryPlaceIds, splitThemeSelection, BAKERY_THEME_CODE } from "@/lib/theme/bakeryTheme";
import { normalizeContentIds } from "@/lib/chat/discoveryLinks";

export const dynamic = "force-dynamic";

type CourseRow = {
  course_id: number;
  course_nm: string | null;
  open_yn: string | null;
  startdate: string | null;
  enddate: string | null;
  register: string | null;
  registtime: string | null;
  updatetime: string | null;
  delete_yn: string | null;
};

type DetailRow = {
  detail_id: number;
  course_id: number;
  day: number | null;
  place_id: number | null;
  starthour: number | null;
  endhour: number | null;
};

type PlaceRow = {
  place_id: number;
  title: string | null;
  addr1: string | null;
  firstimage: string | null;
  contentid: string | null;
  lclssystm1: string | null;
  delete_yn: string | null;
};

type MemberRow = {
  id: string;
  nickname: string | null;
  role: string | null;
};

function isActiveFlag(yn: string | null | undefined): boolean {
  return yn == null || yn === "" || yn.toUpperCase() === "N";
}

// 접근성 필터 값(tb_code BARRIERFREE 의 code_id) → tb_place_barrierfree 의 has_* 플래그 매핑.
// /api/search 와 동일한 매핑 (필터 옵션은 /api/codes/filter-options 에서 옴).
const BARRIERFREE_COLS: Record<string, string> = {
  BD: "has_blind",
  DF: "has_deaf",
  GT: "has_gait",
  IF: "has_infant"
};

/** 주어진 place_id 들 중 하나라도 포함된 코스들의 course_id 집합 (tb_course_detail 조회) */
async function courseIdsContainingPlaces(
  admin: ReturnType<typeof createAdminClient>,
  placeIds: number[]
): Promise<Set<number>> {
  if (placeIds.length === 0) return new Set();
  const { data, error } = await admin
    .from(T.courseDetail)
    .select("course_id, place_id")
    .in("place_id", placeIds);
  if (error) throw error;
  return new Set((data ?? []).map((r) => r.course_id as number));
}

/** 선택된 테마 코드(LCLSSYSTM1)에 해당하는 장소가 하나라도 있는 코스 id 집합.
 * "빵지순례"(BK)는 tb_code 상 가상 코드라 lclssystm1로 못 걸러서 getBakeryPlaceIds()로 따로 구한다. */
async function courseIdsMatchingThemes(
  admin: ReturnType<typeof createAdminClient>,
  themeCodes: string[]
): Promise<Set<number>> {
  if (themeCodes.length === 0) return new Set();
  const { officialCodes, includeBakery } = splitThemeSelection(themeCodes);

  const placeIds = new Set<number>();
  if (officialCodes.length > 0) {
    const { data, error } = await admin
      .from(T.place)
      .select("place_id")
      .in("lclssystm1", officialCodes);
    if (error) throw error;
    for (const p of data ?? []) placeIds.add(p.place_id as number);
  }
  if (includeBakery) {
    for (const id of await getBakeryPlaceIds()) placeIds.add(id);
  }

  return courseIdsContainingPlaces(admin, [...placeIds]);
}

/** 선택된 접근성 코드(BARRIERFREE)에 해당하는 장소가 하나라도 있는 코스 id 집합 */
async function courseIdsMatchingAccessibility(
  admin: ReturnType<typeof createAdminClient>,
  accessCodes: string[]
): Promise<Set<number>> {
  const cols = Array.from(new Set(accessCodes.map((c) => BARRIERFREE_COLS[c]).filter(Boolean)));
  if (cols.length === 0) return new Set();

  const { data: bfRows, error: bfErr } = await admin
    .from("tb_place_barrierfree")
    .select("contentid")
    .or(cols.map((c) => `${c}.eq.true`).join(","));
  if (bfErr) throw bfErr;
  const contentIds = [...new Set((bfRows ?? []).map((r) => String(r.contentid)))];
  if (contentIds.length === 0) return new Set();

  const { data: placeRows, error: placeErr } = await admin
    .from(T.place)
    .select("place_id")
    .in("contentid", contentIds);
  if (placeErr) throw placeErr;
  const placeIds = (placeRows ?? []).map((p) => p.place_id as number);
  return courseIdsContainingPlaces(admin, placeIds);
}

/**
 * 코스에 포함된 "모든" 장소가 선택한 구(+동)에 속하는 코스 id 집합.
 * 테마/접근성(하나라도 매치=OR)과 달리 위치는 전부 매치해야 한다 — 장소 하나라도 다른 구에
 * 있으면 그 코스는 제외. 위치 정보가 없는 장소가 섞여 있어도 보수적으로 매치 실패 처리한다.
 */
async function courseIdsWithAllPlacesInLocation(
  admin: ReturnType<typeof createAdminClient>,
  gu: string,
  dong: string
): Promise<Set<number>> {
  const { data: details, error: detailsErr } = await admin
    .from(T.courseDetail)
    .select("course_id, place_id");
  if (detailsErr) throw detailsErr;

  const placeIdsByCourse = new Map<number, number[]>();
  for (const d of (details ?? []) as { course_id: number; place_id: number | null }[]) {
    if (d.place_id == null) continue;
    const list = placeIdsByCourse.get(d.course_id) ?? [];
    list.push(d.place_id);
    placeIdsByCourse.set(d.course_id, list);
  }
  const allPlaceIds = [...new Set([...placeIdsByCourse.values()].flat())];
  if (allPlaceIds.length === 0) return new Set();

  const { data: places, error: placesErr } = await admin
    .from(T.place)
    .select("place_id, ldongsigngucd, dong")
    .in("place_id", allPlaceIds);
  if (placesErr) throw placesErr;
  const locationByPlace = new Map<number, { gu: string | null; dong: string | null }>();
  for (const p of (places ?? []) as {
    place_id: number;
    ldongsigngucd: string | null;
    dong: string | null;
  }[]) {
    locationByPlace.set(p.place_id, { gu: p.ldongsigngucd, dong: p.dong });
  }

  const matched = new Set<number>();
  for (const [courseId, placeIds] of placeIdsByCourse) {
    if (placeIds.length === 0) continue;
    const allMatch = placeIds.every((pid) => {
      const loc = locationByPlace.get(pid);
      if (!loc || loc.gu !== gu) return false;
      if (dong && loc.dong !== dong) return false;
      return true;
    });
    if (allMatch) matched.add(courseId);
  }
  return matched;
}

/** contentid 목록(tb_place_detail_normalized 기준) → 그 장소를 하나라도 포함한 코스 id 집합 */
async function courseIdsContainingContentIds(
  admin: ReturnType<typeof createAdminClient>,
  contentIds: string[]
): Promise<Set<number>> {
  if (contentIds.length === 0) return new Set();
  const { data: placeRows, error: placeErr } = await admin
    .from(T.place)
    .select("place_id")
    .in("contentid", contentIds);
  if (placeErr) throw placeErr;
  const placeIds = (placeRows ?? []).map((p) => p.place_id as number);
  return courseIdsContainingPlaces(admin, placeIds);
}

// "YYYY-MM-DD" → ISO 요일 (월=1 … 일=7)
function isoWeekday(dateStr: string): number {
  const g = new Date(`${dateStr}T00:00:00`).getDay();
  return g === 0 ? 7 : g;
}

/**
 * 인원수 필터 — 코스에 포함된 장소 중 하나라도 요청 인원(headcount)을 확실히 수용 못 하면
 * 그 코스는 제외한다. (/api/search 의 getHeadcountExcludeIds 와 동일 판정, 코스 단위로 확장)
 * accommax < headcount(수용 초과) 또는 accommin > headcount(인원 미달)인 장소만 "수용 불가"로
 * 본다 — null(정보 없음)은 lt/gt 에 안 걸려 자동으로 통과(수용 가능 취급).
 */
async function courseIdsExcludedByHeadcount(
  admin: ReturnType<typeof createAdminClient>,
  headcount: number
): Promise<Set<number>> {
  if (headcount < 1) return new Set();
  const { data, error } = await admin
    .from("tb_place_detail_normalized")
    .select("contentid")
    .or(`accommax.lt.${headcount},accommin.gt.${headcount}`);
  if (error) throw error;
  const contentIds = [...new Set((data ?? []).map((r) => String(r.contentid)))];
  return courseIdsContainingContentIds(admin, contentIds);
}

/**
 * 일정 필터 — 코스에 포함된 장소 중 하나라도 [dateFrom~dateTo] 기간 "내내" 확실히 문을 닫으면
 * 그 코스는 제외한다. (/api/search 의 getScheduleExcludeIds 와 동일 판정, 코스 단위로 확장)
 * has_irregular_closing(부정기 휴무)는 특정 날짜 판정이 불가하므로 제외하지 않는다.
 */
async function courseIdsExcludedBySchedule(
  admin: ReturnType<typeof createAdminClient>,
  dateFrom: string,
  dateTo: string
): Promise<Set<number>> {
  const from = dateFrom || dateTo;
  const to = dateTo || dateFrom;
  if (!from) return new Set();

  const fromYmd = from.replace(/-/g, "");
  const toYmd = to.replace(/-/g, "");

  const { data: holis, error: holisErr } = await admin
    .from("tb_holiday")
    .select("locdate")
    .gte("locdate", fromYmd)
    .lte("locdate", toYmd)
    .eq("isholiday", "Y");
  if (holisErr) throw holisErr;
  const holidaySet = new Set((holis ?? []).map((h) => String(h.locdate)));

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
    if (allWeekdays.size === 7) break;
  }
  if (allWeekdays.size === 0) allWeekdays.add(isoWeekday(from));

  const excludeContentIds = new Set<string>();

  const { data: byAllWeekdays, error: byAllErr } = await admin
    .from("tb_place_detail_normalized")
    .select("contentid")
    .contains("closed_weekdays", [...allWeekdays]);
  if (byAllErr) throw byAllErr;
  for (const r of byAllWeekdays ?? []) excludeContentIds.add(String(r.contentid));

  if (nonHolidayWeekdays.size === 0) {
    const { data, error } = await admin
      .from("tb_place_detail_normalized")
      .select("contentid")
      .eq("closed_holiday", true);
    if (error) throw error;
    for (const r of data ?? []) excludeContentIds.add(String(r.contentid));
  } else {
    const { data, error } = await admin
      .from("tb_place_detail_normalized")
      .select("contentid")
      .eq("closed_holiday", true)
      .contains("closed_weekdays", [...nonHolidayWeekdays]);
    if (error) throw error;
    for (const r of data ?? []) excludeContentIds.add(String(r.contentid));
  }

  return courseIdsContainingContentIds(admin, [...excludeContentIds]);
}

/** 평균 별점(tb_post.course_rating, board_id=1)이 minRating 이상인 코스 id 집합 */
async function courseIdsMatchingMinRating(
  admin: ReturnType<typeof createAdminClient>,
  minRating: number
): Promise<Set<number>> {
  const { data, error } = await admin
    .from(T.boardPosts)
    .select("course_id, course_rating")
    .eq("board_id", 1)
    .eq("use_yn", true)
    .not("course_rating", "is", null)
    .not("course_id", "is", null);
  if (error) throw error;
  const sums = new Map<number, { sum: number; count: number }>();
  for (const row of (data ?? []) as { course_id: number; course_rating: number }[]) {
    const g = sums.get(row.course_id) ?? { sum: 0, count: 0 };
    g.sum += row.course_rating;
    g.count += 1;
    sums.set(row.course_id, g);
  }
  const matched = new Set<number>();
  for (const [courseId, g] of sums) {
    if (g.sum / g.count >= minRating) matched.add(courseId);
  }
  return matched;
}

type CourseRatingStat = { average: number; count: number };

/** courseIds 각각의 별점 평균과 후기 수(tb_post.course_rating, board_id=1). */
async function computeRatingStats(
  admin: ReturnType<typeof createAdminClient>,
  courseIds: number[]
): Promise<Map<number, CourseRatingStat>> {
  const ratingStats = new Map<number, CourseRatingStat>();
  if (courseIds.length === 0) return ratingStats;
  const { data, error } = await admin
    .from(T.boardPosts)
    .select("course_id, course_rating")
    .eq("board_id", 1)
    .eq("use_yn", true)
    .not("course_rating", "is", null)
    .in("course_id", courseIds);
  if (error) throw error;
  const sums = new Map<number, { sum: number; count: number }>();
  for (const row of (data ?? []) as { course_id: number; course_rating: number }[]) {
    const g = sums.get(row.course_id) ?? { sum: 0, count: 0 };
    g.sum += row.course_rating;
    g.count += 1;
    sums.set(row.course_id, g);
  }
  for (const [cid, g] of sums) {
    ratingStats.set(cid, {
      average: Math.round((g.sum / g.count) * 10) / 10,
      count: g.count
    });
  }
  return ratingStats;
}

function hourToTime(hour: number | null | undefined): string | null {
  if (hour == null || !Number.isFinite(Number(hour))) return null;
  const h = Math.max(0, Math.min(23, Math.floor(Number(hour))));
  return `${String(h).padStart(2, "0")}:00`;
}

type CourseSortField = "registtime" | "title" | "rating";

// registtime(등록일)/title(제목)은 tb_course 컬럼이라 DB .order() 로 바로 정렬되지만, rating(별점)은
// tb_post 집계값이라 별도 처리(resolveActiveCourses 참고)가 필요하다.
function resolveSort(sortParam: string | null): { field: CourseSortField; ascending: boolean } {
  switch (sortParam) {
    case "registtime_asc":
      return { field: "registtime", ascending: true };
    case "title_asc":
      return { field: "title", ascending: true };
    case "title_desc":
      return { field: "title", ascending: false };
    case "rating_asc":
      return { field: "rating", ascending: true };
    case "rating_desc":
      return { field: "rating", ascending: false };
    case "registtime_desc":
    default:
      return { field: "registtime", ascending: false };
  }
}

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** 공유 코스 목록 — tb_course.open_yn='Y' (RLS 미비로 service role 조회), limit/offset 페이징 + 필터 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Math.min(
      Math.max(Number(url.searchParams.get("limit")) || DEFAULT_LIMIT, 1),
      MAX_LIMIT
    );
    const offset = Math.max(Number(url.searchParams.get("offset")) || 0, 0);
    const accessTypes = (url.searchParams.get("accessibility") ?? "").split(",").filter(Boolean);
    const themeCodesFilter = (url.searchParams.get("themes") ?? "").split(",").filter(Boolean);
    const favoritesOnly = url.searchParams.get("favoritesOnly") === "1";
    const gu = (url.searchParams.get("gu") ?? "").trim();
    const dong = (url.searchParams.get("dong") ?? "").trim();
    const headcount = Number(url.searchParams.get("headcount") ?? "0");
    const dateFrom = (url.searchParams.get("dateFrom") ?? "").trim();
    const dateTo = (url.searchParams.get("dateTo") ?? "").trim();
    const minRating = Number(url.searchParams.get("minRating") ?? "0");
    const contentIds = normalizeContentIds((url.searchParams.get("contentIds") ?? "").split(","));
    const mine = url.searchParams.get("mine") === "1";
    const { field: sortField, ascending: sortAscending } = resolveSort(
      url.searchParams.get("sort")
    );

    const admin = createAdminClient();

    // "내 코스" 모드는 로그인이 필수 — 즐겨찾기 필터와 마찬가지로 세션에서 사용자를 확인한다.
    let authedUserId: string | null = null;
    if (mine || favoritesOnly) {
      const supabaseAuth = await createClient();
      const {
        data: { user }
      } = await supabaseAuth.auth.getUser();
      if (!user) {
        if (mine) {
          return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
        }
        return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore: false });
      }
      authedUserId = user.id;
    }

    // 즐겨찾기 필터 — 로그인 사용자의 좋아요 코스 id 집합.
    let favoriteCourseIds: Set<number> | null = null;
    if (favoritesOnly) {
      const { data: likeRows, error: likeErr } = await admin
        .from(T.courseLikes)
        .select("course_id")
        .eq("user_id", authedUserId!);
      if (likeErr) throw likeErr;
      favoriteCourseIds = new Set((likeRows ?? []).map((r) => r.course_id as number));
      if (favoriteCourseIds.size === 0) {
        return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore: false });
      }
    }

    // 접근성/테마/위치 필터 — 각각 매치되는 코스 id 집합을 구해서 교집합(여러 개 선택했으면 AND).
    // 접근성/테마는 "하나라도 매치"(OR)지만, 위치는 "포함된 모든 장소가 매치"(courseIdsWithAllPlacesInLocation 안에서 이미 AND 처리됨).
    let placeFilterCourseIds: Set<number> | null = null;
    if (
      accessTypes.length > 0 ||
      themeCodesFilter.length > 0 ||
      gu ||
      minRating > 0 ||
      contentIds.length > 0
    ) {
      const [themeMatched, accessMatched, locationMatched, ratingMatched, contentMatched] =
        await Promise.all([
          themeCodesFilter.length > 0 ? courseIdsMatchingThemes(admin, themeCodesFilter) : null,
          accessTypes.length > 0 ? courseIdsMatchingAccessibility(admin, accessTypes) : null,
          gu ? courseIdsWithAllPlacesInLocation(admin, gu, dong) : null,
          minRating > 0 ? courseIdsMatchingMinRating(admin, minRating) : null,
          contentIds.length > 0 ? courseIdsContainingContentIds(admin, contentIds) : null
        ]);
      const activeSets = [
        themeMatched,
        accessMatched,
        locationMatched,
        ratingMatched,
        contentMatched
      ].filter((s): s is Set<number> => s !== null);
      placeFilterCourseIds = activeSets.reduce<Set<number> | null>(
        (acc, s) => (acc ? new Set([...acc].filter((id) => s.has(id))) : s),
        null
      );
      if (!placeFilterCourseIds || placeFilterCourseIds.size === 0) {
        return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore: false });
      }
    }

    // 즐겨찾기 + 접근성/테마 필터를 함께 선택했으면 교집합.
    let courseIdFilter: number[] | null = null;
    if (favoriteCourseIds && placeFilterCourseIds) {
      courseIdFilter = [...favoriteCourseIds].filter((id) => placeFilterCourseIds!.has(id));
    } else if (favoriteCourseIds) {
      courseIdFilter = [...favoriteCourseIds];
    } else if (placeFilterCourseIds) {
      courseIdFilter = [...placeFilterCourseIds];
    }
    if (courseIdFilter && courseIdFilter.length === 0) {
      return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore: false });
    }

    // 인원수/일정 필터 — 다른 필터들과 반대로 "제외" 방향이다: 코스에 포함된 장소 중 단 하나라도
    // 조건에 안 맞으면(수용 불가/기간 내내 휴무) 그 코스 전체를 제외한다.
    const [headcountExcluded, scheduleExcluded] = await Promise.all([
      headcount >= 1 ? courseIdsExcludedByHeadcount(admin, headcount) : null,
      dateFrom || dateTo ? courseIdsExcludedBySchedule(admin, dateFrom, dateTo) : null
    ]);
    const excludedCourseIds = new Set<number>([
      ...(headcountExcluded ?? []),
      ...(scheduleExcluded ?? [])
    ]);

    const courseColumns =
      "course_id, course_nm, open_yn, startdate, enddate, register, registtime, updatetime, delete_yn";

    let activeCourses: CourseRow[];
    let hasMore: boolean;
    // rating 정렬일 때만 미리 채워둔다 — 아래에서 다시 계산하지 않고 이 맵을 그대로 쓴다.
    let precomputedRatingStats: Map<number, CourseRatingStat> | null = null;

    if (sortField === "rating") {
      // 별점은 tb_course 컬럼이 아니라 tb_post 집계값이라 DB .order()/.range() 로 못 정렬·페이징한다.
      // 필터에 맞는 코스 id 전체를 먼저 구하고, 별점을 계산해 JS에서 정렬한 뒤 그 결과를 offset/limit
      // 으로 직접 잘라 페이지를 만든다.
      let idQuery = admin
        .from(T.course)
        .select("course_id, delete_yn")
        .or("delete_yn.is.null,delete_yn.eq.N");
      idQuery = mine ? idQuery.eq("register", authedUserId!) : idQuery.eq("open_yn", "Y");
      if (courseIdFilter) idQuery = idQuery.in("course_id", courseIdFilter);
      if (excludedCourseIds.size > 0) {
        idQuery = idQuery.not("course_id", "in", `(${[...excludedCourseIds].join(",")})`);
      }
      const { data: idRows, error: idErr } = await idQuery;
      if (idErr) throw idErr;
      const allIds = ((idRows ?? []) as { course_id: number }[]).map((r) => r.course_id);
      if (allIds.length === 0) {
        return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore: false });
      }

      precomputedRatingStats = await computeRatingStats(admin, allIds);
      const ratingsForSort = precomputedRatingStats;
      const sortedIds = [...allIds].sort((a, b) => {
        const diff = (ratingsForSort.get(a)?.average ?? 0) - (ratingsForSort.get(b)?.average ?? 0);
        return sortAscending ? diff : -diff;
      });
      hasMore = offset + limit < sortedIds.length;
      const pageIds = sortedIds.slice(offset, offset + limit);
      if (pageIds.length === 0) {
        return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore });
      }

      const { data: pageCourses, error: pageErr } = await admin
        .from(T.course)
        .select(courseColumns)
        .in("course_id", pageIds);
      if (pageErr) throw pageErr;
      const courseById = new Map(((pageCourses ?? []) as CourseRow[]).map((c) => [c.course_id, c]));
      // pageIds 는 이미 정렬된 순서 — 그 순서를 그대로 유지해서 매핑한다.
      activeCourses = pageIds
        .map((id) => courseById.get(id))
        .filter((c): c is CourseRow => c != null);
    } else {
      // delete_yn 은 반드시 SQL 에서 걸러야 한다 — count/range 로 페이지를 자르는데, 소프트 삭제된
      // 행을 여기서 안 거르고 나중에 JS 에서 activeCourses 로 걸러내면 "가져온 원본 행 수"와
      // "실제 보여줄 행 수"가 달라진다. 그러면 다음 페이지 offset(=화면에 보인 개수 기준)이 DB
      // 원본 행 위치와 어긋나서, 페이지마다 20개보다 적게 보이거나 다음 페이지에서 이미 본 코스가
      // 다시 겹쳐 나오는(중복 key) 문제가 생긴다.
      const sortColumn = sortField === "title" ? "course_nm" : "registtime";
      let courseQuery = admin
        .from(T.course)
        .select(courseColumns, { count: "exact" })
        .or("delete_yn.is.null,delete_yn.eq.N")
        .order(sortColumn, { ascending: sortAscending })
        .range(offset, offset + limit - 1);
      courseQuery = mine
        ? courseQuery.eq("register", authedUserId!)
        : courseQuery.eq("open_yn", "Y");
      if (courseIdFilter) courseQuery = courseQuery.in("course_id", courseIdFilter);
      if (excludedCourseIds.size > 0) {
        courseQuery = courseQuery.not("course_id", "in", `(${[...excludedCourseIds].join(",")})`);
      }

      const { data: courses, error: coursesError, count } = await courseQuery;

      // PGRST103(Requested range not satisfiable) — .range() 요청인데 조건에 맞는 행이 0건일 때
      // PostgREST 가 던지는 에러. 예: 좋아요한 코스가 지금은 전부 비공개(open_yn≠'Y')로 바뀐 경우
      // (courseIdFilter 자체는 비어있지 않았지만 .eq("open_yn","Y") 와 교집합이 0건). 정상적인
      // "결과 없음"으로 처리한다.
      if (coursesError) {
        if (coursesError.code === "PGRST103") {
          return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore: false });
        }
        throw coursesError;
      }

      activeCourses = ((courses ?? []) as CourseRow[]).filter((c) => isActiveFlag(c.delete_yn));
      hasMore = offset + limit < (count ?? 0);
    }

    if (activeCourses.length === 0) {
      return NextResponse.json({ items: [] as TourismSharedCourse[], hasMore });
    }

    const courseIds = activeCourses.map((c) => c.course_id);
    const { data: details, error: detailsError } = await admin
      .from(T.courseDetail)
      .select("detail_id, course_id, day, place_id, starthour, endhour")
      .in("course_id", courseIds)
      .order("day", { ascending: true })
      .order("starthour", { ascending: true });

    if (detailsError) throw detailsError;

    const detailRows = (details ?? []) as DetailRow[];
    const placeIds = [
      ...new Set(
        detailRows
          .map((d) => d.place_id)
          .filter((id): id is number => typeof id === "number" && Number.isFinite(id))
      )
    ];

    const placeMap = new Map<number, PlaceRow>();
    if (placeIds.length > 0) {
      const { data: places, error: placesError } = await admin
        .from(T.place)
        .select("place_id, title, addr1, firstimage, contentid, lclssystm1, delete_yn")
        .in("place_id", placeIds);
      if (placesError) throw placesError;
      for (const p of (places ?? []) as PlaceRow[]) {
        if (!isActiveFlag(p.delete_yn)) continue;
        placeMap.set(p.place_id, p);
      }
    }

    // 빵지순례(BK) — lclssystm1엔 안 남는 자체 판정 테마라, 해시태그에 넣으려면 별도로 구해야 한다.
    const bakeryPlaceIdSet = new Set(await getBakeryPlaceIds());

    const detailsByCourse = new Map<number, TourismCoursePlace[]>();
    const themesByCourse = new Map<number, Set<string>>();
    const placeIdsByCourse = new Map<number, Set<number>>();
    for (const d of detailRows) {
      if (d.place_id == null) continue;
      const place = placeMap.get(d.place_id);
      if (!place) continue;
      const item: TourismCoursePlace = {
        detail_id: d.detail_id,
        place_id: d.place_id,
        day: d.day ?? 1,
        starttime: hourToTime(d.starthour),
        endtime: hourToTime(d.endhour),
        title: place.title?.trim() || `장소 #${d.place_id}`,
        addr1: place.addr1,
        firstimage: place.firstimage,
        contentid: place.contentid
      };
      const list = detailsByCourse.get(d.course_id) ?? [];
      list.push(item);
      detailsByCourse.set(d.course_id, list);

      if (place.lclssystm1) {
        const themes = themesByCourse.get(d.course_id) ?? new Set<string>();
        themes.add(place.lclssystm1);
        themesByCourse.set(d.course_id, themes);
      }

      const placeIds = placeIdsByCourse.get(d.course_id) ?? new Set<number>();
      placeIds.add(d.place_id);
      placeIdsByCourse.set(d.course_id, placeIds);
    }

    const { data: likeRows, error: likeErr } = await admin
      .from(T.courseLikes)
      .select("course_id")
      .in("course_id", courseIds);
    if (likeErr) throw likeErr;
    const likeCounts = new Map<number, number>();
    for (const row of (likeRows ?? []) as { course_id: number }[]) {
      likeCounts.set(row.course_id, (likeCounts.get(row.course_id) ?? 0) + 1);
    }

    // 코스 별점 — 후기 게시판(board_id=1)의 course_rating 평균. 후기가 없으면 0.0.
    // rating 정렬일 때는 이미 전체 후보를 대상으로 계산해둔 값(precomputedRatingStats)을 그대로 쓴다.
    const ratingStats = precomputedRatingStats ?? (await computeRatingStats(admin, courseIds));

    const themeCodes = [...new Set([...themesByCourse.values()].flatMap((s) => [...s]))];
    // 이 결과 안에 빵집으로 판정된 장소가 하나라도 있으면 "빵지순례" 라벨도 같이 조회해둔다.
    if (placeIds.some((pid) => bakeryPlaceIdSet.has(pid))) themeCodes.push(BAKERY_THEME_CODE);
    const themeLabelByCode = new Map<string, string>();
    if (themeCodes.length > 0) {
      const { data: codeRows, error: codeErr } = await admin
        .from("tb_code")
        .select("code_id, code_nm")
        .eq("code_group", "LCLSSYSTM1")
        .in("code_id", themeCodes);
      if (codeErr) throw codeErr;
      for (const c of (codeRows ?? []) as { code_id: string; code_nm: string }[]) {
        themeLabelByCode.set(c.code_id, c.code_nm);
      }
    }

    const allContentIds = [
      ...new Set(
        [...placeMap.values()]
          .map((p) => (p.contentid != null && p.contentid !== "" ? p.contentid : null))
          .filter((v): v is string => v != null)
      )
    ];
    const bfFlagsByContentId = new Map<
      string,
      { has_blind: boolean; has_deaf: boolean; has_gait: boolean; has_infant: boolean }
    >();
    if (allContentIds.length > 0) {
      const { data: bfRows, error: bfErr } = await admin
        .from("tb_place_barrierfree")
        .select("contentid, has_blind, has_deaf, has_gait, has_infant")
        .in("contentid", allContentIds);
      if (bfErr) throw bfErr;
      for (const b of (bfRows ?? []) as {
        contentid: string;
        has_blind: boolean;
        has_deaf: boolean;
        has_gait: boolean;
        has_infant: boolean;
      }[]) {
        bfFlagsByContentId.set(b.contentid, b);
      }
    }

    const registerIds = [
      ...new Set(activeCourses.map((c) => c.register).filter((v): v is string => !!v))
    ];
    const memberMap = new Map<string, MemberRow>();
    if (registerIds.length > 0) {
      const { data: members, error: memberErr } = await admin
        .from(T.members)
        .select("id, nickname, role")
        .in("id", registerIds);
      if (memberErr) throw memberErr;
      for (const m of (members ?? []) as MemberRow[]) memberMap.set(m.id, m);
    }

    const items: TourismSharedCourse[] = activeCourses.map((c) => {
      const places = detailsByCourse.get(c.course_id) ?? [];
      const days = new Set(places.map((p) => p.day));
      const member = c.register ? memberMap.get(c.register) : undefined;

      // 해시태그 — 포함 장소들의 대분류(테마)+접근성 종합 상위 3개(개수 내림차순).
      const badgeCounts = new Map<string, number>();
      const bump = (label: string | null | undefined) => {
        if (!label) return;
        badgeCounts.set(label, (badgeCounts.get(label) ?? 0) + 1);
      };
      for (const pid of placeIdsByCourse.get(c.course_id) ?? []) {
        const place = placeMap.get(pid);
        if (!place) continue;
        if (place.lclssystm1) bump(themeLabelByCode.get(place.lclssystm1));
        if (bakeryPlaceIdSet.has(pid)) bump(themeLabelByCode.get(BAKERY_THEME_CODE));
        const contentId =
          place.contentid != null && place.contentid !== "" ? place.contentid : null;
        const flags = contentId != null ? bfFlagsByContentId.get(contentId) : undefined;
        if (flags?.has_blind) bump("시각장애");
        if (flags?.has_deaf) bump("청각장애");
        if (flags?.has_gait) bump("보행장애");
        if (flags?.has_infant) bump("영유아");
      }
      const hashtags = [...badgeCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([label]) => label);

      return {
        course_id: c.course_id,
        course_nm: c.course_nm?.trim() || `코스 #${c.course_id}`,
        open_yn: c.open_yn,
        startdate: c.startdate,
        enddate: c.enddate,
        register: c.register,
        registtime: c.registtime,
        updatetime: c.updatetime,
        places,
        day_count: days.size > 0 ? days.size : 0,
        place_count: places.length,
        like_count: likeCounts.get(c.course_id) ?? 0,
        average_rating: ratingStats.get(c.course_id)?.average ?? 0,
        review_count: ratingStats.get(c.course_id)?.count ?? 0,
        themes: [...(themesByCourse.get(c.course_id) ?? [])]
          .map((code) => themeLabelByCode.get(code))
          .filter((v): v is string => !!v),
        hashtags,
        author_nickname: member?.nickname?.trim() || "여행자",
        author_role: member?.role ?? null
      };
    });

    return NextResponse.json({ items, hasMore });
  } catch (e) {
    // Supabase/Postgrest 에러는 Error 인스턴스가 아니라 {message,...} 객체라
    // e instanceof Error 만 보면 실제 원인이 다 사라지고 뭉뚱그린 메시지만 남는다.
    const message =
      e instanceof Error
        ? e.message
        : typeof e === "object" && e !== null && "message" in e
          ? String((e as { message: unknown }).message)
          : "Failed to fetch shared courses";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
