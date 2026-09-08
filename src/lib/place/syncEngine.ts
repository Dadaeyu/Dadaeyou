import { type SupabaseClient } from "@supabase/supabase-js";
import { brfrTourInfoApi, korTourInfoApi, bakeryInfoApi } from "@/utils/api/external";
import { isAdminContentId } from "@/lib/place/adminContentId";
import { BF_FIELDS, computeBfFlags } from "@/lib/place/accessibilityFields";

// tb_place / tb_place_detail / tb_place_barrierfree / tb_place_bakery 동기화 엔진.
// route.ts 안에 두면 Next.js 라우트 파일이 HTTP 핸들러/설정 외 값을 export 하지 못하는 제약에
// 걸려서(빌드 시 checkFields 에러) 별도 모듈로 분리했다 — /api/place, /api/cron/place 둘 다 여기서 가져다 쓴다.
//
// 시간 예산(deadline) 방식: 각 sync 함수는 밀리초 타임스탬프인 deadline 을 받아서, 그 시각을
// 넘기기 직전에 처리 중이던 항목까지만 끝내고 나머지는 남겨둔 채 반환한다(result.notDone=true).
// "어디까지 했는지"는 별도 커서 테이블 없이, 대상 테이블의 updatetime 이 가장 오래된 것부터
// 처리하는 순서로 자연스럽게 추적한다 — 이번에 못 하면 다음 호출 때도 여전히 "가장 오래된 것"
// 이라 맨 앞으로 오고, 이번에 처리한 것들은 updatetime 이 갱신돼 뒤로 밀린다.
// maxDuration(60초) 대비 응답 전송·콜드스타트·네트워크 왕복 여유를 넉넉히 둔 실작업 예산.
export const TIME_BUDGET_MS = 40_000;

// ── 공통 상수 ───────────────────────────────────────────────
const UPSERT_CHUNK = 100;
const MAX_RETRIES = 2; // 일시적 throttling/타임아웃 대비 재시도 횟수
const RETRY_BASE_DELAY = 1500; // ms (재시도마다 점증) — 공공데이터 API 429/403 회피를 위해 늘림
// detailCommon2/detailIntro2/detailWithTour2/coord2regioncode 는 동시 호출 없이 하나씩만 보내고,
// 요청 사이에 이 만큼(ms) 쉰다 — 공공데이터 API 가 요청 폭주로 429/403을 반환하는 걸 피하기 위함.
const REQUEST_DELAY = 300;

const DAEJEON_REGN_CD = "30"; // 대전 지역 코드 (lDongRegnCd)
const ROWS_PER_PAGE = 1000; // areaBasedList2 페이지 크기 (넉넉히 잡아 호출 수 최소화; 초과분은 자동 페이지네이션)

const COORD2REGIONCODE_URL = "https://dapi.kakao.com/v2/local/geo/coord2regioncode.json";

// ── 테이블별 컬럼 매핑 ──────────────────────────────────────
// areaBasedList2 응답에서 tb_place 로 매핑할 컬럼 (하드코딩 — DB 컬럼 조회 안 함)
const PLACE_FIELD = [
  "contentid",
  "title",
  "addr1",
  "addr2",
  "lDongRegnCd", // → ldongregncd (법정동 시도 코드)
  "lDongSignguCd", // → ldongsigngucd (법정동 시군구 코드)
  "mapx",
  "mapy",
  "contenttypeid",
  "lclsSystm1",
  "lclsSystm2",
  "lclsSystm3",
  "firstimage",
  "createdtime",
  "modifiedtime"
] as const;

// detailCommon2(공통정보)에서 가져오는 컬럼 (contentid 제외)
const COMMON_FIELDS = [
  "contenttypeid",
  "homepage",
  "tel",
  "overview",
  "createdtime",
  "modifiedtime"
] as const;

// detailIntro2(소개정보)에서 채우는 컬럼 — contenttypeid 별로 응답 필드가 다르다.
const INTRO_FIELDS = [
  "accomcount",
  "chkbabycarriage",
  "expagerange",
  "infocenter",
  "opendate",
  "parking",
  "restdate",
  "useseason",
  "usetime",
  "accomcountculture",
  "chkbabycarriageculture",
  "discountinfo",
  "infocenterculture",
  "parkingculture",
  "parkingfee",
  "restdateculture",
  "usefee",
  "usetimeculture",
  "scale",
  "spendtime",
  "agelimit",
  "discountinfofestival",
  "eventenddate",
  "eventhomepage",
  "eventplace",
  "eventstartdate",
  "placeinfo",
  "playtime",
  "program",
  "spendtimefestival",
  "usetimefestival",
  "distance",
  "infocentertourcourse",
  "schedule",
  "taketime",
  "theme",
  "accomcountleports",
  "chkbabycarriageleports",
  "expagerangeleports",
  "infocenterleports",
  "openperiod",
  "parkingfeeleports",
  "parkingleports",
  "restdateleports",
  "scaleleports",
  "usefeeleports",
  "usetimeleports",
  "accomcountlodging",
  "checkintime",
  "checkouttime",
  "infocenterlodging",
  "parkinglodging",
  "pickup",
  "roomcount",
  "reservationlodging",
  "reservationurl",
  "roomtype",
  "scalelodging",
  "chkbabycarriageshopping",
  "infocentershopping",
  "opendateshopping",
  "opentime",
  "parkingshopping",
  "restdateshopping",
  "restroom",
  "saleitem",
  "saleitemcost",
  "scaleshopping",
  "shopguide",
  "discountinfofood",
  "firstmenu",
  "infocenterfood",
  "opendatefood",
  "opentimefood",
  "parkingfood",
  "restdatefood",
  "scalefood",
  "seat",
  "treatmenu"
] as const;

// ── 공통 헬퍼 ───────────────────────────────────────────────
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 외부 API 호출을 짧은 backoff 로 재시도한다.
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await fn();
    } catch (e) {
      lastError = e;
      if (attempt < MAX_RETRIES) await sleep(RETRY_BASE_DELAY * (attempt + 1));
    }
  }
  throw lastError;
}

const str = (v: unknown): string => (typeof v === "string" ? v : v == null ? "" : String(v));

// insert/update 분류용 키 정규화. DB 컬럼이 int8(숫자) 이든 varchar(문자열) 이든
// 항상 문자열로 맞춰 비교한다. (숫자 4079529 와 문자열 "4079529" 를 같게 취급)
const key = (v: unknown): string => String(v);

type TourResponse = {
  response?: {
    header?: { resultCode?: string; resultMsg?: string };
    body?: { items?: "" | { item?: unknown }; totalCount?: number };
  };
};

// 목록 응답에서 item 배열 추출 (1개면 객체, 0개면 "" 로 옴)
function extractItems(res: TourResponse): Record<string, unknown>[] {
  const items = res?.response?.body?.items;
  if (!items || typeof items === "string") return [];
  const item = items.item;
  if (!item) return [];
  const arr = Array.isArray(item) ? item : [item];
  return arr.filter((v): v is Record<string, unknown> => v != null && typeof v === "object");
}

// 상세 응답에서 첫 번째 item 추출 (없으면 null)
function pickItem(res: TourResponse): Record<string, unknown> | null {
  return extractItems(res)[0] ?? null;
}

// 카카오 좌표→행정구역 응답 중 필요한 필드만
type KakaoRegionDoc = { region_type: "H" | "B"; region_3depth_name: string };

// 좌표→법정동(region_type=B)의 동 이름 조회. mapx=경도(x), mapy=위도(y). 실패/미발견 시 null.
async function fetchDong(kakaoKey: string, x: string, y: string): Promise<string | null> {
  const res = await fetch(`${COORD2REGIONCODE_URL}?${new URLSearchParams({ x, y })}`, {
    headers: { Authorization: `KakaoAK ${kakaoKey}` },
    cache: "no-store"
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { documents?: KakaoRegionDoc[] };
  return data.documents?.find((d) => d.region_type === "B")?.region_3depth_name || null;
}

// ── 동기화 결과 타입 ────────────────────────────────────────
type SyncResult = {
  totalPlaces: number;
  fetched: number;
  upserted: number;
  deleted: number;
  skipped: number;
  errorCount: number;
  errors: unknown[];
  // place 동기화에 딸려 실행되는 dong 백필 결과 (place 일 때만 채워짐)
  dongFilled?: number;
  dongSkipped?: number;
  dongErrorCount?: number;
  // true 면 시간 예산(deadline)을 넘겨서 중간에 멈췄다는 뜻 — 남은 대상은 다음 호출이 이어서 처리한다.
  notDone?: boolean;
  // 오늘 이 회차까지 처리한 마지막 place_id(고정 오름차순 진행용 커서). 다음 체이닝 호출에
  // 그대로 실어 보내면 그 지점부터 이어서 처리하고, 매일 자정 새 트리거는 커서 없이 시작해
  // 처음(place_id 0)부터 다시 돈다. 커서 기반이 아닌 동기화(place/bakery)는 비워둔다.
  nextCursor?: number;
};

type SyncOutcome =
  | { ok: true; result: SyncResult }
  | { ok: false; status: number; error: string; partial?: Record<string, unknown> };

// 테이블에 이미 존재하는 모든 키 값 집합 (삭제된 행 포함) — insert/update 분류용.
// keyColumn 기본은 contentid, detail 처럼 PK(place_id) 기준으로 분류할 때 지정한다.
async function fetchKnownIds(
  supabase: SupabaseClient,
  table: string,
  keyColumn = "contentid"
): Promise<Set<string> | { error: string }> {
  const { data, error } = await supabase.from(table).select(keyColumn);
  if (error) return { error: `${table} 기존 ${keyColumn} 조회 실패: ${error.message}` };
  return new Set(
    (data ?? [])
      .map((r) => (r as unknown as Record<string, unknown>)[keyColumn])
      .filter((v) => v != null)
      .map((v) => key(v))
  );
}

// 신규(knownIds 에 없는 키)는 insert, 기존은 update 한다.
//  - insert: updatetime 을 넣지 않는다(생성 시각은 registtime default now() 가 담당).
//  - update: updatetime 을 now 로 갱신한다.
// updateExtra: update 행에만 병합할 추가 필드(테이블별 특수 처리용).
//   tb_place 는 { delete_yn: "N", deletetime: null } 을 넘겨, 방금 API 에서 다시 조회된 행이면
//   소프트삭제 상태를 해제(부활)한다. (관리자 노출 플래그 use_yn 은 건드리지 않는다.)
//   detail/barrierfree 는 delete_yn 컬럼이 없으므로 넘기지 않는다.
// conflictKey: 분류·upsert 충돌 기준 컬럼(기본 contentid, detail 은 PK place_id).
async function insertOrUpdate(
  supabase: SupabaseClient,
  table: string,
  rows: Record<string, unknown>[],
  knownIds: Set<string>,
  now: string,
  conflictKey = "contentid",
  updateExtra: Record<string, unknown> = {}
): Promise<{ upserted: number; error?: string }> {
  // 페이지 경계에서 같은 키가 중복 수집될 수 있어(areaBasedList2 페이지네이션),
  // 키(conflictKey) 기준으로 중복을 먼저 제거한다 — 같은 키는 마지막 것만 남긴다.
  // 이렇게 하지 않으면 한 insert 배치에 같은 키가 2건 들어가 유니크 제약을 위반한다.
  const uniqueRows = Array.from(new Map(rows.map((r) => [key(r[conflictKey]), r])).values());

  const toInsert = uniqueRows.filter((r) => !knownIds.has(key(r[conflictKey])));
  const toUpdate = uniqueRows
    .filter((r) => knownIds.has(key(r[conflictKey])))
    .map((r) => ({ ...r, updatetime: now, ...updateExtra }));

  // 청크 하나가 실패해도(예: 특정 행의 데이터 문제) 나머지 insert/update 청크는 계속 진행한다.
  // 예전엔 첫 실패에서 바로 return 해버려서, 새 행 하나가 계속 insert 에 실패하면 이미 존재하는
  // 나머지 행들의 update(예: updatetime 갱신)까지 매번 통째로 안 도는 문제가 있었다.
  let upserted = 0;
  const errors: string[] = [];
  for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) errors.push(`insert 실패(${i}~${i + chunk.length}): ${error.message}`);
    else upserted += chunk.length;
  }
  for (let i = 0; i < toUpdate.length; i += UPSERT_CHUNK) {
    const chunk = toUpdate.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict: conflictKey });
    if (error) errors.push(`upsert 실패(${i}~${i + chunk.length}): ${error.message}`);
    else upserted += chunk.length;
  }
  return errors.length > 0 ? { upserted, error: errors.join(" / ") } : { upserted };
}

type DongFillResult = { filled: number; skipped: number; errorCount: number; notDone?: boolean };

// dong 이 비어있고 좌표가 있는 활성 행을 카카오 좌표→행정구역 API 로 채운다. syncPlace 내부에서만 호출.
// 건별 실패는 skipped/errorCount 로만 집계하고 계속 진행한다. dong 이 채워진 행은 다음부터
// WHERE dong is null 에서 자동으로 빠지므로, 이 작업은 별도 정렬 없이도 자연히 수렴한다.
// dong 은 카카오發 파생값이라, 채울 때 updatetime 은 건드리지 않는다(TourAPI 콘텐츠 갱신과 구분).
async function fillMissingDong(
  supabase: SupabaseClient,
  kakaoKey: string,
  deadline: number
): Promise<DongFillResult> {
  const { data, error } = await supabase
    .from("tb_place")
    .select("place_id, mapx, mapy")
    .or("delete_yn.is.null,delete_yn.eq.N")
    .is("dong", null)
    .not("mapx", "is", null)
    .not("mapy", "is", null);
  if (error) {
    console.error(`[fillMissingDong] tb_place 조회 실패: ${error.message}`);
    return { filled: 0, skipped: 0, errorCount: 1 };
  }
  const targets = (data ?? []) as { place_id: number; mapx: string; mapy: string }[];

  let filled = 0;
  let skipped = 0;
  let errorCount = 0;
  let notDone = false;

  for (const { place_id, mapx, mapy } of targets) {
    if (Date.now() >= deadline) {
      notDone = true;
      break;
    }
    if (!mapx || !mapy) {
      skipped += 1; // 좌표가 빈 문자열인 행 방어 (헛 API 콜 방지)
      continue;
    }
    try {
      const dong = await withRetry(() => fetchDong(kakaoKey, str(mapx), str(mapy)));
      if (!dong) {
        skipped += 1; // 법정동을 못 찾은 좌표는 건너뜀
        await sleep(REQUEST_DELAY);
        continue;
      }
      const { error: upErr } = await supabase
        .from("tb_place")
        .update({ dong }) // updatetime 미포함 (의도)
        .eq("place_id", place_id);
      if (upErr) {
        errorCount += 1;
        console.error(
          `[fillMissingDong] dong 업데이트 실패 (place_id=${place_id}): ${upErr.message}`
        );
      } else {
        filled += 1;
      }
    } catch (e) {
      errorCount += 1;
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[fillMissingDong] coord2regioncode 실패 (place_id=${place_id}): ${message}`);
    }
    await sleep(REQUEST_DELAY);
  }
  return { filled, skipped, errorCount, notDone };
}

// ── 1. tb_place 동기화 (areaBasedList2 → tb_place) ──────────
async function syncPlace(supabase: SupabaseClient, deadline: number): Promise<SyncOutcome> {
  // tb_place 매핑 컬럼은 하드코딩된 PLACE_FIELD 사용 (DB 컬럼 조회 안 함).
  // PLACE_FIELD 는 contentid / updatetime 을 포함하지 않으므로 그대로 매핑 컬럼으로 쓴다.
  const mapFields = [...PLACE_FIELD];

  // 기존 contentid 목록 (삭제된 행 포함) — 두 용도로 쓴다.
  //  - knownIds: 이미 존재하는 contentid (insert / update 분류용)
  //  - existingIds: 활성 행만 (API 결과에 없는 행을 삭제 처리하기 위함)
  const { data: existingRows, error: existingErr } = await supabase
    .from("tb_place")
    .select("contentid, delete_yn, mapx, mapy");
  if (existingErr) {
    return {
      ok: false,
      status: 502,
      error: `tb_place 기존 목록 조회 실패: ${existingErr.message}`
    };
  }
  const existingRowList = (existingRows ?? []) as {
    contentid: string | number | null;
    delete_yn: string | null;
    mapx: string | number | null;
    mapy: string | number | null;
  }[];
  const knownIds = new Set<string>(
    existingRowList
      .map((r) => r.contentid)
      .filter((v): v is string | number => v != null)
      .map((v) => key(v))
  );
  // 삭제 처리(.in) 는 DB 컬럼 원본 타입 그대로 넘겨야 하므로 값은 변환하지 않는다.
  // 관리자가 직접 등록한 행(contentid="a..." 접두)은 이 API 결과에 애초에 나타날 수 없으므로
  // 삭제 후보에서 제외한다 — 안 그러면 동기화할 때마다 매번 삭제 처리돼 버린다.
  const existingIds = existingRowList
    .filter((r) => r.delete_yn == null || r.delete_yn === "N")
    .map((r) => r.contentid)
    .filter((v): v is string | number => v != null && !isAdminContentId(String(v)));
  // 좌표 변경 감지용: contentid → "mapx|mapy" (좌표가 바뀐 행은 아래에서 dong 을 리셋한다)
  const oldCoords = new Map<string, string>(
    existingRowList
      .filter((r) => r.contentid != null)
      .map((r) => [key(r.contentid), `${str(r.mapx)}|${str(r.mapy)}`])
  );

  // areaBasedList2 (대전, lDongRegnCd=30) 전체 페이지 조회
  const errors: { page: number; message: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();
  let totalCount = Infinity;
  let pageNo = 1;
  let fetched = 0;
  let skipped = 0;
  let placeNotDone = false;

  while ((pageNo - 1) * ROWS_PER_PAGE < totalCount) {
    if (Date.now() >= deadline) {
      placeNotDone = true;
      break;
    }
    try {
      const res = await withRetry(() =>
        korTourInfoApi.areaBasedList<TourResponse>({
          MobileOS: "WEB",
          lDongRegnCd: DAEJEON_REGN_CD,
          numOfRows: String(ROWS_PER_PAGE),
          pageNo: String(pageNo),
          arrange: "C"
        })
      );
      totalCount = Number(res?.response?.body?.totalCount ?? 0);
      const items = extractItems(res);
      if (items.length === 0) break;

      for (const item of items) {
        const contentid = item.contentid;
        if (contentid == null || contentid === "") {
          skipped += 1;
          continue;
        }
        fetched += 1;
        const row: Record<string, unknown> = { contentid: str(contentid) };
        // API 응답 키는 카멜케이스(lclsSystm1 등)지만, DB 컬럼은 소문자로 접혀 저장됨.
        // 읽기는 원본 키로, 쓰기는 소문자 키로 매핑한다.
        for (const f of mapFields) if (f in item) row[f.toLowerCase()] = str(item[f]);
        // 기존 행인데 좌표(mapx/mapy)가 바뀌었으면 dong 을 null 로 리셋 → 아래 백필이 다시 채운다.
        const idKey = key(row.contentid);
        if (oldCoords.has(idKey) && oldCoords.get(idKey) !== `${str(row.mapx)}|${str(row.mapy)}`) {
          row.dong = null;
        }
        rows.push(row);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[syncPlace] areaBasedList2 실패 (pageNo=${pageNo}): ${message}`);
      errors.push({ page: pageNo, message });
    }
    pageNo += 1;
    await sleep(REQUEST_DELAY);
  }

  // 신규는 insert(updatetime 미설정), 기존은 update(updatetime 갱신).
  // 이번 API 조회에 존재하는(=update 대상) 행은 delete_yn 을 N 으로 되돌려 소프트삭제를 해제한다.
  // (예전에 API 에서 빠져 delete_yn=Y 였다가 다시 등장한 장소가 자동 복구된다.)
  const io = await insertOrUpdate(supabase, "tb_place", rows, knownIds, now, "contentid", {
    delete_yn: "N",
    deletetime: null
  });
  if (io.error) {
    return {
      ok: false,
      status: 502,
      error: io.error,
      partial: { totalPlaces: rows.length, fetched, upserted: io.upserted, skipped }
    };
  }
  const upserted = io.upserted;

  // API 결과에 없는 기존 행 삭제 처리 (delete_yn=Y, deletetime 갱신).
  // 페이지 오류가 있으면 목록이 불완전할 수 있어 삭제를 건너뛴다.
  let deleted = 0;
  if (errors.length === 0) {
    const confirmedIds = new Set(rows.map((r) => key(r.contentid)));
    const toDelete = existingIds.filter((id) => !confirmedIds.has(key(id)));
    for (let i = 0; i < toDelete.length; i += UPSERT_CHUNK) {
      const chunk = toDelete.slice(i, i + UPSERT_CHUNK);
      const { error: delErr } = await supabase
        .from("tb_place")
        .update({ delete_yn: "Y", deletetime: now })
        .in("contentid", chunk);
      if (delErr) {
        return {
          ok: false,
          status: 502,
          error: `삭제 처리 실패: ${delErr.message}`,
          partial: { totalPlaces: rows.length, fetched, upserted, deleted, skipped }
        };
      }
      deleted += chunk.length;
    }
  }

  // tb_place 갱신 후, dong 이 비어있는(신규 + 좌표변경으로 리셋된) 행을 카카오 API 로 채운다.
  // 키가 없거나 실패해도 place 동기화 자체는 완료로 취급하고 결과에만 반영한다.
  let dongFilled: number | undefined;
  let dongSkipped: number | undefined;
  let dongErrorCount: number | undefined;
  const kakaoKey = process.env.KAKAO_REST_API_KEY;
  let dongNotDone = false;
  if (kakaoKey && Date.now() < deadline) {
    const dong = await fillMissingDong(supabase, kakaoKey, deadline);
    dongFilled = dong.filled;
    dongSkipped = dong.skipped;
    dongErrorCount = dong.errorCount;
    dongNotDone = Boolean(dong.notDone);
    console.log(
      `[syncPlace] dong 백필: filled=${dong.filled} skipped=${dong.skipped} errors=${dong.errorCount}`
    );
  } else if (!kakaoKey) {
    console.error("[syncPlace] KAKAO_REST_API_KEY 미설정으로 dong 백필 건너뜀");
  }

  return {
    ok: true,
    result: {
      totalPlaces: Number.isFinite(totalCount) ? totalCount : fetched,
      fetched,
      upserted,
      deleted,
      skipped,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      ...(dongFilled !== undefined ? { dongFilled, dongSkipped, dongErrorCount } : {}),
      notDone: placeNotDone || dongNotDone
    }
  };
}

// 활성 tb_place contentid 목록 조회 (소프트 삭제 제외). 컬럼 지정 가능.
// onlyWithContentid=true 면 contentid 가 null 인 행은 DB 단계에서 제외한다.
// cursor를 넘기면 place_id > cursor 조건과 오름차순 정렬을 DB 쿼리 단계에서 처리한다(자바스크립트
// 쪽에서 다시 필터링·정렬할 필요 없음) — place_id가 PK라 인덱스로 바로 처리된다.
async function fetchActivePlaces<T>(
  supabase: SupabaseClient,
  columns: string,
  onlyWithContentid = false,
  cursor?: number
): Promise<{ data: T[] } | { error: string }> {
  let query = supabase.from("tb_place").select(columns).or("delete_yn.is.null,delete_yn.eq.N");
  // 관리자가 등록한 행(contentid="a..." 접두)은 정부 API 콘텐츠가 아니므로 동기화 대상에서 제외한다.
  if (onlyWithContentid) query = query.not("contentid", "is", null).not("contentid", "ilike", "a%");
  if (cursor != null) query = query.gt("place_id", cursor).order("place_id", { ascending: true });
  const { data, error } = await query;
  if (error) return { error: `tb_place 조회 실패: ${error.message}` };
  return { data: (data ?? []) as T[] };
}

// ── 2. tb_place_detail 동기화 (detailCommon2 + detailIntro2) ─
// cursor: 지난 체이닝 호출까지 처리한 마지막 place_id. 이보다 큰 place_id부터 오름차순으로
// 이어서 처리한다 — 매일 자정 새 트리거는 cursor 없이(0) 시작해 처음부터 다시 돈다.
async function syncDetail(
  supabase: SupabaseClient,
  deadline: number,
  cursor = 0
): Promise<SyncOutcome> {
  // place_id 는 tb_place 에서 가져와 그대로 tb_place_detail 에 넣는다(detail 의 PK).
  // cursor보다 큰 place_id만, 오름차순으로 DB 쿼리 단계에서 이미 걸러져서 온다. 오늘 이미
  // 끝(cursor가 최댓값을 넘어섬)까지 갔으면 빈 목록이 와서 이번 회차는 곧바로 끝난다(다음날
  // 새 트리거 전까지 계속 그렇다).
  const places = await fetchActivePlaces<{
    place_id: number | null;
    contentid: number | null;
    contenttypeid: string | null;
  }>(supabase, "place_id, contentid, contenttypeid", true, cursor);
  if ("error" in places) return { ok: false, status: 502, error: places.error };
  const targets = places.data.filter(
    (p): p is { place_id: number; contentid: number; contenttypeid: string | null } =>
      p.contentid != null && p.place_id != null
  );

  let fetched = 0;
  let skipped = 0;
  let notDone = false;
  let nextCursor = cursor;
  const errors: { contentid: number; message: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const { place_id, contentid, contenttypeid } of targets) {
    if (Date.now() >= deadline) {
      notDone = true;
      break;
    }
    nextCursor = place_id; // 성공/스킵/에러와 무관하게, 이 항목을 시도했으면 커서를 여기로 옮긴다
    try {
      const commonRes = await withRetry(() =>
        korTourInfoApi.detailCommon<TourResponse>({
          MobileOS: "WEB",
          contentId: String(contentid)
        })
      );
      const common = pickItem(commonRes);
      if (!common) {
        skipped += 1; // 공통정보가 없으면 건너뜀
        await sleep(REQUEST_DELAY);
        continue;
      }

      let intro: Record<string, unknown> | null = null;
      if (contenttypeid) {
        await sleep(REQUEST_DELAY);
        const introRes = await withRetry(() =>
          korTourInfoApi.detailIntro<TourResponse>({
            MobileOS: "WEB",
            contentId: String(contentid),
            contentTypeId: String(contenttypeid)
          })
        );
        intro = pickItem(introRes);
      }

      fetched += 1;
      const row: Record<string, unknown> = { place_id, contentid };
      for (const f of COMMON_FIELDS) row[f] = str(common[f]);
      for (const f of INTRO_FIELDS) row[f] = str(intro?.[f]);
      rows.push(row);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(
        `[syncDetail] detailCommon2/detailIntro2 실패 (contentid=${contentid}): ${message}`
      );
      errors.push({ contentid, message });
    }
    await sleep(REQUEST_DELAY);
  }

  // detail 은 PK(place_id) 기준으로 분류·upsert 한다(contentid 에 unique 제약이 없음).
  const known = await fetchKnownIds(supabase, "tb_place_detail", "place_id");
  if ("error" in known) {
    return {
      ok: false,
      status: 502,
      error: known.error,
      partial: { totalPlaces: targets.length, fetched, upserted: 0, skipped }
    };
  }
  const io = await insertOrUpdate(supabase, "tb_place_detail", rows, known, now, "place_id");
  if (io.error) {
    return {
      ok: false,
      status: 502,
      error: io.error,
      partial: { totalPlaces: targets.length, fetched, upserted: io.upserted, skipped }
    };
  }
  const upserted = io.upserted;

  // API 가 더는 확인해 주지 않는 행은 삭제하지 않고 그대로 둔다. 삭제 상태는 부모
  // tb_place 의 delete_yn 으로만 관리하며(화면은 delete_yn='N' 만 노출), 부모가 걸러지면
  // 남은 자식 행은 조회에 노출되지 않아 무해하다.
  return {
    ok: true,
    result: {
      totalPlaces: targets.length,
      fetched,
      upserted,
      deleted: 0,
      skipped,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      notDone,
      nextCursor
    }
  };
}

// ── 2-1. tb_place_detail → tb_place_detail_normalized 정규화 이관 ─
// tb_place_detail 과 이름이 같은 컬럼 데이터를 그대로 tb_place_detail_normalized 로 복사한다.
// (정규화 테이블에만 새로 생긴 accommin/accommax/agerange/agemin/agemax 는 아직 채우지 않는다.)
const NORMALIZED_COPY_COLUMNS = [
  "place_id",
  "contentid",
  "contenttypeid",
  "homepage",
  "tel",
  "overview",
  "accomcount",
  "scale",
  "openperiod",
  "opendate",
  "useseason",
  "usetime",
  "eventstartdate",
  "eventenddate",
  "checkintime",
  "checkouttime",
  "spendtime",
  "restdate",
  "schedule",
  "infocenter",
  "usefee",
  "discountinfo",
  "parking",
  "parkingfee",
  "chkbabycarriage",
  "eventhomepage",
  "eventplace",
  "placeinfo",
  "program",
  "distance",
  "theme",
  "pickup",
  "roomcount",
  "reservationlodging",
  "reservationurl",
  "roomtype",
  "restroom",
  "saleitem",
  "saleitemcost",
  "shopguide",
  "firstmenu",
  "seat",
  "treatmenu",
  "createdtime",
  "modifiedtime"
] as const;

// 수용인원 원본 컬럼(우선순위 순) — 한 행에 하나만 채워져 있으므로 첫 non-empty 를 accomcount 로 모은다.
const ACCOM_SOURCE_COLUMNS = [
  "accomcount",
  "accomcountculture",
  "accomcountleports",
  "accomcountlodging"
] as const;

// 연령 원본 컬럼(우선순위 순) — 첫 non-empty 를 agerange 로 모은다.
const AGERANGE_SOURCE_COLUMNS = ["expagerange", "expagerangeleports", "agelimit"] as const;

// 유모차 대여 원본 컬럼(우선순위 순) — 병합 후 boolean 으로 변환한다.
const CHKBABY_SOURCE_COLUMNS = [
  "chkbabycarriage",
  "chkbabycarriageculture",
  "chkbabycarriageleports",
  "chkbabycarriageshopping"
] as const;

// 텍스트 원본만 통합하는 패밀리 (정규 컬럼 ← 변형 컬럼들). 한 행에 하나만 채워지므로
// 첫 non-empty 를 정규 컬럼에 그대로 모으고, 변형 컬럼은 upsert 전에 제거한다.
const MERGE_FAMILIES: Record<string, readonly string[]> = {
  scale: ["scalelodging", "scaleleports", "scaleshopping", "scalefood"],
  opendate: ["opendateshopping", "opendatefood"],
  usetime: ["usetimeculture", "usetimeleports", "opentime", "opentimefood", "playtime"],
  spendtime: ["spendtimefestival", "taketime"],
  restdate: ["restdateculture", "restdateleports", "restdateshopping", "restdatefood"],
  infocenter: [
    "infocenterculture",
    "infocentertourcourse",
    "infocenterleports",
    "infocenterlodging",
    "infocentershopping",
    "infocenterfood"
  ],
  usefee: ["usefeeleports", "usetimefestival"], // usetimefestival 은 실제로 요금 데이터라 usefee 로 병합
  discountinfo: ["discountinfofestival", "discountinfofood"],
  parking: ["parkingculture", "parkingleports", "parkinglodging", "parkingshopping", "parkingfood"],
  parkingfee: ["parkingfeeleports"]
};
const MERGE_VARIANT_COLUMNS = Object.values(MERGE_FAMILIES).flat();

// 수용인원 텍스트에서 최소/최대 인원을 추출한다. (규칙)
//  1) "숫자" 또는 "숫자+명" 으로만 된 값 → max 에만 넣는다.
//  2) 하한(min): "최소 N" / "N 이상"→N / "N 초과"→N+1 (초과는 경계 미포함이라 +1)
//  3) 상한(max): "최대 N" / "N 이하"→N / "N 미만"→N-1 (미만은 경계 미포함이라 -1)
//  4) "A~B" (~ 포함) → min=A, max=B
//  위 규칙에 해당 안 되는 값(예: 시설별 나열)은 {null, null}.
function parseAccomRange(text: string): { min: number | null; max: number | null } {
  const t = (text ?? "").trim();
  const toInt = (s: string) => parseInt(s.replace(/,/g, ""), 10);
  let min: number | null = null;
  let max: number | null = null;

  // 4) 범위 "A~B" (A 뒤 인/명 유무, B 앞 '최대' 등 텍스트 허용)
  if (t.includes("~")) {
    const m = t.match(/(\d[\d,]*)\s*여?\s*[인명]?\s*~\s*[^\d]*(\d[\d,]*)/);
    if (m) {
      min = toInt(m[1]);
      max = toInt(m[2]);
    }
  }
  // 2) 하한(min): "최소 N"(키워드 앞) 또는 "N 이상/초과"(키워드 뒤, 초과는 +1)
  const mMinBefore = t.match(/최소\s*(\d[\d,]*)/);
  if (mMinBefore) {
    min = toInt(mMinBefore[1]);
  } else {
    const m = t.match(/(\d[\d,]*)\s*여?\s*[인명]?\s*(이상|초과)/);
    if (m) min = toInt(m[1]) + (m[2] === "초과" ? 1 : 0);
  }
  // 3) 상한(max): "최대 N"(키워드 앞) 또는 "N 이하/미만"(키워드 뒤, 미만은 -1)
  const mMaxBefore = t.match(/최대\s*(\d[\d,]*)/);
  if (mMaxBefore) {
    max = toInt(mMaxBefore[1]);
  } else {
    const m = t.match(/(\d[\d,]*)\s*여?\s*[인명]?\s*(이하|미만)/);
    if (m) max = toInt(m[1]) - (m[2] === "미만" ? 1 : 0);
  }
  // 1) "숫자" 또는 "숫자+명" 으로만 된 경우 → max
  if (min == null && max == null && /^\d[\d,]*\s*여?\s*명?$/.test(t)) {
    max = toInt(t);
  }

  return { min, max };
}

// 연령(agerange) 텍스트에서 최소/최대 나이(세)를 추출한다. parseAccomRange 와 같은 방식.
//  - 하한(min): "최소 N" / "N세 이상"→N / "N세 초과"→N+1
//  - 상한(max): "최대 N" / "N세 이하"→N / "N세 미만"→N-1
//  - "A세~B세" (~ 포함) → min=A, max=B
//  - "전 연령" 등 숫자/키워드 없으면 {null, null}. ('만'은 무시하고 세 앞 숫자만 사용)
function parseAgeRange(text: string): { min: number | null; max: number | null } {
  const t = (text ?? "").trim();
  const toInt = (s: string) => parseInt(s.replace(/,/g, ""), 10);
  let min: number | null = null;
  let max: number | null = null;

  // 범위 "A세~B세"
  if (t.includes("~")) {
    const m = t.match(/(\d[\d,]*)\s*세?\s*~\s*[^\d]*(\d[\d,]*)/);
    if (m) {
      min = toInt(m[1]);
      max = toInt(m[2]);
    }
  }
  // 하한(min): "최소 N" 또는 "N세 이상/초과"(초과는 +1)
  const mMinBefore = t.match(/최소\s*(\d[\d,]*)/);
  if (mMinBefore) {
    min = toInt(mMinBefore[1]);
  } else {
    const m = t.match(/(\d[\d,]*)\s*세?\s*(이상|초과)/);
    if (m) min = toInt(m[1]) + (m[2] === "초과" ? 1 : 0);
  }
  // 상한(max): "최대 N" 또는 "N세 이하/미만"(미만은 -1)
  const mMaxBefore = t.match(/최대\s*(\d[\d,]*)/);
  if (mMaxBefore) {
    max = toInt(mMaxBefore[1]);
  } else {
    const m = t.match(/(\d[\d,]*)\s*세?\s*(이하|미만)/);
    if (m) max = toInt(m[1]) - (m[2] === "미만" ? 1 : 0);
  }

  return { min, max };
}

// 유모차 대여 텍스트를 boolean 으로 변환한다.
//  "가능"→true, "없음"/"불가(능)"→false, 그 외·빈값→null(정보 없음).
//  ("불가능"은 "가능"을 포함하므로 false 판정을 먼저 한다.)
function parseBabyCarriage(text: string): boolean | null {
  const t = (text ?? "").trim();
  if (t === "") return null;
  if (t.includes("없음") || t.includes("불가")) return false;
  if (t.includes("가능")) return true;
  return null;
}

// 휴무일(restdate) 텍스트에서 파생 컬럼 3개를 추출한다. 원본 restdate 는 그대로 유지.
//  - closed_weekdays(smallint[]): 매주 반복 휴무 요일 (ISO 1=월 … 7=일). "매주 월요일"→{1}, "주말"→{6,7}
//  - closed_holiday(boolean): 명절·설날·추석·법정공휴일 휴무 여부
//  - has_irregular_closing(boolean): 월N회/격주/N째주/점포별 상이 등 → 특정 날짜 판정 불가.
//    값이 있는데 어떤 규칙에도 안 걸리는 경우(전화문의 요망 등)도 판정 불가로 true.
//  - "연중무휴" → 요일 null + 두 boolean 모두 false (휴무 없음 확정)
//  - 빈값 → 모두 null (정보 없음)
export function parseRestdate(text: string): {
  closedWeekdays: number[] | null;
  closedHoliday: boolean | null;
  hasIrregularClosing: boolean | null;
} {
  const raw = (text ?? "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (raw === "") return { closedWeekdays: null, closedHoliday: null, hasIrregularClosing: null };

  const WEEKDAY: Record<string, number> = { 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6, 일: 7 };

  const holiday = /명절|설날|추석|설\s*[·,]?\s*추석|공휴일/.test(raw);
  const irregular =
    /월\s*\d\s*회|격주|격월|(첫|둘|셋|넷|다섯)\s*번?째|\d\s*(,\s*\d\s*)*주|정기\s*휴|점포\s*별|공연\s*(마다|별)|백화점\s*휴|상이/.test(
      raw
    );

  // 부정기 표현(N째 주/N주/격주)에 붙은 요일은 "매주 휴무"가 아니므로 제거한 뒤 요일을 추출한다.
  // (예: "2,4주 일요일" 의 일요일을 매주 휴무로 오인하지 않도록)
  const stripped = raw
    .replace(
      /(첫|둘|셋|넷|다섯)\s*번?째\s*(주\s*)?[월화수목금토일]요일?(\s*[~-]\s*[월화수목금토일]요일?)?/g,
      " "
    )
    .replace(/\d\s*(,\s*\d\s*)*주\s*[월화수목금토일]요일?(\s*[~-]\s*[월화수목금토일]요일?)?/g, " ")
    .replace(/격주\s*[월화수목금토일]요일?/g, " ");

  const days = new Set<number>();
  // 요일 범위 "월요일~화요일" (일→월처럼 주 경계를 넘는 범위도 순환 확장)
  for (const m of stripped.matchAll(/([월화수목금토일])요일\s*[~-]\s*([월화수목금토일])요일/g)) {
    const a = WEEKDAY[m[1]];
    const b = WEEKDAY[m[2]];
    for (let i = 0; i < 7; i += 1) {
      const d = ((a - 1 + i) % 7) + 1;
      days.add(d);
      if (d === b) break;
    }
  }
  // 단일 요일 ("매주 월요일", "일요일" 등)
  for (const m of stripped.matchAll(/([월화수목금토일])요일/g)) days.add(WEEKDAY[m[1]]);
  if (/주말/.test(stripped)) {
    days.add(6);
    days.add(7);
  }

  const allYear = /연중\s*무휴/.test(raw);
  const weekdays = [...days].sort((a, b) => a - b);
  // 값이 있는데 어느 규칙에도 안 걸리면(홈페이지 참조/전화문의 등) 판정 불가로 본다.
  const nothing = !allYear && weekdays.length === 0 && !holiday && !irregular;

  return {
    closedWeekdays: weekdays.length ? weekdays : null,
    closedHoliday: holiday,
    hasIrregularClosing: irregular || nothing
  };
}

async function syncDetailNormalized(
  supabase: SupabaseClient,
  deadline: number,
  cursor = 0
): Promise<SyncOutcome> {
  // 외부 API 호출이 없는 순수 DB 읽기/변환/쓰기라 원래도 빠르다(861건 기준). 다만 앞선 단계들이
  // 시간 예산을 이미 다 썼으면 이번 호출에선 아예 건너뛰고 다음 체이닝 호출에 맡긴다.
  if (Date.now() >= deadline) {
    return {
      ok: true,
      result: {
        totalPlaces: 0,
        fetched: 0,
        upserted: 0,
        deleted: 0,
        skipped: 0,
        errorCount: 0,
        errors: [],
        notDone: true,
        nextCursor: cursor // 아무것도 안 했으니 커서를 그대로 돌려줘야 다음 회차가 안 되돌아간다
      }
    };
  }
  // tb_place_detail 전체를 동일 컬럼 + 병합용 변형 컬럼(수용인원·연령)까지 골라 조회 (페이지네이션)
  const cols = [
    ...NORMALIZED_COPY_COLUMNS,
    "accomcountculture",
    "accomcountleports",
    "accomcountlodging",
    ...AGERANGE_SOURCE_COLUMNS,
    "chkbabycarriageculture",
    "chkbabycarriageleports",
    "chkbabycarriageshopping",
    ...MERGE_VARIANT_COLUMNS
  ].join(", ");
  const rows: Record<string, unknown>[] = [];
  let from = 0;
  for (;;) {
    let query = supabase
      .from("tb_place_detail")
      .select(cols)
      .order("place_id", { ascending: true });
    if (cursor > 0) query = query.gt("place_id", cursor);
    const { data, error } = await query.range(from, from + 999);
    if (error) {
      return { ok: false, status: 502, error: `tb_place_detail 조회 실패: ${error.message}` };
    }
    rows.push(...((data ?? []) as unknown as Record<string, unknown>[]));
    if (!data || data.length < 1000) break;
    from += 1000;
  }

  // 수용인원: 변형 컬럼을 accomcount 에 원본 그대로 모으고, 최소/최대 인원을 accommin/accommax 로 추출.
  // (normalized 테이블엔 변형 컬럼이 없으므로 upsert 전에 제거한다.)
  for (const row of rows) {
    let merged = "";
    for (const c of ACCOM_SOURCE_COLUMNS) {
      const v = row[c];
      if (typeof v === "string" && v.trim() !== "") {
        merged = v;
        break;
      }
    }
    row.accomcount = merged;
    const { min, max } = parseAccomRange(merged);
    row.accommin = min; // integer 컬럼 — 숫자(또는 null) 그대로
    row.accommax = max;
    delete row.accomcountculture;
    delete row.accomcountleports;
    delete row.accomcountlodging;

    // 연령: expagerange/expagerangeleports/agelimit 를 agerange 에 원본 그대로 모은다.
    let ageMerged = "";
    for (const c of AGERANGE_SOURCE_COLUMNS) {
      const v = row[c];
      if (typeof v === "string" && v.trim() !== "") {
        ageMerged = v;
        break;
      }
    }
    row.agerange = ageMerged;
    const age = parseAgeRange(ageMerged);
    row.agemin = age.min; // integer 컬럼 — 숫자(또는 null) 그대로
    row.agemax = age.max;
    delete row.expagerange;
    delete row.expagerangeleports;
    delete row.agelimit;

    // 유모차: 원본 4개를 모두 병합(첫 non-empty)한 뒤 boolean 으로 변환
    let babyMerged = "";
    for (const c of CHKBABY_SOURCE_COLUMNS) {
      const v = row[c];
      if (typeof v === "string" && v.trim() !== "") {
        babyMerged = v;
        break;
      }
    }
    row.chkbabycarriage = parseBabyCarriage(babyMerged);
    delete row.chkbabycarriageculture;
    delete row.chkbabycarriageleports;
    delete row.chkbabycarriageshopping;

    // 나머지 패밀리: 변형 컬럼을 정규 컬럼에 원본 그대로 통합 (정규 컬럼 값 우선, 없으면 변형에서)
    for (const [canonical, variants] of Object.entries(MERGE_FAMILIES)) {
      const cur = row[canonical];
      if (!(typeof cur === "string" && cur.trim() !== "")) {
        for (const v of variants) {
          const val = row[v];
          if (typeof val === "string" && val.trim() !== "") {
            row[canonical] = val;
            break;
          }
        }
      }
      for (const v of variants) delete row[v];
    }

    // 휴무일: 병합된 restdate 원본은 그대로 두고, 파생 컬럼 3개를 채운다.
    const rest = parseRestdate(typeof row.restdate === "string" ? row.restdate : "");
    row.closed_weekdays = rest.closedWeekdays; // smallint[] — number[] (또는 null) 그대로
    row.closed_holiday = rest.closedHoliday;
    row.has_irregular_closing = rest.hasIrregularClosing;
  }

  // place_id(PK) 기준으로 insert/update 분류해 tb_place_detail_normalized 로 upsert.
  // detail/barrierfree 와 동일하게 place_id 오름차순 고정 진행 — cursor보다 큰 것만 DB 쿼리
  // 단계에서 이미 걸러져서 온다. 시간 예산(deadline) 넘기면 그 자리에서 멈춘다.
  const now = new Date().toISOString();
  const known = await fetchKnownIds(supabase, "tb_place_detail_normalized", "place_id");
  if ("error" in known) {
    return { ok: false, status: 502, error: known.error };
  }
  let upserted = 0;
  let processed = 0;
  let nextCursor = cursor;
  const errors: string[] = [];
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    if (Date.now() >= deadline) break;
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    const io = await insertOrUpdate(
      supabase,
      "tb_place_detail_normalized",
      chunk,
      known,
      now,
      "place_id"
    );
    upserted += io.upserted;
    processed += chunk.length;
    nextCursor = chunk[chunk.length - 1].place_id as number;
    if (io.error) errors.push(io.error);
  }
  const notDone = processed < rows.length;

  if (errors.length > 0) {
    return {
      ok: false,
      status: 502,
      error: errors.join(" / "),
      partial: { totalPlaces: rows.length, fetched: processed, upserted, skipped: 0 }
    };
  }

  return {
    ok: true,
    result: {
      totalPlaces: rows.length,
      fetched: processed,
      upserted,
      deleted: 0,
      skipped: 0,
      errorCount: 0,
      errors: [],
      notDone,
      nextCursor
    }
  };
}

// ── 3. tb_place_barrierfree 동기화 (detailWithTour2) ────────
// cursor: syncDetail 과 동일한 방식 — place_id 오름차순 고정 진행, 매일 자정 새 트리거는
// cursor 없이 처음부터 다시 돈다.
async function syncBarrierfree(
  supabase: SupabaseClient,
  deadline: number,
  cursor = 0
): Promise<SyncOutcome> {
  // place_id 는 tb_place 에서 가져와 그대로 tb_place_barrierfree 에 넣는다(barrierfree 의 PK).
  // cursor보다 큰 place_id만, 오름차순으로 DB 쿼리 단계에서 이미 걸러져서 온다.
  const places = await fetchActivePlaces<{
    place_id: number | null;
    contentid: number | null;
  }>(supabase, "place_id, contentid", true, cursor);
  if ("error" in places) return { ok: false, status: 502, error: places.error };
  const targets = places.data.filter(
    (p): p is { place_id: number; contentid: number } => p.contentid != null && p.place_id != null
  );

  let fetched = 0;
  let skipped = 0;
  let notDone = false;
  let nextCursor = cursor;
  const errors: { contentid: number; message: string }[] = [];
  const rows: Record<string, unknown>[] = [];
  const now = new Date().toISOString();

  for (const { place_id, contentid } of targets) {
    if (Date.now() >= deadline) {
      notDone = true;
      break;
    }
    nextCursor = place_id;
    try {
      const res = await withRetry(() =>
        brfrTourInfoApi.detailWithTour<TourResponse>({
          MobileOS: "ETC",
          contentId: String(contentid),
          numOfRows: "1",
          pageNo: "1"
        })
      );
      const item = pickItem(res);
      if (!item) {
        skipped += 1; // 무장애 정보가 없는 콘텐츠는 건너뜀
      } else {
        fetched += 1;
        const row: Record<string, unknown> = { place_id, contentid };
        for (const field of BF_FIELDS) {
          const value = item[field];
          row[field] = typeof value === "string" ? value : "";
        }
        // 원본 컬럼을 채운 뒤 요약 플래그(has_blind/deaf/gait/infant) 계산
        Object.assign(row, computeBfFlags(row));
        rows.push(row);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[syncBarrierfree] detailWithTour2 실패 (contentid=${contentid}): ${message}`);
      errors.push({ contentid, message });
    }
    await sleep(REQUEST_DELAY);
  }

  // barrierfree 는 PK(place_id) 기준으로 분류·upsert 한다(contentid 에 unique 제약이 없음).
  const known = await fetchKnownIds(supabase, "tb_place_barrierfree", "place_id");
  if ("error" in known) {
    return {
      ok: false,
      status: 502,
      error: known.error,
      partial: { totalPlaces: targets.length, fetched, upserted: 0, skipped }
    };
  }
  const io = await insertOrUpdate(supabase, "tb_place_barrierfree", rows, known, now, "place_id");
  if (io.error) {
    return {
      ok: false,
      status: 502,
      error: io.error,
      partial: { totalPlaces: targets.length, fetched, upserted: io.upserted, skipped }
    };
  }
  const upserted = io.upserted;

  // API 가 더는 확인해 주지 않는 행은 삭제하지 않고 그대로 둔다. 삭제 상태는 부모
  // tb_place 의 delete_yn 으로만 관리하며(화면은 delete_yn='N' 만 노출), 부모가 걸러지면
  // 남은 자식 행은 조회에 노출되지 않아 무해하다.
  return {
    ok: true,
    result: {
      totalPlaces: targets.length,
      fetched,
      upserted,
      deleted: 0,
      skipped,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      notDone,
      nextCursor
    }
  };
}

// ── 4. tb_place_bakery 동기화 (bakeries/info) ───────────────
// 행정안전부 제과점영업 조회서비스에서 대전광역시(영업 상태) 제과점을 전부 조회해
// bplc_nm(상호명) 기준으로 tb_place_bakery 와 동기화한다. tb_place 에 의존하지 않는
// 독립 테이블이라 place_id/contentid 대신 상호명을 매칭 키로 쓴다. (tb_place 와 동일 정책)
//  - API 에만 있으면 insert
//  - 양쪽에 있으면 변경 여부와 무관하게 update (+ updatetime 갱신, delete_yn='N' 복구)
//  - DB 에만 있으면 소프트삭제(delete_yn='Y', deletetime 갱신)
// 응답 컬럼은 대문자(BPLC_NM 등)로 오므로 소문자 컬럼으로 매핑하고, 테이블에 실제로
// 존재하는 컬럼만 넣는다.
// bakeries/info 한 페이지 조회 건수 — 예전엔 100이라 95페이지 넘게 순회하다 API 요청 한도(403)에
// 걸려 아예 못 끝났다. 페이지 크기를 areaBasedList2 와 같은 수준(1000)으로 키워서 요청 자체를
// 크게 줄인다(다른 tour 계열 API 도 같은 최대치를 쓰는 걸 확인해서 맞춤).
const BAKERY_NUM_OF_ROWS = 1000;
const BAKERY_COND_SALS_STTS = "01"; // 영업 상태 코드
const BAKERY_COND_ROAD_ADDR = "대전광역시"; // 도로명주소 LIKE 필터

// API(대문자) → DB(소문자) 매핑 컬럼 (테이블에 존재하는 컬럼만)
const BAKERY_FIELD_MAP: Record<string, string> = {
  bplc_nm: "BPLC_NM",
  road_nm_addr: "ROAD_NM_ADDR",
  lotno_addr: "LOTNO_ADDR",
  dat_updt_pnt: "DAT_UPDT_PNT",
  dat_updt_se: "DAT_UPDT_SE"
};

// 일반 문자열 정규화 (null/undefined → "", 앞뒤 공백 제거)
const normStr = (v: unknown): string => (v == null ? "" : String(v)).trim();

type BakeryRow = {
  bplc_nm: string;
  road_nm_addr: string;
  lotno_addr: string;
  dat_updt_pnt: string;
  dat_updt_se: string;
};

// API item(대문자) → DB row(소문자). 매핑 컬럼만 담는다. 상호명이 없으면 null.
function toBakeryRow(item: Record<string, unknown>): BakeryRow | null {
  const bplc_nm = normStr(item[BAKERY_FIELD_MAP.bplc_nm]);
  if (!bplc_nm) return null;
  return {
    bplc_nm,
    road_nm_addr: normStr(item[BAKERY_FIELD_MAP.road_nm_addr]),
    lotno_addr: normStr(item[BAKERY_FIELD_MAP.lotno_addr]),
    dat_updt_pnt: normStr(item[BAKERY_FIELD_MAP.dat_updt_pnt]),
    dat_updt_se: normStr(item[BAKERY_FIELD_MAP.dat_updt_se])
  };
}

// 제과점은 결과 형태가 tour 계열(SyncResult)과 달라 별도 타입을 쓴다.
type BakerySyncResult = {
  totalCount: number;
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  errorCount: number;
  errors: unknown[];
  // true 면 시간 예산(deadline)을 넘겨서 페이지 조회를 중간에 멈췄다는 뜻.
  notDone?: boolean;
};

type BakerySyncOutcome =
  | { ok: true; result: BakerySyncResult }
  | { ok: false; status: number; error: string; partial?: Record<string, unknown> };

async function syncBakery(supabase: SupabaseClient, deadline: number): Promise<BakerySyncOutcome> {
  // 1) API 전체 페이지 조회 (대전광역시 / 영업). 응답 봉투는 tour 계열과 동일해
  //    TourResponse / extractItems 를 재사용한다.
  const errors: { page: number; message: string }[] = [];
  const apiRows = new Map<string, BakeryRow>(); // bplc_nm → row (중복 상호명은 마지막 것 유지)
  let totalCount = Infinity;
  let pageNo = 1;
  let fetched = 0;
  let pagesNotDone = false;

  while ((pageNo - 1) * BAKERY_NUM_OF_ROWS < totalCount) {
    if (Date.now() >= deadline) {
      pagesNotDone = true;
      break;
    }
    try {
      const res = await withRetry(() =>
        bakeryInfoApi.info<TourResponse>({
          pageNo: String(pageNo),
          numOfRows: String(BAKERY_NUM_OF_ROWS),
          "cond[SALS_STTS_CD::EQ]": BAKERY_COND_SALS_STTS,
          "cond[ROAD_NM_ADDR::LIKE]": BAKERY_COND_ROAD_ADDR
        })
      );
      totalCount = Number(res?.response?.body?.totalCount ?? 0);
      const items = extractItems(res);
      if (items.length === 0) break;
      for (const item of items) {
        const row = toBakeryRow(item);
        if (!row) continue;
        fetched += 1;
        apiRows.set(row.bplc_nm, row);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      console.error(`[syncBakery] bakeries/info 실패 (pageNo=${pageNo}): ${message}`);
      errors.push({ page: pageNo, message });
    }
    pageNo += 1;
    await sleep(REQUEST_DELAY);
  }

  // 2) DB 기존 행 조회 (분류/삭제 판정용) — 상호명 존재 여부와 활성 상태만 필요
  const { data: existing, error: existErr } = await supabase
    .from("tb_place_bakery")
    .select("bplc_nm, delete_yn");
  if (existErr) {
    return {
      ok: false,
      status: 502,
      error: `tb_place_bakery 기존 목록 조회 실패: ${existErr.message}`
    };
  }
  // knownNames: 이미 존재하는 상호명(insert/update 분류용, 소프트삭제된 행 포함)
  // activeNames: 활성 상호명(API 에 없을 때 소프트삭제 대상 판정용)
  const knownNames = new Set<string>();
  const activeNames = new Set<string>();
  for (const r of (existing ?? []) as { bplc_nm: unknown; delete_yn: string | null }[]) {
    const name = normStr(r.bplc_nm);
    if (!name) continue;
    knownNames.add(name);
    if (r.delete_yn == null || r.delete_yn === "N") activeNames.add(name);
  }

  const now = new Date().toISOString();

  // 3) insert / update 분류 — 변경 여부는 보지 않는다(존재하면 무조건 update)
  const toInsert: BakeryRow[] = [];
  const toUpdate: BakeryRow[] = [];
  for (const [name, apiRow] of apiRows) {
    if (knownNames.has(name)) toUpdate.push(apiRow);
    else toInsert.push(apiRow);
  }

  // 4) insert (배치) — registtime/updatetime/delete_yn 은 DB default(now()/null/'N')에 맡긴다.
  //    청크 하나가 실패해도(예: 특정 행의 데이터 문제) 나머지 insert/update/삭제 단계는 계속
  //    진행한다 — 예전엔 첫 실패에서 바로 return 해버려서, 신규 항목 하나가 계속 insert 에
  //    실패하면 기존 618건의 update(예: updatetime 갱신)까지 매번 통째로 안 도는 문제가 있었다.
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += UPSERT_CHUNK) {
    const chunk = toInsert.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase.from("tb_place_bakery").insert(chunk);
    if (error) {
      errors.push({ page: -1, message: `insert 실패(${i}~${i + chunk.length}): ${error.message}` });
      continue;
    }
    inserted += chunk.length;
  }

  // 5) update (존재하는 상호명 전부, bplc_nm 기준) — updatetime 갱신 + delete_yn='N' 복구
  //    (예전에 API 에서 빠져 소프트삭제됐다가 다시 등장한 제과점이 자동 복구된다.)
  let updated = 0;
  for (const row of toUpdate) {
    const { error } = await supabase
      .from("tb_place_bakery")
      .update({
        road_nm_addr: row.road_nm_addr,
        lotno_addr: row.lotno_addr,
        dat_updt_pnt: row.dat_updt_pnt,
        dat_updt_se: row.dat_updt_se,
        updatetime: now,
        delete_yn: "N",
        deletetime: null
      })
      .eq("bplc_nm", row.bplc_nm);
    if (error) {
      errors.push({ page: -1, message: `update 실패(${row.bplc_nm}): ${error.message}` });
      continue;
    }
    updated += 1;
  }

  // 6) 소프트 삭제 — API 결과에 없는 활성 DB 행 (delete_yn='Y', deletetime 갱신).
  //    페이지 오류·시간 예산 초과·insert/update 실패가 있었으면 목록이 불완전할 수 있어 건너뛴다.
  let deleted = 0;
  if (errors.length === 0 && !pagesNotDone) {
    const toDelete = [...activeNames].filter((name) => !apiRows.has(name));
    for (let i = 0; i < toDelete.length; i += UPSERT_CHUNK) {
      const chunk = toDelete.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from("tb_place_bakery")
        .update({ delete_yn: "Y", deletetime: now })
        .in("bplc_nm", chunk);
      if (error) {
        errors.push({
          page: -1,
          message: `삭제 처리 실패(${i}~${i + chunk.length}): ${error.message}`
        });
        continue;
      }
      deleted += chunk.length;
    }
  }

  return {
    ok: true,
    result: {
      totalCount: Number.isFinite(totalCount) ? totalCount : fetched,
      fetched,
      inserted,
      updated,
      deleted,
      errorCount: errors.length,
      errors: errors.slice(0, 20),
      notDone: pagesNotDone
    }
  };
}

// ── 동기화 대상 디스패치 ────────────────────────────────────
export const SYNC_FNS = {
  place: syncPlace,
  detail: syncDetail,
  barrierfree: syncBarrierfree,
  bakery: syncBakery,
  normalize: syncDetailNormalized
} as const;
export type SyncTarget = keyof typeof SYNC_FNS;

export function isSyncTarget(target: string): target is SyncTarget {
  return target in SYNC_FNS;
}

// SYNC_FNS[target](supabase, deadline, cursor) 로 바로 호출하면, place/bakery 는 cursor
// 인자를 안 받는 함수라 유니언 호출 타입 검사를 통과 못한다. cursor 를 지원하는 대상만
// 실어 보내는 디스패처를 따로 둔다.
export function runSyncTarget(
  supabase: SupabaseClient,
  target: SyncTarget,
  deadline: number,
  cursor: number
): Promise<SyncOutcome | BakerySyncOutcome> {
  switch (target) {
    case "detail":
      return syncDetail(supabase, deadline, cursor);
    case "barrierfree":
      return syncBarrierfree(supabase, deadline, cursor);
    case "normalize":
      return syncDetailNormalized(supabase, deadline, cursor);
    case "place":
      return syncPlace(supabase, deadline);
    case "bakery":
      return syncBakery(supabase, deadline);
  }
}

// SyncOutcome → 응답에 실을 값(성공이면 result, 실패면 error/partial)으로 평탄화.
// bakery 는 결과 형태가 달라 BakerySyncOutcome 도 함께 받는다.
function outcomeToJson(
  outcome: SyncOutcome | BakerySyncOutcome
): Record<string, unknown> | SyncResult | BakerySyncResult {
  return outcome.ok ? outcome.result : { error: outcome.error, partial: outcome.partial };
}

// ── 전체 동기화 (스케줄러/전체 동기화 공용) ─────────────────
// 의존 순서상 tb_place 를 먼저 채운 뒤(자식 테이블이 place_id/contentid 를 참조),
// 서로 독립인 detail / barrierfree 는 병렬로 실행한다.
// tb_place_bakery 는 tb_place 에 의존하지 않으므로 place 시작과 동시에 병렬로 돌린다.
// detail/barrierfree/bakery가 normalize와 같은 deadline을 그대로 공유하면, 셋 다 시간 예산이
// 남아있는 한(=처리할 대상이 아직 많이 남아있는 한) deadline 딱 그 순간까지 계속 돌다가 끝나서
// normalize에게는 매번 남는 시간이 0에 가까워진다 — 그러면 normalize는 회차마다 시작하자마자
// "이미 시간 다 됐음"으로 아무 일도 안 하고 끝나버려서, detail/barrierfree가 완전히 다 따라잡기
// 전까지는 영원히 진행이 안 된다(실제로 이 증상이 관측됐다: normalize가 매 회차 0건). normalize
// 몫으로 시간을 미리 떼어두고, detail/barrierfree/bakery는 그보다 앞당긴 시각까지만 돌게 한다.
const NORMALIZE_RESERVED_MS = 8_000;

// place/bakery 는 커서 없이 매번 전체를 다시 조회하는 구조라, 짧은 간격(예: 1분)으로 하루 종일
// 반복 호출되면 detail/barrierfree 가 아직 진행 중인 동안에도 회차마다 계속 전체를 재조회하게
// 된다 — API 호출 낭비이자 회차당 시간 예산도 깎아먹는다. 이미 그날 한 번 끝났으면
// skipPlace/skipBakery 로 건너뛸 수 있게 한다(호출 쪽에서 DB에 저장된 완료 여부로 판단).
function skippedOutcome(): SyncOutcome {
  return {
    ok: true,
    result: {
      totalPlaces: 0,
      fetched: 0,
      upserted: 0,
      deleted: 0,
      skipped: 0,
      errorCount: 0,
      errors: [],
      notDone: false
    }
  };
}

function skippedBakeryOutcome(): BakerySyncOutcome {
  return {
    ok: true,
    result: {
      totalCount: 0,
      fetched: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      errorCount: 0,
      errors: [],
      notDone: false
    }
  };
}

export async function runFullSync(
  supabase: SupabaseClient,
  deadline: number,
  cursors: { detail?: number; barrierfree?: number; normalize?: number } = {},
  options: { skipPlace?: boolean; skipBakery?: boolean } = {}
): Promise<
  Record<
    "place" | "detail" | "barrierfree" | "bakery" | "normalize",
    Record<string, unknown> | SyncResult | BakerySyncResult
  >
> {
  const innerDeadline = deadline - NORMALIZE_RESERVED_MS;

  // 0) tb_place 와 무관한 bakery 동기화를 먼저 시작(await 하지 않고 병렬 진행)
  const bakeryPromise = options.skipBakery
    ? Promise.resolve(skippedBakeryOutcome())
    : syncBakery(supabase, innerDeadline);

  // 1) 원본 테이블 tb_place 선행 동기화
  let placeOutcome: SyncOutcome;
  if (options.skipPlace) {
    console.log("[sync] tb_place 오늘 이미 완료 — 건너뜀");
    placeOutcome = skippedOutcome();
  } else {
    console.log("[sync] tb_place 동기화 시작");
    placeOutcome = await syncPlace(supabase, deadline);
    console.log("[sync] tb_place 완료 → detail/barrierfree 병렬 시작");
  }

  // 2) tb_place_detail / tb_place_barrierfree 병렬 동기화 (서로 독립) + bakery 수거.
  //    셋 다 같은 innerDeadline 을 공유한다 — 각자 그 시각이 되면 알아서 중단하고 notDone 을 남긴다.
  const [detailOutcome, barrierfreeOutcome, bakeryOutcome] = await Promise.all([
    syncDetail(supabase, innerDeadline, cursors.detail ?? 0),
    syncBarrierfree(supabase, innerDeadline, cursors.barrierfree ?? 0),
    bakeryPromise
  ]);
  console.log("[sync] detail/barrierfree/bakery 이번 회차 종료");

  // 3) detail 이 오늘 몫을 "전부" 끝낸 뒤에만 정규화한다 (tb_place_detail → tb_place_detail_normalized).
  //    normalize 는 외부 API 호출이 없는 순수 DB 작업이라 detail 보다 훨씬 빠르다. detail 이 아직
  //    진행 중인데 같이 돌리면 normalize 가 먼저 테이블 끝까지 완주해버리고(notDone=false), 그 뒤
  //    회차에서 detail 이 새로 써넣는 행은 아무도 정규화하지 않아 normalized 테이블이 영구히 하루
  //    뒤처진다. detail 이 끝난 회차부터 normalize 가 자기 커서로 이어서 돌면 그 문제가 없다.
  const detailDone = detailOutcome.ok && detailOutcome.result.notDone !== true;
  const normalizeCursor = cursors.normalize ?? 0;
  let normalizeOutcome: SyncOutcome;
  if (detailDone) {
    normalizeOutcome = await syncDetailNormalized(supabase, deadline, normalizeCursor);
    console.log("[sync] detail_normalized 정규화 완료");
  } else {
    console.log("[sync] detail 미완료 → detail_normalized 정규화 건너뜀");
    normalizeOutcome = {
      ok: true,
      result: {
        totalPlaces: 0,
        fetched: 0,
        upserted: 0,
        deleted: 0,
        skipped: 0,
        errorCount: 0,
        errors: [],
        notDone: true, // detail 이 끝나면 그때부터 처리해야 하므로 "남은 작업" 으로 둔다
        nextCursor: normalizeCursor
      }
    };
  }

  return {
    place: outcomeToJson(placeOutcome),
    detail: outcomeToJson(detailOutcome),
    barrierfree: outcomeToJson(barrierfreeOutcome),
    bakery: outcomeToJson(bakeryOutcome),
    normalize: outcomeToJson(normalizeOutcome)
  };
}

// ── 환경변수 확인 (스케줄러와 공용) ─────────────────────────
// 동기화에 필요한 env(관광공사 서비스키 / Supabase URL·시크릿)를 검증한다.
export function getSyncConfig():
  { ok: true; supabaseUrl: string; secretKey: string } | { ok: false; error: string } {
  const serviceKey =
    process.env.PUBLIC_DATA_OPEN_API_SERVICE_KEY ?? process.env.TOUR_API_SERVICE_KEY;
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!serviceKey) {
    return {
      ok: false,
      error: ".env에 PUBLIC_DATA_OPEN_API_SERVICE_KEY 또는 TOUR_API_SERVICE_KEY가 필요합니다."
    };
  }
  if (!supabaseUrl || !secretKey) {
    return {
      ok: false,
      error: ".env에 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SECRET_KEY가 설정되지 않았습니다."
    };
  }
  return { ok: true, supabaseUrl, secretKey };
}
