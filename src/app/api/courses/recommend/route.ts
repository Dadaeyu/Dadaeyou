import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { createFixedWindowRateLimiter } from "@/lib/server/fixed-window-rate-limit";
import { createTimeoutSignal } from "@/lib/server/timeout-signal";
import { resolveChatClientKey } from "@/lib/chat/server/request-identity";
import {
  reserveCourseRecommendUsage,
  peekCourseRecommendUsage,
  CourseRecommendUsageError,
  COURSE_RECOMMEND_DAILY_LIMIT
} from "@/lib/courseRecommend/usage";
import {
  getBarrierFreeIds,
  getHeadcountExcludeIds,
  getScheduleExcludeIds
} from "@/lib/search/placeFilters";
import {
  haversineMeters,
  orderByNearestNeighbor,
  resolveDayCount,
  splitIntoDays,
  type RoutePoint
} from "@/lib/courseRecommend/routePlanning";
import { getBakeryPlaceIds, splitThemeSelection, BAKERY_THEME_CODE } from "@/lib/theme/bakeryTheme";

const DEEPSEEK_CHAT_URL = "https://api.deepseek.com/chat/completions";
const DEFAULT_MODEL = "deepseek-v4-flash";
const SUPPORTED_MODELS = new Set(["deepseek-v4-flash", "deepseek-v4-pro"]);
const EXTERNAL_FETCH_TIMEOUT_MS = 25_000;
const MAX_ACTIVITY_CANDIDATES = 70;
const MAX_RESTAURANT_CANDIDATES = 20;
const MIN_CANDIDATES = 3;
const MAX_COURSES = 5;
const RESTAURANT_THEME_NAME = "음식";
const RESTAURANT_THEME_FALLBACK_CODE = "FD";

// 하루 일정 틀: 오전(필수) → 점심 식당(필수) → 오후 2곳(필수) → 저녁 식당(필수) → 저녁 활동(선택).
const MORNING_START_HOUR = 10;
const MORNING_END_HOUR = 12;
const LUNCH_HOUR = 12;
const AFTERNOON_START_HOUR = 13;
const AFTERNOON_SLOT_HOURS = 2;
const DINNER_HOUR = 18;
const MEAL_DURATION_HOURS = 1;
const EVENING_START_HOUR = 19;
const EVENING_END_HOUR = 21;

const recommendRateLimiter = createFixedWindowRateLimiter({
  maxRequests: 6,
  maxTrackedClients: 1_000,
  windowMs: 60_000
});

interface CandidatePlace extends RoutePoint {
  placeId: number;
  contentId: string;
  title: string;
  category: string | null; // 표시용 테마 이름(예: "음식") — 프롬프트/해시태그용
  categoryCode: string | null; // tb_place.lclssystm1 원본 코드(예: "FD") — 지도 마커 색상용
  dong: string | null;
}

type LlmCourseDraft = {
  title?: unknown;
  summary?: unknown;
  placeIds?: unknown;
};

// "AI 코스 추천받기" 배너가 처음 렌더링될 때부터(누르기 전부터) 오늘 사용 현황을 보여주기
// 위한 조회 전용 엔드포인트 — 카운트를 올리지 않는다.
export async function GET(request: Request) {
  const clientKey = await resolveChatClientKey(request);
  const usage = await peekCourseRecommendUsage(clientKey);
  return NextResponse.json({ usage });
}

export async function POST(request: Request) {
  try {
    const clientKey = await resolveChatClientKey(request);
    const rateLimit = recommendRateLimiter.enforce(`course-recommend:${clientKey}`);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: "요청이 잠시 많아요. 조금 뒤 다시 시도해 주세요." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
      );
    }

    const usage = await reserveCourseRecommendUsage(clientKey);

    const body = (await request.json().catch(() => ({}))) as {
      accessibility?: unknown;
      themes?: unknown;
      gu?: unknown;
      dong?: unknown;
      headcount?: unknown;
      dateFrom?: unknown;
      dateTo?: unknown;
    };

    const accessTypes = Array.isArray(body.accessibility)
      ? body.accessibility.filter((v): v is string => typeof v === "string")
      : [];
    const themes = Array.isArray(body.themes)
      ? body.themes.filter((v): v is string => typeof v === "string")
      : [];
    const guCode = typeof body.gu === "string" ? body.gu.trim() : "";
    const dong = typeof body.dong === "string" ? body.dong.trim() : "";
    const headcount = Number(body.headcount ?? 0) || 0;
    const dateFrom = typeof body.dateFrom === "string" ? body.dateFrom.trim() : "";
    const dateTo = typeof body.dateTo === "string" ? body.dateTo.trim() : "";

    const forcedDayCount = resolveForcedDayCount(dateFrom, dateTo);
    const themeNames = await fetchThemeNameMap();
    const restaurantThemeCode = findRestaurantThemeCode(themeNames);

    const sharedFilterParams = { accessTypes, guCode, dong, headcount, dateFrom, dateTo };

    // 활동 장소(오전/오후/저녁 슬롯용) — 사용자가 고른 테마 그대로 필터링.
    // 식당(점심/저녁 슬롯용) — 사용자의 테마 선택과 무관하게 항상 "음식점" 테마로 강제 조회해서,
    // "자연힐링"만 고른 코스라도 끼니 후보가 없어서 비는 일이 없게 한다. 접근성/위치/인원수/일정은 동일하게 적용.
    const [activityCandidates, restaurantCandidates] = await Promise.all([
      fetchPlaces({
        ...sharedFilterParams,
        themes,
        limit: MAX_ACTIVITY_CANDIDATES,
        themeNames
      }),
      restaurantThemeCode
        ? fetchPlaces({
            ...sharedFilterParams,
            themes: [restaurantThemeCode],
            limit: MAX_RESTAURANT_CANDIDATES,
            themeNames
          })
        : Promise.resolve([])
    ]);

    // 빵지순례(BK)는 실제 lclssystm1 코드가 아니라 테마 필터를 켰을 때만 후보에 반영돼 있다
    // (fetchPlaces 내부). 필터로 선택 안 했어도 결과 코스에 빵집이 우연히 섞이면 해시태그에
    // "빵지순례"가 잡히게, 후보 전체에 대해 한 번 더 표시해둔다(지도 마커 색상용 categoryCode도 같이 맞춘다).
    const bakeryPlaceIdSet = new Set(await getBakeryPlaceIds());
    const markBakery = (p: CandidatePlace): CandidatePlace =>
      bakeryPlaceIdSet.has(p.placeId)
        ? {
            ...p,
            category: themeNames.get(BAKERY_THEME_CODE) ?? "빵지순례",
            categoryCode: BAKERY_THEME_CODE
          }
        : p;
    const markedActivityCandidates = activityCandidates.map(markBakery);
    const markedRestaurantCandidates = restaurantCandidates.map(markBakery);

    if (markedActivityCandidates.length < MIN_CANDIDATES) {
      return NextResponse.json({
        courses: [],
        message: "조건에 맞는 장소가 너무 적어서 코스를 만들지 못했어요. 필터를 조금 넓혀보세요.",
        usage
      });
    }

    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) {
      return NextResponse.json(
        { error: "현재 코스 추천 기능을 사용할 수 없어요. 잠시 뒤 다시 이용해 주세요." },
        { status: 503 }
      );
    }

    const model = getDeepSeekModel();
    const drafts = await requestCourseDrafts({
      apiKey,
      model,
      candidates: markedActivityCandidates,
      forcedDayCount
    });

    if (!drafts) {
      return NextResponse.json(
        { error: "코스를 설계하지 못했어요. 잠시 뒤 다시 시도해 주세요." },
        { status: 502 }
      );
    }

    const candidateById = new Map(markedActivityCandidates.map((c) => [c.placeId, c]));
    const courses = drafts
      .map((draft) =>
        buildCourseFromDraft(draft, candidateById, markedRestaurantCandidates, forcedDayCount)
      )
      .filter((course): course is NonNullable<typeof course> => course != null)
      .slice(0, MAX_COURSES);

    if (courses.length === 0) {
      return NextResponse.json({
        courses: [],
        message: "조건에 맞는 코스를 만들지 못했어요. 필터를 조금 바꿔서 다시 시도해 보세요.",
        usage
      });
    }

    return NextResponse.json({ courses, usage });
  } catch (error) {
    if (error instanceof CourseRecommendUsageError) {
      return NextResponse.json(
        {
          error: error.message,
          usage: {
            used: error.used,
            remaining: error.remaining,
            limit: COURSE_RECOMMEND_DAILY_LIMIT
          }
        },
        { status: error.status }
      );
    }
    const message =
      error instanceof Error && error.name === "AbortError"
        ? "코스를 설계하는 데 시간이 오래 걸렸어요. 잠시 뒤 다시 시도해 주세요."
        : "코스를 추천하는 중 문제가 생겼어요. 잠시 뒤 다시 시도해 주세요.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// dateFrom~dateTo 가 둘 다 있으면 그 일수에 정확히 맞춰야 한다. 없으면 null(자동 산정).
function resolveForcedDayCount(dateFrom: string, dateTo: string): number | null {
  if (!dateFrom || !dateTo) return null;
  const from = Date.parse(`${dateFrom}T00:00:00`);
  const to = Date.parse(`${dateTo}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / 86_400_000) + 1;
}

async function fetchPlaces(params: {
  accessTypes: string[];
  guCode: string;
  dong: string;
  themes: string[];
  headcount: number;
  dateFrom: string;
  dateTo: string;
  limit: number;
  themeNames: Map<string, string>;
}): Promise<CandidatePlace[]> {
  let query = supabase
    .from("tb_place")
    .select("place_id, contentid, title, mapx, mapy, dong, lclssystm1")
    .or("delete_yn.is.null,delete_yn.eq.N")
    .eq("use_yn", "Y")
    .not("mapx", "is", null)
    .not("mapy", "is", null)
    .limit(params.limit * 3);

  if (params.guCode) query = query.eq("ldongsigngucd", params.guCode);
  if (params.dong) query = query.eq("dong", params.dong);
  // "빵지순례"(BK)는 tb_code 상 가상 코드라 lclssystm1로 못 걸러서 getBakeryPlaceIds()로 따로 구해 합친다.
  if (params.themes.length > 0) {
    const { officialCodes, includeBakery } = splitThemeSelection(params.themes);
    const bakeryIds = includeBakery ? await getBakeryPlaceIds() : [];
    if (officialCodes.length > 0 && includeBakery) {
      query = query.or(
        `lclssystm1.in.(${officialCodes.join(",")}),place_id.in.(${bakeryIds.length ? bakeryIds.join(",") : "-1"})`
      );
    } else if (officialCodes.length > 0) {
      query = query.in("lclssystm1", officialCodes);
    } else {
      query = query.in("place_id", bakeryIds.length > 0 ? bakeryIds : [-1]);
    }
  }

  if (params.accessTypes.length > 0) {
    const accessIds = await getBarrierFreeIds(params.accessTypes);
    query = query.in("contentid", accessIds.length > 0 ? accessIds : [-1]);
  }

  const excludeIds = new Set<string>();
  for (const id of await getHeadcountExcludeIds(params.headcount)) excludeIds.add(id);
  for (const id of await getScheduleExcludeIds(params.dateFrom, params.dateTo)) excludeIds.add(id);
  const finalQuery =
    excludeIds.size > 0 ? query.not("contentid", "in", `(${[...excludeIds].join(",")})`) : query;

  const { data, error } = await finalQuery;
  if (error) throw error;

  const rows = (data ?? []) as Array<{
    place_id: number;
    contentid: string;
    title: string;
    mapx: string | number;
    mapy: string | number;
    dong: string | null;
    lclssystm1: string | null;
  }>;

  const shuffled = shuffle(rows).slice(0, params.limit);

  return shuffled
    .map((row) => ({
      placeId: row.place_id,
      contentId: row.contentid,
      title: row.title,
      category: row.lclssystm1 ? (params.themeNames.get(row.lclssystm1) ?? row.lclssystm1) : null,
      categoryCode: row.lclssystm1,
      dong: row.dong,
      lat: Number(row.mapy),
      lng: Number(row.mapx)
    }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));
}

async function fetchThemeNameMap(): Promise<Map<string, string>> {
  const { data } = await supabase
    .from("tb_code")
    .select("code_id, code_nm")
    .eq("code_group", "LCLSSYSTM1");
  return new Map((data ?? []).map((c) => [c.code_id as string, c.code_nm as string]));
}

function findRestaurantThemeCode(themeNames: Map<string, string>): string | null {
  for (const [code, name] of themeNames) {
    if (name === RESTAURANT_THEME_NAME) return code;
  }
  return themeNames.has(RESTAURANT_THEME_FALLBACK_CODE) ? RESTAURANT_THEME_FALLBACK_CODE : null;
}

function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getDeepSeekModel() {
  const model = process.env.DEEPSEEK_MODEL?.trim() || DEFAULT_MODEL;
  return SUPPORTED_MODELS.has(model) ? model : DEFAULT_MODEL;
}

async function fetchWithTimeout(input: string, init: RequestInit) {
  return fetch(input, { ...init, signal: createTimeoutSignal(EXTERNAL_FETCH_TIMEOUT_MS) });
}

async function requestCourseDrafts({
  apiKey,
  model,
  candidates,
  forcedDayCount
}: {
  apiKey: string;
  model: string;
  candidates: CandidatePlace[];
  forcedDayCount: number | null;
}): Promise<LlmCourseDraft[] | null> {
  const placeListText = candidates
    .map((c) => `${c.placeId}: ${c.title} (${[c.category, c.dong].filter(Boolean).join(" / ")})`)
    .join("\n");

  const dayRule = forcedDayCount
    ? `모든 코스는 반드시 정확히 ${forcedDayCount}일 일정이어야 하니, 활동 장소를 최소 ${forcedDayCount * 3}곳 이상 골라라.`
    : [
        "일수는 고른 활동 장소 개수를 하루 3~4곳 기준으로 나눠 자동으로 정해진다(최소 1일).",
        "일정 길이(날짜 범위)가 정해지지 않았다고 모든 코스를 당일치기로만 만들지 마라 —",
        `${MAX_COURSES}개 코스를 당일(활동 3~4곳) · 1박2일(활동 6~8곳) · 2박3일(활동 9~12곳)처럼`,
        "서로 다른 일정 길이로 섞어서 설계해라. 최소 하나 이상은 1박2일 이상으로 만들어라."
      ].join(" ");

  const systemPrompt = [
    "너는 대전 무장애 여행 코스를 설계하는 도우미다.",
    "아래 '장소 목록'에 있는 place_id만 사용해서 코스를 만든다. 목록에 없는 장소나 place_id를 지어내지 않는다.",
    "이 목록은 식당을 뺀 '활동' 장소만 담고 있다 — 점심/저녁 식당은 서버가 위치 기반으로 자동 배정하니 너는 신경 쓰지 않는다.",
    `최대 ${MAX_COURSES}개의 코스를 설계하고, 각 코스는 서로 다른 컨셉/테마를 가진다.`,
    "하루 일정은 오전 활동 1곳(필수) + 오후 활동 2곳(필수) + 저녁 활동 1곳(있어도 되고 없어도 됨)으로 구성된다 — 즉 하루 최소 3곳, 최대 4곳의 활동 장소가 필요하다.",
    dayRule,
    "장소 방문 순서, 날짜별 배정, 방문 시간은 서버에서 좌표 기반으로 별도 계산하니 신경 쓰지 않는다 — 코스에 포함할 활동 장소 조합만 고르면 된다.",
    "각 코스는 title(제목), summary(한두 문장 설명), placeIds(포함할 활동 장소 id 배열)를 갖는다.",
    "title에는 '당일치기', '1박2일', '2박3일'처럼 일정 길이를 나타내는 표현을 넣지 마라 —",
    "실제 일수는 네가 고른 장소 개수를 기준으로 서버가 계산해서 화면에 따로 보여주므로,",
    "네가 title에 적은 일정 길이가 실제 계산 결과와 다르면 사용자에게 혼란을 준다.",
    "반드시 아래 형태의 JSON 객체 하나만 출력한다. 다른 설명이나 마크다운은 출력하지 않는다.",
    '{"courses":[{"title":"...","summary":"...","placeIds":[1,2,3]}]}'
  ].join(" ");

  const response = await fetchWithTimeout(DEEPSEEK_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `장소 목록:\n${placeListText}` }
      ],
      response_format: { type: "json_object" },
      thinking: { type: "disabled" },
      max_tokens: 2_000,
      temperature: 0.4,
      stream: false
    })
  });

  if (!response.ok) return null;

  const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const content = data.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    const parsed = JSON.parse(content) as { courses?: unknown };
    return Array.isArray(parsed.courses) ? (parsed.courses as LlmCourseDraft[]) : null;
  } catch {
    return null;
  }
}

interface ScheduledPlaceOut {
  placeId: number;
  contentId: string;
  name: string;
  lat: number;
  lng: number;
  startHour: number;
  endHour: number;
  categoryCode: string | null;
}

function toScheduled(p: CandidatePlace, startHour: number, endHour: number): ScheduledPlaceOut {
  return {
    placeId: p.placeId,
    contentId: p.contentId,
    name: p.title,
    lat: p.lat,
    lng: p.lng,
    startHour,
    endHour,
    categoryCode: p.categoryCode
  };
}

// 식당 후보 중 anchor(직전/직후 활동 장소)와 가장 가까운 곳을 고른다. 이미 이 코스에서 쓴 곳은
// 되도록 피하되(끼니마다 다른 식당), 후보가 그거밖에 안 남으면 재사용을 허용한다.
function pickNearestRestaurant(
  anchor: RoutePoint | null,
  pool: CandidatePlace[],
  used: Set<number>
): CandidatePlace | null {
  if (!anchor || pool.length === 0) return null;
  const unused = pool.filter((r) => !used.has(r.placeId));
  const searchPool = unused.length > 0 ? unused : pool;

  let best = searchPool[0];
  let bestDist = haversineMeters(anchor, best);
  for (const candidate of searchPool.slice(1)) {
    const dist = haversineMeters(anchor, candidate);
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}

// 하루치 활동 장소(오전 1 + 오후 2 + 저녁 0~1)에 점심/저녁 식당을 좌표 기반으로 끼워 넣는다.
function buildDaySchedule(
  dayNumber: number,
  activities: CandidatePlace[],
  restaurantPool: CandidatePlace[],
  usedRestaurantIds: Set<number>
) {
  const morning = activities[0] ?? null;
  const afternoon = activities.slice(1, 3);
  const evening = activities[3] ?? null;
  const places: ScheduledPlaceOut[] = [];

  if (morning) places.push(toScheduled(morning, MORNING_START_HOUR, MORNING_END_HOUR));

  const lunch = pickNearestRestaurant(
    morning ?? afternoon[0] ?? evening ?? null,
    restaurantPool,
    usedRestaurantIds
  );
  if (lunch) {
    usedRestaurantIds.add(lunch.placeId);
    places.push(toScheduled(lunch, LUNCH_HOUR, LUNCH_HOUR + MEAL_DURATION_HOURS));
  }

  afternoon.forEach((place, index) => {
    const start = AFTERNOON_START_HOUR + index * AFTERNOON_SLOT_HOURS;
    places.push(toScheduled(place, start, start + AFTERNOON_SLOT_HOURS));
  });

  const dinner = pickNearestRestaurant(
    afternoon[afternoon.length - 1] ?? morning ?? evening ?? null,
    restaurantPool,
    usedRestaurantIds
  );
  if (dinner) {
    usedRestaurantIds.add(dinner.placeId);
    places.push(toScheduled(dinner, DINNER_HOUR, DINNER_HOUR + MEAL_DURATION_HOURS));
  }

  if (evening) places.push(toScheduled(evening, EVENING_START_HOUR, EVENING_END_HOUR));

  return { day: dayNumber, places };
}

function buildCourseFromDraft(
  draft: LlmCourseDraft,
  candidateById: Map<number, CandidatePlace>,
  restaurantPool: CandidatePlace[],
  forcedDayCount: number | null
) {
  const title = typeof draft.title === "string" ? draft.title.trim() : "";
  const summary = typeof draft.summary === "string" ? draft.summary.trim() : "";
  const placeIds = Array.isArray(draft.placeIds)
    ? draft.placeIds.filter((v): v is number => typeof v === "number")
    : [];

  const places = placeIds
    .map((placeId) => candidateById.get(placeId))
    .filter((p): p is CandidatePlace => p != null);
  // LLM이 같은 place_id를 중복으로 넣었을 수 있어 한 번 더 정리한다.
  const uniqueActivities = Array.from(new Map(places.map((p) => [p.placeId, p])).values());

  if (!title || uniqueActivities.length < 2) return null;
  // 일정이 강제된 경우, 하루 최소 3곳(오전1+오후2)씩은 채워져야 한다.
  if (forcedDayCount && uniqueActivities.length < forcedDayCount * 3) return null;

  const dayCount = resolveDayCount(uniqueActivities.length, forcedDayCount);
  const ordered = orderByNearestNeighbor(uniqueActivities);
  const activityDays = splitIntoDays(ordered, dayCount);

  const usedRestaurantIds = new Set<number>();
  const days = activityDays.map((dayActivities, index) =>
    buildDaySchedule(index + 1, dayActivities, restaurantPool, usedRestaurantIds)
  );
  const placeCount = days.reduce((sum, day) => sum + day.places.length, 0);

  // 해시태그 — 코스에 실제로 들어간 장소들(활동 + 배정된 식당)의 테마 대분류를 모아 상위 3개만.
  const usedRestaurants = restaurantPool.filter((r) => usedRestaurantIds.has(r.placeId));
  const hashtags = topCategories([...uniqueActivities, ...usedRestaurants], 3);

  return { title, summary, days, placeCount, hashtags };
}

function topCategories(places: CandidatePlace[], limit: number): string[] {
  const counts = new Map<string, number>();
  for (const place of places) {
    if (!place.category) continue;
    counts.set(place.category, (counts.get(place.category) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([label]) => label);
}
