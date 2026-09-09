import { supabase } from "@/lib/supabase";
import { XMLParser } from "fast-xml-parser";
import { requireAdmin } from "@/lib/supabase/require-admin";

// tb_parking 시딩용: 공공데이터포털 대전 공영주차장 목록(getParkingInfoList)을 받아 upsert한다.
const DEFAULT_API_URL = "https://apis.data.go.kr/6300000/openapi/rest2/getParkingInfoList.do";
const PAGE_SIZE = 500;
const MAX_ATTEMPTS = 3;
// HTTP_ERROR(04), SERVICETIME_OUT(05)은 원본 제공기관 서버의 일시적 오류라 재시도하면 대부분 풀린다.
const TRANSIENT_REASON_CODES = new Set(["04", "05"]);

const parser = new XMLParser({ ignoreAttributes: false, parseTagValue: false });

type ParkingItem = Record<string, string>;

class ParkingApiError extends Error {
  status: number;
  raw: string;
  transient: boolean;

  constructor(message: string, status: number, raw: string, transient = false) {
    super(message);
    this.status = status;
    this.raw = raw;
    this.transient = transient;
  }
}

function orNull(value?: string) {
  const trimmed = (value ?? "").trim();
  if (!trimmed || trimmed.toUpperCase() === "NONE") return null;
  return trimmed;
}

function toInt(value?: string) {
  const trimmed = orNull(value);
  if (trimmed === null) return null;
  const parsed = parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function toRow(item: ParkingItem) {
  return {
    parking_id: item.PARKING_ID,
    name: item.NAME,
    lat: parseFloat(item.LAT),
    lon: parseFloat(item.LON),
    addr01: orNull(item.ADDR01),
    addr02: orNull(item.ADDR02),
    divide_num: orNull(item.DIVIDE_NUM),
    type_num: orNull(item.TYPE_NUM),
    land_level_num: orNull(item.LAND_LEVEL_NUM),
    total_parking_lot: toInt(item.TOTAL_PARKING_LOT),
    available_total_lot: toInt(item.AVAILABLE_TOTAL_LOT),
    available_res_qty: toInt(item.AVAILABLE_RES_QTY),
    restrict_code: orNull(item.RESTRICT_CODE),
    operateday_code: orNull(item.OPERATEDAY_CODE),
    weekday_open_time: orNull(item.WEEKDAY_OPEN_TIME),
    weekday_close_time: orNull(item.WEEKDAY_CLOSE_TIME),
    sat_open_time: orNull(item.SAT_OPEN_TIME),
    sat_close_time: orNull(item.SAT_CLOSE_TIME),
    holiday_open_time: orNull(item.HOLIDAY_OPEN_TIME),
    holiday_close_time: orNull(item.HOLIDAY_CLOSE_TIME),
    freecharge_basetime: toInt(item.FREECHARGE_BASETIME),
    reservation_code: orNull(item.RESERVATION_CODE),
    additional: orNull(item.ADDITIONAL)
  };
}

async function fetchParkingPage(apiUrl: string, serviceKey: string, pageNo: number) {
  const params = new URLSearchParams({
    ServiceKey: serviceKey,
    numOfRows: String(PAGE_SIZE),
    pageNo: String(pageNo)
  });

  const res = await fetch(`${apiUrl}?${params}`, { cache: "no-store" });
  const xml = await res.text();

  if (!res.ok) {
    throw new ParkingApiError(`주차장 API 호출 실패 (HTTP ${res.status})`, 502, xml);
  }

  const parsed = parser.parse(xml);

  // 인증/쿼터/일시적 오류는 <response><header> 대신 공공데이터포털 공통 오류 포맷으로 온다.
  const commonError = parsed?.OpenAPI_ServiceResponse?.cmmMsgHeader;
  if (commonError) {
    const reasonCode = String(commonError.returnReasonCode ?? "");
    throw new ParkingApiError(
      `주차장 API 오류: ${commonError.returnAuthMsg ?? commonError.errMsg ?? "알 수 없는 오류"}`,
      502,
      xml,
      TRANSIENT_REASON_CODES.has(reasonCode)
    );
  }

  const header = parsed?.response?.header;
  if (!header) {
    throw new ParkingApiError("주차장 API 응답 형식이 예상과 다릅니다.", 502, xml);
  }

  const resultCode = header.resultCode;
  if (resultCode && resultCode !== "00") {
    throw new ParkingApiError(`주차장 API 오류: ${resultCode} ${header.resultMsg ?? ""}`, 502, xml);
  }

  const totalCnt = Number(header.totalCnt) || 0;
  const raw = parsed?.response?.body?.["PARKING-LIST"]?.PARKING ?? [];
  const pageItems: ParkingItem[] = Array.isArray(raw) ? raw : raw ? [raw] : [];

  return { pageItems, totalCnt };
}

async function fetchParkingPageWithRetry(apiUrl: string, serviceKey: string, pageNo: number) {
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchParkingPage(apiUrl, serviceKey, pageNo);
    } catch (err) {
      const isLastAttempt = attempt === MAX_ATTEMPTS;
      if (!(err instanceof ParkingApiError) || !err.transient || isLastAttempt) {
        throw err;
      }
      console.error(
        `[parking/seed] 일시적 오류, ${pageNo}페이지 재시도 ${attempt}/${MAX_ATTEMPTS}:`,
        err.raw.slice(0, 500)
      );
      await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
    }
  }
  throw new Error("unreachable");
}

// 임시 진단용: 실제 서버 프로세스가 어떤 키/URL을 물고 있는지 확인 (값 자체는 마스킹).
export async function GET() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const sources: [string, string | undefined][] = [
    ["DAEJEON_PARKING_SERVICE_KEY", process.env.DAEJEON_PARKING_SERVICE_KEY],
    ["PUBLIC_DATA_OPEN_API_SERVICE_KEY", process.env.PUBLIC_DATA_OPEN_API_SERVICE_KEY],
    ["TOUR_API_SERVICE_KEY", process.env.TOUR_API_SERVICE_KEY]
  ];
  const [usedSource, usedKey] = sources.find(([, v]) => v) ?? [null, undefined];

  return Response.json({
    apiUrl: process.env.DAEJEON_PARKING_API_URL || DEFAULT_API_URL,
    usedKeySource: usedSource,
    usedKeyLength: usedKey?.length ?? 0,
    usedKeyPreview: usedKey ? `${usedKey.slice(0, 4)}...${usedKey.slice(-4)}` : null
  });
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin) return Response.json({ error: "Forbidden" }, { status: 403 });

  const serviceKey =
    process.env.DAEJEON_PARKING_SERVICE_KEY ??
    process.env.PUBLIC_DATA_OPEN_API_SERVICE_KEY ??
    process.env.TOUR_API_SERVICE_KEY;
  if (!serviceKey) {
    return Response.json(
      {
        error:
          ".env에 DAEJEON_PARKING_SERVICE_KEY 또는 PUBLIC_DATA_OPEN_API_SERVICE_KEY가 필요합니다."
      },
      { status: 500 }
    );
  }

  const apiUrl = process.env.DAEJEON_PARKING_API_URL || DEFAULT_API_URL;
  const items: ParkingItem[] = [];
  let pageNo = 1;
  let totalCnt = Infinity;

  try {
    while (items.length < totalCnt) {
      const { pageItems, totalCnt: pageTotalCnt } = await fetchParkingPageWithRetry(
        apiUrl,
        serviceKey,
        pageNo
      );
      totalCnt = pageTotalCnt || items.length;
      if (pageItems.length === 0) break;

      items.push(...pageItems);
      pageNo += 1;
    }
  } catch (err) {
    if (err instanceof ParkingApiError) {
      console.error(`[parking/seed] ${pageNo}페이지 실패:`, err.raw.slice(0, 1000));
      return Response.json(
        { error: err.message, raw: err.raw.slice(0, 500) },
        { status: err.status }
      );
    }
    throw err;
  }

  const rows = items
    .filter((item) => item.PARKING_ID && item.NAME && item.LAT && item.LON)
    .map(toRow);

  const { error, count } = await supabase
    .from("tb_parking")
    .upsert(rows, { onConflict: "parking_id", count: "exact" });

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  return Response.json({ success: true, upserted: count, total: rows.length });
}
